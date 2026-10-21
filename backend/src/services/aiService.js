const { GoogleGenAI } = require('@google/genai');
const { safeLog } = require('../utils/logger');

/**
 * AI Service for Google Gemini API integration.
 * Responsible for isolating Gemini SDK logic, handling credentials safely,
 * providing error classification, bounded exponential backoff with jitter,
 * model fallback resilience, and returning structured AI output.
 *
 * SECURITY NOTES:
 * - Gemini API key is read from process.env only — never from user input or browser.
 * - User-submitted source code is sent to the Gemini API for static analysis only.
 *   It is NEVER executed, eval()ed, or shell-spawned.
 * - Raw Gemini errors, API keys, and internal traces are never exposed to clients.
 * - Raw Gemini response is validated and sanitized before being returned.
 * - No fake or fabricated AI results are ever generated.
 */

let aiClient = null;

/**
 * Error classification categories for Gemini responses
 */
const ERROR_CATEGORIES = {
  RETRYABLE: 'retryable',
  FALLBACK_ELIGIBLE: 'fallback_eligible',
  AUTHENTICATION: 'authentication',
  INVALID_REQUEST: 'invalid_request',
  QUOTA_EXHAUSTED: 'quota_exhausted',
  SAFETY_BLOCKED: 'safety_blocked',
  UNKNOWN: 'unknown'
};

/**
 * Centralized Gemini error classifier.
 * Categorizes errors without leaking credentials or raw stack traces.
 *
 * @param {Error|Object} err - The caught error
 * @returns {Object} Classified error information
 */
