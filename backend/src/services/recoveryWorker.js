'use strict';

const Review = require('../models/Review');
const reviewService = require('./reviewService');
const aiService = require('./aiService');
const analysisJobService = require('./analysisJobService');
const { safeLog } = require('../utils/logger');

// Strict concurrency limit to prevent retry storms
const MAX_CONCURRENT_JOBS = 1;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const MAX_TOTAL_ATTEMPTS = 5;

let pollTimer = null;
let activeJobCount = 0;
let isRunning = false;

/**
 * Validates AI result structure before saving.
 */
const validateAiStructure = (result, sourceCode) => {
  if (!result || typeof result !== 'object') throw new Error('Invalid AI response structure');
  if (typeof result.overallScore !== 'number' || result.overallScore < 0 || result.overallScore > 100) {
    throw new Error('Invalid overallScore');
  }
  if (typeof result.summary !== 'string' || !result.summary.trim()) {
    throw new Error('Invalid summary');
  }
  if (!Array.isArray(result.strengths) || !Array.isArray(result.issues) || !Array.isArray(result.learningPoints)) {
    throw new Error('Missing or malformed result arrays');
  }

  const allowedCategories = ['bug', 'security', 'performance', 'code_quality', 'style', 'maintainability'];
  const allowedSeverities = ['critical', 'high', 'medium', 'low', 'info'];
  const totalLines = sourceCode ? sourceCode.split('\n').length : 1;

  const cleanIssues = [];
  for (const issue of result.issues) {
    if (typeof issue.title !== 'string' || !issue.title.trim()) throw new Error('Invalid issue title');
    if (!allowedCategories.includes(issue.category)) throw new Error(`Invalid issue category: ${issue.category}`);
    if (!allowedSeverities.includes(issue.severity)) throw new Error(`Invalid issue severity: ${issue.severity}`);
    if (typeof issue.explanation !== 'string' || !issue.explanation.trim()) throw new Error('Invalid issue explanation');
    if (typeof issue.whyItMatters !== 'string' || !issue.whyItMatters.trim()) throw new Error('Invalid issue whyItMatters');
    if (typeof issue.suggestion !== 'string' || !issue.suggestion.trim()) throw new Error('Invalid issue suggestion');
    if (issue.suggestedCode !== undefined && typeof issue.suggestedCode !== 'string') throw new Error('Invalid suggestedCode');

    let lineStart = issue.lineStart;
    let lineEnd = issue.lineEnd;
    if (typeof lineStart !== 'number' || lineStart < 1) lineStart = 1;
    if (typeof lineEnd !== 'number' || lineEnd < lineStart) lineEnd = lineStart;
    if (lineStart > totalLines) lineStart = totalLines;
    if (lineEnd > totalLines) lineEnd = totalLines;

    cleanIssues.push({
      title: issue.title,
      category: issue.category,
      severity: issue.severity,
      lineStart,
      lineEnd,
      explanation: issue.explanation,
      whyItMatters: issue.whyItMatters,
      suggestion: issue.suggestion,
      suggestedCode: issue.suggestedCode
    });
  }

  return {
    overallScore: result.overallScore,
    summary: result.summary,
    strengths: result.strengths.filter((s) => typeof s === 'string'),
    issues: cleanIssues,
    learningPoints: result.learningPoints.filter((s) => typeof s === 'string')
  };
};

/**
 * Claims and processes one due retry_pending job.
 * Returns true if a job was found and processed, false otherwise.
 */
