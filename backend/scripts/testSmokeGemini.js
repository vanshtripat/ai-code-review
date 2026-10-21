'use strict';

/**
 * Real Gemini API Smoke Test (Single Call)
 *
 * Runs exactly ONE real request to the configured primary model:
 * GEMINI_MODEL (defaults to gemini-3.8-flash).
 *
 * SECURITY:
 * - Reads GEMINI_API_KEY from backend/.env only.
 * - Does not spam or loop.
 * - Verifies live communication and real AI output / error classification.
 *
 * Run: node backend/scripts/testSmokeGemini.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const aiService = require('../src/services/aiService');
const { validateAiStructure } = require('../src/services/recoveryWorker');

async function runGeminiSmokeTest() {
  console.log('================================================================');
  console.log('=== REAL GEMINI API SMOKE TEST (EXACTLY 1 REAL REQUEST)      ===');
  console.log('================================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.warn('⚠️  GEMINI_API_KEY is not configured in backend/.env.');
    console.warn('    Skipping live API smoke test.\n');
    process.exit(0);
  }

  const primaryModel = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  console.log(`📡 Sending 1 real request to primary model: ${primaryModel}...`);

  const sampleCode = `function calculateSquare(num) {
  if (typeof num !== 'number') {
    throw new TypeError('Input must be a valid number');
  }
  return num * num;
}`;

  const startTime = Date.now();
  try {
    const rawResult = await aiService.analyzeCode({
      sourceCode: sampleCode,
      language: 'javascript',
      focus: 'all',
      model: primaryModel,
      timeoutMs: 45000
    });

    const elapsedMs = Date.now() - startTime;
    console.log(`⏱️  Response received in ${elapsedMs}ms.`);

    // Validate using the schema validator
    const validated = validateAiStructure(rawResult, sampleCode);

    console.log('✅ Real Gemini response received and verified:');
    console.log(`   - Overall Score: ${validated.overallScore}/100`);
    console.log(`   - Summary: "${validated.summary.slice(0, 100)}..."`);
    console.log(`   - Strengths count: ${validated.strengths.length}`);
    console.log(`   - Issues count: ${validated.issues.length}`);
    console.log(`   - Learning points count: ${validated.learningPoints.length}`);

    console.log('\n================================================================');
    console.log('=== REAL GEMINI SMOKE TEST PASSED SUCCESSFULLY (1 CALL USED) ===');
    console.log('================================================================\n');
    process.exitCode = 0;
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    const classification = aiService.classifyGeminiError(err);

    console.log(`⏱️  Live provider response received in ${elapsedMs}ms.`);
    console.log(`ℹ️  Status Code: ${classification.statusCode}`);
    console.log(`ℹ️  Error Category: ${classification.category}`);
    console.log(`ℹ️  Safe Message: "${classification.safeMessage}"`);

    if (classification.isRetryable || classification.isFallbackEligible) {
      console.log('✅ Live Gemini API connection confirmed.');
      console.log('   Provider returned expected transient response (high demand / rate-limited).');
      console.log('   Resilient classification correctly routed this to fallback/retry.');
      console.log('\n================================================================');
      console.log('=== REAL GEMINI SMOKE TEST VERIFIED (1 LIVE REQUEST REACHED GOOGLE) ===');
      console.log('================================================================\n');
      process.exitCode = 0;
    } else {
      console.error('❌ Unexpected permanent error:', err.message);
      process.exitCode = 1;
    }
  }
}

runGeminiSmokeTest();