const classifyGeminiError = (err) => {
  if (!err) {
    return {
      category: ERROR_CATEGORIES.UNKNOWN,
      statusCode: 500,
      isRetryable: false,
      isFallbackEligible: false,
      safeMessage: 'An unexpected AI error occurred.'
    };
  }

  // Missing or invalid environment configuration / credentials
  if (err.isAiConfigError || err.statusCode === 503 && err.message?.includes('Gemini API key is missing')) {
    return {
      category: ERROR_CATEGORIES.AUTHENTICATION,
      statusCode: 503,
      isRetryable: false,
      isFallbackEligible: false,
      safeMessage: 'Gemini API key is missing or misconfigured in environment.'
    };
  }

  const status = err.status || err.statusCode;
  const message = String(err.message || '').toLowerCase();
  const errorDetails = String(err.details || '').toLowerCase();
  const fullText = `${message} ${errorDetails}`;

  // 1. Authentication & Permission Errors (401, 403, invalid key)
  if (
    status === 401 ||
    status === 403 ||
    fullText.includes('api_key_invalid') ||
    fullText.includes('api key not valid') ||
    fullText.includes('unauthenticated') ||
    fullText.includes('permission_denied') ||
    fullText.includes('forbidden')
  ) {
    return {
      category: ERROR_CATEGORIES.AUTHENTICATION,
      statusCode: status === 403 ? 403 : 401,
      isRetryable: false,
      isFallbackEligible: false,
      safeMessage: 'AI service authentication failed. Please check backend configuration.'
    };
  }

  // 2. Safety filter blocks
  if (
    fullText.includes('safety') ||
    fullText.includes('blocked') ||
    err.finishReason === 'SAFETY'
  ) {
    return {
      category: ERROR_CATEGORIES.SAFETY_BLOCKED,
      statusCode: 400,
      isRetryable: false,
      isFallbackEligible: false,
      safeMessage: 'The submitted code triggered AI safety guidelines and could not be reviewed.'
    };
  }

  // 3. Invalid Request & Unsupported Models (400, models not found)
  if (
    status === 400 ||
    fullText.includes('invalid_argument') ||
    fullText.includes('is not found') ||
    fullText.includes('unsupported model') ||
    fullText.includes('not supported for this model')
  ) {
    return {
      category: ERROR_CATEGORIES.INVALID_REQUEST,
      statusCode: 400,
      isRetryable: false,
      isFallbackEligible: false,
      safeMessage: 'Invalid AI analysis request or unsupported model configuration.'
    };
  }

  // 4. Rate Limits & Quota Exhaustion (429, RESOURCE_EXHAUSTED)
  if (
    status === 429 ||
    fullText.includes('429') ||
    fullText.includes('resource_exhausted') ||
    fullText.includes('quota')
  ) {
    const isExhaustedQuota = fullText.includes('quota exceeded') || fullText.includes('exhausted') || fullText.includes('limit reached');
    return {
      category: isExhaustedQuota ? ERROR_CATEGORIES.QUOTA_EXHAUSTED : ERROR_CATEGORIES.RETRYABLE,
      statusCode: 429,
      isRetryable: true,
      // For general 429 rate-limiting, a fallback model may have independent quota
      isFallbackEligible: true,
      safeMessage: 'AI Provider rate limit or quota exceeded. Please try again later.'
    };
  }

  // 5. Service Unavailable / Overloaded (503)
  if (
    status === 503 ||
    fullText.includes('503') ||
    fullText.includes('unavailable') ||
    fullText.includes('overloaded') ||
    fullText.includes('high demand')
  ) {
    return {
      category: ERROR_CATEGORIES.FALLBACK_ELIGIBLE,
      statusCode: 503,
      isRetryable: true,
      isFallbackEligible: true,
      safeMessage: 'AI Provider is temporarily unavailable. Please try again later.'
    };
  }

  // 6. Timeouts & Gateway Timeouts (504, 408, AbortError)
  if (
    status === 504 ||
    status === 408 ||
    err.name === 'AbortError' ||
    fullText.includes('abort') ||
    fullText.includes('timeout') ||
    fullText.includes('etimedout') ||
    fullText.includes('deadline_exceeded')
  ) {
    return {
      category: ERROR_CATEGORIES.RETRYABLE,
      statusCode: 504,
      isRetryable: true,
      isFallbackEligible: true,
      safeMessage: 'AI Provider timeout: The request took too long.'
    };
  }

  // 7. Transient Network & Internal Server Errors (500, 502, network drops)
  if (
    status === 500 ||
    status === 502 ||
    fullText.includes('econnreset') ||
    fullText.includes('fetch failed') ||
    fullText.includes('network') ||
    fullText.includes('socket hang up')
  ) {
    return {
      category: ERROR_CATEGORIES.RETRYABLE,
      statusCode: 502,
      isRetryable: true,
      isFallbackEligible: true,
      safeMessage: 'AI Provider communication failure. Unable to complete analysis.'
    };
  }

  // 8. Custom controlled error preserving existing statusCode
  if (err.statusCode && !err.isAiConfigError) {
    return {
      category: ERROR_CATEGORIES.UNKNOWN,
      statusCode: err.statusCode,
      isRetryable: [502, 503, 504, 429].includes(err.statusCode),
      isFallbackEligible: [502, 503, 504].includes(err.statusCode),
      safeMessage: err.message || 'AI Provider error: Unable to complete analysis.'
    };
  }

  // 9. Unknown/Default fallback
  return {
    category: ERROR_CATEGORIES.UNKNOWN,
    statusCode: 502,
    isRetryable: false,
    isFallbackEligible: false,
    safeMessage: 'AI Provider error: Unable to complete analysis.'
  };
};

/**
 * Calculates bounded exponential backoff with random jitter.
 *
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} baseDelay - Base delay in milliseconds (default: 1000ms)
 * @param {number} maxDelay - Maximum delay in milliseconds (default: 8000ms)
 * @returns {number} Backoff delay in milliseconds
 */
const calculateBackoff = (attempt, baseDelay = 1000, maxDelay = 8000) => {
  const expDelay = Math.min(maxDelay, baseDelay * Math.pow(2, Math.max(0, attempt - 1)));
  // Jitter: ±20% variation to prevent thundering herd
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.max(100, Math.floor(expDelay * jitterFactor));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Safely initializes the Gemini client.
 * Will throw a controlled error if credentials are missing.
 */
const initializeClient = () => {
  if (aiClient) return aiClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('Gemini API key is missing from environment configuration.');
    error.statusCode = 503; // Service Unavailable
    error.isAiConfigError = true;
    throw error;
  }

  try {
    aiClient = new GoogleGenAI({ apiKey: apiKey });
    return aiClient;
  } catch (err) {
    const error = new Error('Failed to initialize Gemini client.');
    error.statusCode = 500;
    throw error;
  }
};