const processNextDueJob = async () => {
  if (activeJobCount >= MAX_CONCURRENT_JOBS) {
    return false;
  }

  // Atomically claim the due job
  const job = await analysisJobService.claimDueRetryJob();
  if (!job) {
    return false;
  }

  activeJobCount++;
  safeLog.info('Recovery worker claimed job', { jobId: job._id.toString(), reviewId: job.review.toString() });

  try {
    const review = await Review.findById(job.review);
    if (!review) {
      safeLog.warn('Associated review not found for job', { jobId: job._id.toString() });
      await analysisJobService.markJobFailed({
        jobId: job._id,
        error: new Error('Associated review no longer exists.'),
        attempts: (job.attempts || 0) + 1,
        currentModel: job.currentModel
      });
      activeJobCount--;
      return true;
    }

    // Execute resilient analysis
    const analysisResponse = await aiService.executeResilientAnalysis({
      sourceCode: review.sourceCode,
      language: review.language,
      focus: review.focus,
      reviewId: review._id.toString(),
      maxPrimaryAttempts: 2,
      maxFallbackAttempts: 2
    });

    const validatedResult = validateAiStructure(analysisResponse.result, review.sourceCode);

    // Save successful AI result into Review (replaces old aiResult only on success)
    await reviewService.saveAiResult({
      reviewId: review._id.toString(),
      userId: job.user.toString(),
      aiResult: {
        ...validatedResult,
        modelUsed: analysisResponse.modelUsed
      }
    });

    // Mark job completed
    await analysisJobService.markJobCompleted({
      jobId: job._id,
      modelUsed: analysisResponse.modelUsed,
      attempts: (job.attempts || 0) + analysisResponse.attempts,
      primaryAttempts: (job.primaryAttempts || 0) + analysisResponse.primaryAttempts,
      fallbackAttempts: (job.fallbackAttempts || 0) + analysisResponse.fallbackAttempts
    });

    safeLog.info('Recovery worker completed job successfully', {
      jobId: job._id.toString(),
      model: analysisResponse.modelUsed
    });
  } catch (err) {
    const totalAttempts = (job.attempts || 0) + 1;
    const isRetryable = err.isRetryable && totalAttempts < MAX_TOTAL_ATTEMPTS;

    if (isRetryable) {
      const delayMs = aiService.calculateBackoff(totalAttempts, 5000, 30000);
      safeLog.warn('Recovery worker job retry scheduled', {
        jobId: job._id.toString(),
        totalAttempts,
        nextDelayMs: delayMs
      });
      await analysisJobService.markJobRetryPending({
        jobId: job._id,
        error: err,
        nextRetryDelayMs: delayMs,
        attempts: totalAttempts,
        currentModel: job.currentModel
      });
    } else {
      safeLog.error('Recovery worker job failed permanently', {
        jobId: job._id.toString(),
        totalAttempts,
        reason: err.message
      });
      await analysisJobService.markJobFailed({
        jobId: job._id,
        error: err,
        attempts: totalAttempts,
        currentModel: job.currentModel
      });
      // NOTE: Existing review.aiResult is kept intact!
    }
  } finally {
    activeJobCount--;
  }

  return true;
};

/**
 * Polling loop for background recovery worker.
 */
const pollForDueJobs = async () => {
  if (!isRunning) return;
  try {
    await processNextDueJob();
  } catch (err) {
    safeLog.error('Error during recovery worker poll cycle', { error: err.message });
  }
};

/**
 * Starts the background recovery worker.
 * Recovers stale processing jobs from previous server restarts.
 */
const startRecoveryWorker = async (intervalMs = DEFAULT_POLL_INTERVAL_MS) => {
  if (isRunning) return;
  isRunning = true;

  safeLog.info('Starting AI background recovery worker...');

  // 1. Recover any jobs left in 'processing' by a previous crash/restart
  await analysisJobService.resetStaleProcessingJobs();

  // 2. Start polling timer
  pollTimer = setInterval(pollForDueJobs, intervalMs);

  // 3. Immediately trigger first check
  setImmediate(pollForDueJobs);
};

/**
 * Stops the background recovery worker cleanly.
 */
const stopRecoveryWorker = () => {
  isRunning = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  activeJobCount = 0;
  safeLog.info('AI background recovery worker stopped.');
};

module.exports = {
  startRecoveryWorker,
  stopRecoveryWorker,
  processNextDueJob,
  validateAiStructure
};
