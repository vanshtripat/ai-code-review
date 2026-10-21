'use strict';

const AnalysisJob = require('../models/AnalysisJob');
const { safeLog } = require('../utils/logger');

const ACTIVE_STATUSES = ['queued', 'processing', 'retry_pending'];

/**
 * Finds any currently active analysis job for a review owned by userId.
 * Prevents duplicate concurrent jobs or duplicate scheduling.
 */
const getActiveJobForReview = async (reviewId, userId) => {
  return AnalysisJob.findOne({
    review: reviewId,
    user: userId,
    status: { $in: ACTIVE_STATUSES }
  });
};

/**
 * Finds the latest analysis job for a review owned by userId (regardless of status).
 */
const getLatestJobForReview = async (reviewId, userId) => {
  return AnalysisJob.findOne({
    review: reviewId,
    user: userId
  }).sort({ createdAt: -1 });
};

/**
 * Creates or reuses an analysis job for a review.
 * Enforces ownership via userId.
 * If an active job already exists, returns it without creating a duplicate.
 */
const createOrReuseJob = async ({ reviewId, userId, initialModel }) => {
  const existingActive = await getActiveJobForReview(reviewId, userId);
  if (existingActive) {
    return { job: existingActive, isNew: false };
  }

  const job = await AnalysisJob.create({
    review: reviewId,
    user: userId,
    status: 'processing',
    currentModel: initialModel,
    startedAt: new Date(),
    attempts: 0,
    primaryAttempts: 0,
    fallbackAttempts: 0
  });

  return { job, isNew: true };
};

/**
 * Marks job completed upon successful validation and storage of AI result.
 */
const markJobCompleted = async ({
  jobId,
  modelUsed,
  attempts = 1,
  primaryAttempts = 1,
  fallbackAttempts = 0
}) => {
  return AnalysisJob.findByIdAndUpdate(
    jobId,
    {
      status: 'completed',
      completedAt: new Date(),
      currentModel: modelUsed,
      attempts,
      primaryAttempts,
      fallbackAttempts,
      lastErrorType: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      nextRetryAt: null
    },
    { returnDocument: 'after' }
  );
};

/**
 * Marks job as retry_pending when transient failure persists.
 */
const markJobRetryPending = async ({
  jobId,
  error,
  nextRetryDelayMs,
  attempts = 1,
  primaryAttempts = 1,
  fallbackAttempts = 0,
  currentModel
}) => {
  const nextRetryAt = new Date(Date.now() + Math.max(1000, nextRetryDelayMs));
  return AnalysisJob.findByIdAndUpdate(
    jobId,
    {
      status: 'retry_pending',
      nextRetryAt,
      lastErrorType: error?.category || 'transient',
      lastErrorCode: error?.statusCode || 503,
      lastErrorMessage: error?.message || 'Temporary AI unavailability',
      attempts,
      primaryAttempts,
      fallbackAttempts,
      currentModel
    },
    { returnDocument: 'after' }
  );
};

/**
 * Marks job as permanently failed.
 */
const markJobFailed = async ({
  jobId,
  error,
  attempts = 1,
  primaryAttempts = 1,
  fallbackAttempts = 0,
  currentModel
}) => {
  return AnalysisJob.findByIdAndUpdate(
    jobId,
    {
      status: 'failed',
      completedAt: new Date(),
      lastErrorType: error?.category || 'permanent',
      lastErrorCode: error?.statusCode || 500,
      lastErrorMessage: error?.message || 'AI analysis failed',
      attempts,
      primaryAttempts,
      fallbackAttempts,
      currentModel,
      nextRetryAt: null
    },
    { returnDocument: 'after' }
  );
};

/**
 * Atomically claims one due retry_pending job for background recovery worker.
 */
const claimDueRetryJob = async () => {
  return AnalysisJob.findOneAndUpdate(
    {
      status: 'retry_pending',
      nextRetryAt: { $lte: new Date() }
    },
    {
      status: 'processing',
      startedAt: new Date()
    },
    { returnDocument: 'after' }
  );
};

/**
 * Resets any jobs that were stuck in 'processing' when the server stopped/restarted.
 * Ensures backend restart does NOT permanently lose pending analysis requests.
 */
const resetStaleProcessingJobs = async () => {
  try {
    const result = await AnalysisJob.updateMany(
      { status: 'processing' },
      {
        status: 'retry_pending',
        nextRetryAt: new Date(),
        lastErrorMessage: 'Recovered after backend restart'
      }
    );
    if (result.modifiedCount > 0) {
      safeLog.info('Reset stale in-flight jobs after restart', { count: result.modifiedCount });
    }
    return result;
  } catch (err) {
    safeLog.error('Failed to reset stale jobs on startup', { error: err.message });
    return null;
  }
};

module.exports = {
  ACTIVE_STATUSES,
  getActiveJobForReview,
  getLatestJobForReview,
  createOrReuseJob,
  markJobCompleted,
  markJobRetryPending,
  markJobFailed,
  claimDueRetryJob,
  resetStaleProcessingJobs
};