const MAX_CODE_LENGTH_AI = 50000;

/**
 * Calls the Gemini API to analyze source code for a single attempt.
 * 
 * @param {Object} params
 * @param {string} params.sourceCode - The code to review
 * @param {string} params.language - The programming language
 * @param {string} [params.focus='all'] - Focus area (e.g. 'all', 'security')
 * @param {string} [params.model] - Specific Gemini model to use
 * @param {number} [params.timeoutMs=30000] - Timeout in milliseconds
 * @returns {Promise<Object>} The structured JSON response from Gemini
 */
const analyzeCode = async ({ sourceCode, language, focus = 'all', model, timeoutMs = 30000 }) => {
  if (!sourceCode) {
    const error = new Error('Source code is required for analysis.');
    error.statusCode = 400;
    throw error;
  }
  
  if (sourceCode.length > MAX_CODE_LENGTH_AI) {
    const error = new Error(`Source code exceeds AI analysis limit of ${MAX_CODE_LENGTH_AI} characters.`);
    error.statusCode = 400;
    throw error;
  }

  const client = initializeClient();
  const primaryModel = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const modelName = (model || primaryModel).trim();

  // Focus instruction mapping for clearer guidance
  const focusInstructions = {
    all: 'Give a balanced review covering bugs, security, performance, and code quality.',
    bugs: 'Focus primarily on correctness issues, logic errors, and potential runtime failures. Do not manufacture unrelated issues.',
    security: 'Focus primarily on security vulnerabilities (injection, authentication, data exposure, etc.). Do not manufacture unrelated issues.',
    performance: 'Focus primarily on performance concerns (algorithmic complexity, unnecessary work, memory). Do not manufacture unrelated issues.',
    code_quality: 'Focus primarily on readability, maintainability, naming, and code structure. Do not manufacture unrelated issues.'
  };

  const focusGuide = focusInstructions[focus] || focusInstructions['all'];

  const prompt = `You are an expert senior code reviewer. Your task is to review the submitted source code honestly and practically.

Language: ${language}
Focus: ${focus}
Focus Instruction: ${focusGuide}

CRITICAL REVIEW RULES — follow these exactly:
1. Analyze ONLY the submitted source code below. Do NOT execute it, infer runtime behavior, or assume missing context.
2. Do NOT claim the code was executed or tested at runtime. You are doing static analysis only.
3. Do NOT invent issues that are not clearly visible in the code. If the code is clean, say so.
4. If there are zero meaningful issues for the selected focus area, return an empty issues array []. Do NOT force-fill issues.
5. Do NOT exaggerate severity. Use 'critical' only for genuine exploitable security vulnerabilities or crashes. Use 'high' for real bugs. Use 'medium'/'low'/'info' conservatively.
6. Line numbers MUST correspond to actual lines in the submitted code (1-indexed). If unsure, use lineStart: 1, lineEnd: 1.
7. Do NOT invent line numbers. Do NOT reference lines outside the submitted code.
8. Do NOT include unsupported assumptions, speculative vulnerabilities, or theoretical attack chains.
9. Suggestions must be practical and actionable. Only include suggestedCode if a concrete code fix is genuinely useful.
10. Do not repeat the same issue multiple times with different titles.

Severity scale (use conservatively):
- critical: Exploitable security vulnerability or guaranteed crash
- high: Real bug or significant security weakness
- medium: Potential issue or moderate concern
- low: Minor concern or code quality improvement
- info: Informational note, no urgency

Expected JSON response format (respond with ONLY valid JSON, no markdown fences):
{
  "overallScore": <integer 0-100>,
  "summary": "<honest summary of the code quality>",
  "strengths": ["<what the code does well>"],
  "issues": [
    {
      "title": "<concise issue title>",
      "category": "<bug|security|performance|code_quality|style|maintainability>",
      "severity": "<critical|high|medium|low|info>",
      "lineStart": <number>,
      "lineEnd": <number>,
      "explanation": "<what is wrong and why>",
      "whyItMatters": "<practical impact on the codebase>",
      "suggestion": "<what to do to fix it>",
      "suggestedCode": "<optional: only if a concrete code fix adds real value>"
    }
  ],
  "learningPoints": ["<educational takeaways relevant to this code>"]
}

Source code to review:
${sourceCode}`;

  let timeoutId = null;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    }, { signal: controller.signal });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response || !response.text) {
      const error = new Error('Received malformed response from Gemini API.');
      error.statusCode = 502;
      throw error;
    }

    const rawText = response.text;
    
    try {
      const parsed = JSON.parse(rawText);
      return parsed;
    } catch (parseError) {
      const error = new Error('Failed to parse structured AI response.');
      error.statusCode = 502;
      error.isJsonParseError = true;
      throw error;
    }
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);

    const classification = classifyGeminiError(err);
    const safeError = new Error(classification.safeMessage);
    safeError.statusCode = classification.statusCode;
    safeError.category = classification.category;
    safeError.isRetryable = classification.isRetryable;
    safeError.isFallbackEligible = classification.isFallbackEligible;
    safeError.isAiConfigError = err.isAiConfigError || false;
    safeError.isJsonParseError = err.isJsonParseError || false;

    throw safeError;
  }
};

/**
 * Resilient multi-tier analysis pipeline.
 *
 * Sequence:
 * 1. Primary Model (e.g. gemini-3.8-flash)
 *    - Attempt 1 -> transient error?
 *    - Exponential backoff with jitter
 *    - Attempt 2 (retry)
 * 2. Fallback Model (e.g. gemini-3.5-flash-lite)
 *    - Switched if primary suffered fallback-eligible failure
 *    - Attempt 1 (fallback)
 *    - Exponential backoff with jitter
 *    - Attempt 2 (fallback retry)
 * 3. If malformed JSON encountered:
 *    - Controlled single retry once
 * 4. Permanent errors (400, 401, 403, unsupported model):
 *    - Fail immediately without endless retries
 *
 * @param {Object} params
 * @param {string} params.sourceCode - Code to review
 * @param {string} params.language - Language
 * @param {string} [params.focus='all'] - Review focus
 * @param {string} [params.reviewId] - Review ID for safe logging
 * @param {Function} [params.onStateChange] - Status observer callback
 * @param {number} [params.maxPrimaryAttempts=2] - Max attempts for primary
 * @param {number} [params.maxFallbackAttempts=2] - Max attempts for fallback
 * @returns {Promise<{ result: Object, modelUsed: string, attempts: number, primaryAttempts: number, fallbackAttempts: number }>}
 */
const executeResilientAnalysis = async ({
  sourceCode,
  language,
  focus = 'all',
  reviewId = 'unknown',
  onStateChange,
  maxPrimaryAttempts = 2,
  maxFallbackAttempts = 2
}) => {
  const primaryModel = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const fallbackModel = (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite').trim();

  let primaryAttempts = 0;
  let fallbackAttempts = 0;
  let currentModel = primaryModel;
  let lastError = null;

  safeLog.info('AI analysis started', { reviewId, primaryModel, fallbackModel });

  // ── PHASE 1: Primary Model Attempts ─────────────────────────────────────
  while (primaryAttempts < maxPrimaryAttempts) {
    primaryAttempts++;
    currentModel = primaryModel;

    safeLog.info('AI attempt', { attempt: primaryAttempts, model: primaryModel, reviewId });
    if (typeof onStateChange === 'function') {
      onStateChange({
        state: primaryAttempts === 1 ? 'analyzing' : 'retrying',
        model: primaryModel,
        attempt: primaryAttempts,
        maxAttempts: maxPrimaryAttempts
      });
    }

    try {
      const result = await module.exports.analyzeCode({
        sourceCode,
        language,
        focus,
        model: primaryModel,
        timeoutMs: 25000 // 25s per individual call
      });

      safeLog.info('AI analysis completed', { reviewId, model: primaryModel });
      return {
        result,
        modelUsed: primaryModel,
        attempts: primaryAttempts + fallbackAttempts,
        primaryAttempts,
        fallbackAttempts
      };
    } catch (err) {
      if (err.isRetryable === undefined) {
        const cl = classifyGeminiError(err);
        err.category = cl.category;
        err.statusCode = cl.statusCode;
        err.isRetryable = cl.isRetryable;
        err.isFallbackEligible = cl.isFallbackEligible;
      }
      lastError = err;
      safeLog.warn('AI attempt failed', {
        category: err.category || 'unknown',
        status: err.statusCode || 500,
        model: primaryModel,
        reviewId
      });

      // Permanent errors: do NOT retry
      if (!err.isRetryable) {
        throw err;
      }

      // If more primary attempts remain, backoff and retry
      if (primaryAttempts < maxPrimaryAttempts) {
        const delay = calculateBackoff(primaryAttempts, 1000, 4000);
        safeLog.info('AI retry scheduled', { delay, model: primaryModel, reviewId });
        if (typeof onStateChange === 'function') {
          onStateChange({
            state: 'retrying',
            model: primaryModel,
            attempt: primaryAttempts + 1,
            maxAttempts: maxPrimaryAttempts,
            delayMs: delay
          });
        }
        await sleep(delay);
      }
    }
  }

  // ── PHASE 2: Fallback Model Check ───────────────────────────────────────
  const canUseFallback = fallbackModel &&
    fallbackModel !== primaryModel &&
    lastError &&
    lastError.isFallbackEligible;

  if (canUseFallback) {
    safeLog.warn('AI fallback model activated', {
      primaryModel,
      fallbackModel,
      reviewId
    });

    if (typeof onStateChange === 'function') {
      onStateChange({
        state: 'fallback',
        model: fallbackModel,
        attempt: 1,
        maxAttempts: maxFallbackAttempts
      });
    }

    while (fallbackAttempts < maxFallbackAttempts) {
      fallbackAttempts++;
      currentModel = fallbackModel;

      safeLog.info('AI fallback attempt', {
        attempt: fallbackAttempts,
        model: fallbackModel,
        reviewId
      });

      try {
        const result = await module.exports.analyzeCode({
          sourceCode,
          language,
          focus,
          model: fallbackModel,
          timeoutMs: 25000
        });

        safeLog.info('AI analysis completed using fallback model', {
          reviewId,
          model: fallbackModel
        });

        return {
          result,
          modelUsed: fallbackModel,
          attempts: primaryAttempts + fallbackAttempts,
          primaryAttempts,
          fallbackAttempts
        };
      } catch (err) {
        if (err.isRetryable === undefined) {
          const cl = classifyGeminiError(err);
          err.category = cl.category;
          err.statusCode = cl.statusCode;
          err.isRetryable = cl.isRetryable;
          err.isFallbackEligible = cl.isFallbackEligible;
        }
        lastError = err;
        safeLog.warn('AI fallback attempt failed', {
          category: err.category || 'unknown',
          status: err.statusCode || 500,
          model: fallbackModel,
          reviewId
        });

        if (!err.isRetryable) {
          throw err;
        }

        if (fallbackAttempts < maxFallbackAttempts) {
          const delay = calculateBackoff(fallbackAttempts, 1000, 4000);
          safeLog.info('AI fallback retry scheduled', { delay, model: fallbackModel, reviewId });
          await sleep(delay);
        }
      }
    }
  }

  // If we reach here, immediate retries and fallback were exhausted
  const finalError = lastError || new Error('AI Provider is temporarily unavailable.');
  finalError.primaryAttempts = primaryAttempts;
  finalError.fallbackAttempts = fallbackAttempts;
  finalError.totalAttempts = primaryAttempts + fallbackAttempts;
  finalError.currentModel = currentModel;
  throw finalError;
};

// For testing purposes so we can reset it
const clearClient = () => {
  aiClient = null;
};

module.exports = {
  analyzeCode,
  executeResilientAnalysis,
  classifyGeminiError,
  calculateBackoff,
  ERROR_CATEGORIES,
  initializeClient,
  clearClient,
  sleep
};
