const reviewService = require('../services/reviewService');
const statsService = require('../services/statsService');
const aiService = require('../services/aiService');
const analysisJobService = require('../services/analysisJobService');
const { safeLog } = require('../utils/logger');

/**
 * Controller to handle code review submissions (Day 8 MongoDB Persistence).
 * Validates language, source code, and review focus.
 * Extracts authenticated userId from verified JWT (req.userId).
 * Persists review document to MongoDB and returns safe summary response.
 */
const submitReview = async (req, res) => {
  try {
    const { language, sourceCode, focus } = req.body || {};
    const userId = req.userId;

    const review = await reviewService.createReview({
      userId,
      language,
      sourceCode,
      focus
    });

    return res.status(201).json({
      success: true,
      message: 'Review saved successfully.',
      review
    });
  } catch (error) {
    // Handle validation or known business logic errors
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    // Handle Mongoose validation errors safely
    if (error.name === 'ValidationError') {
      const firstError = Object.values(error.errors)[0];
      return res.status(400).json({
        success: false,
        message: firstError ? firstError.message : 'Invalid review submission.'
      });
    }

    // Generic fallback for database connection or internal server errors
    console.error('Review submission error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to save the review. Please try again.'
    });
  }
};

/**
 * Controller to retrieve reviews for the authenticated user.
 * Supports query params: page, limit.
 */
const getUserReviews = async (req, res) => {
  try {
    const userId = req.userId;
    const { page, limit } = req.query;

    const result = await reviewService.getUserReviews({
      userId,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    console.error('Get reviews error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve reviews. Please try again.'
    });
  }
};

/**
 * Controller to retrieve a single review by ID for the authenticated owner.
 */
const getReviewById = async (req, res) => {
  try {
    const userId = req.userId;
    const { id: reviewId } = req.params;

    const review = await reviewService.getReviewById({
      reviewId,
      userId
    });

    return res.status(200).json({
      success: true,
      review
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid review ID.'
      });
    }

    console.error('Get review by ID error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve the review. Please try again.'
    });
  }
};

/**
 * Controller to delete a review by ID for the authenticated owner.
 */
const deleteReview = async (req, res) => {
  try {
    const userId = req.userId;
    const { id: reviewId } = req.params;

    await reviewService.deleteReview({
      reviewId,
      userId
    });

    return res.status(200).json({
      success: true,
      message: 'Review deleted successfully.'
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid review ID.'
      });
    }

    console.error('Delete review error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to delete the review. Please try again.'
    });
  }
};

/**
 * Validates the structure of the AI result from Gemini and filters out unknown fields.
 * Validates line numbers against the submitted source code.
 */
const validateAiResult = (result, sourceCode) => {
  if (!result || typeof result !== 'object') throw new Error('Invalid AI response structure');
  
  if (typeof result.overallScore !== 'number' || result.overallScore < 0 || result.overallScore > 100) {
    throw new Error('Invalid overallScore');
  }
  
  if (typeof result.summary !== 'string' || !result.summary.trim()) {
    throw new Error('Invalid summary');
  }
  
  if (!Array.isArray(result.strengths)) {
    throw new Error('Invalid strengths array');
  }
  
  if (!Array.isArray(result.issues)) {
    throw new Error('Invalid issues array');
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
    if (issue.suggestedCode !== undefined && typeof issue.suggestedCode !== 'string') throw new Error('Invalid issue suggestedCode');

    let lineStart = issue.lineStart;
    let lineEnd = issue.lineEnd;

    // Line number validation and normalization
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

  if (!Array.isArray(result.learningPoints)) {
    throw new Error('Invalid learningPoints array');
  }

  // Return strictly only the allowed schema fields
  return {
    overallScore: result.overallScore,
    summary: result.summary,
    strengths: result.strengths.filter(s => typeof s === 'string'),
    issues: cleanIssues,
    learningPoints: result.learningPoints.filter(s => typeof s === 'string')
  };
};

/**
 * Controller to analyze a review via Gemini API with resilient retries,
 * fallback model, and persistent job tracking.
 *
 * Rate limiting is enforced by analyzeRateLimiter middleware before this handler.
 * Flow:
 *   1. Authenticate & verify review ownership (via req.userId).
 *   2. Check for existing active AnalysisJob. If active, return current status.
 *   3. Create or reuse AnalysisJob.
 *   4. Run resilient analysis pipeline (primary + retries + fallback).
 *   5. On success: validate AI result, save to Review, mark job completed.
 *   6. On transient failure: persist job as retry_pending for background worker.
 *   7. On failure: existing aiResult in Review is preserved intact.
 *   8. Concurrency lock is always released.
 */
const analyzeReview = async (req, res) => {
  const releaseLock = () => {
    if (typeof req._releaseAnalyzeLock === 'function') {
      req._releaseAnalyzeLock();
    }
  };

  const userId = req.userId;
  const { id: reviewId } = req.params;

  try {
    // 1. Retrieve review strictly verifying ownership
    const review = await reviewService.getReviewById({ reviewId, userId });

    // 2. Check for duplicate active job
    const activeJob = await analysisJobService.getActiveJobForReview(reviewId, userId);
    if (activeJob) {
      releaseLock();
      return res.status(200).json({
        success: true,
        status: activeJob.status,
        nextRetryAt: activeJob.nextRetryAt,
        message: activeJob.status === 'retry_pending'
          ? 'Your analysis request has been saved. We will automatically retry when the AI service is available.'
          : 'Analysis is already in progress for this review.',
        attempts: activeJob.attempts,
        jobId: activeJob._id.toString()
      });
    }

    // 3. Create analysis job
    const primaryModel = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
    const { job } = await analysisJobService.createOrReuseJob({
      reviewId,
      userId,
      initialModel: primaryModel
    });

    // 4. Run resilient multi-attempt analysis
    let analysisOutcome;
    try {
      analysisOutcome = await aiService.executeResilientAnalysis({
        sourceCode: review.sourceCode,
        language: review.language,
        focus: review.focus,
        reviewId: reviewId,
        maxPrimaryAttempts: 2,
        maxFallbackAttempts: 2
      });
    } catch (analysisError) {
      // Check if transient error suitable for background retry
      const isTransient = analysisError.isRetryable;

      if (isTransient) {
        const delayMs = aiService.calculateBackoff(1, 5000, 15000);
        await analysisJobService.markJobRetryPending({
          jobId: job._id,
          error: analysisError,
          nextRetryDelayMs: delayMs,
          attempts: analysisError.totalAttempts || 1,
          primaryAttempts: analysisError.primaryAttempts || 1,
          fallbackAttempts: analysisError.fallbackAttempts || 0,
          currentModel: analysisError.currentModel || primaryModel
        });

        releaseLock();

        return res.status(200).json({
          success: true,
          status: 'retry_pending',
          nextRetryAt: new Date(Date.now() + delayMs),
          attempts: analysisError.totalAttempts || 1,
          message: 'AI service is temporarily busy. Analysis is scheduled to retry automatically.',
          jobId: job._id.toString()
        });
      }

      // Permanent error (400, 401, 403, unsupported model):
      // Mark job failed. Existing review.aiResult is preserved!
      await analysisJobService.markJobFailed({
        jobId: job._id,
        error: analysisError,
        attempts: analysisError.totalAttempts || 1,
        primaryAttempts: analysisError.primaryAttempts || 1,
        fallbackAttempts: analysisError.fallbackAttempts || 0,
        currentModel: analysisError.currentModel || primaryModel
      });

      releaseLock();

      return res.status(analysisError.statusCode || 500).json({
        success: false,
        status: 'failed',
        message: analysisError.message || 'Unable to complete AI analysis.'
      });
    }

    // 5. Successful AI response — validate structure and line bounds
    const validatedAiResult = validateAiResult(analysisOutcome.result, review.sourceCode);

    // 6. Save validated result into Review
    const updatedReview = await reviewService.saveAiResult({
      reviewId,
      userId,
      aiResult: {
        ...validatedAiResult,
        modelUsed: analysisOutcome.modelUsed
      }
    });

    // 7. Mark AnalysisJob as completed
    await analysisJobService.markJobCompleted({
      jobId: job._id,
      modelUsed: analysisOutcome.modelUsed,
      attempts: analysisOutcome.attempts,
      primaryAttempts: analysisOutcome.primaryAttempts,
      fallbackAttempts: analysisOutcome.fallbackAttempts
    });

    releaseLock();

    return res.status(200).json({
      success: true,
      status: 'completed',
      message: 'Review analyzed successfully.',
      review: updatedReview
    });
  } catch (error) {
    releaseLock();

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid review ID.'
      });
    }

    safeLog.error('Unhandled analyze review error', { error: error.message, reviewId });
    return res.status(500).json({
      success: false,
      message: 'Unable to analyze the review. Please try again.'
    });
  }
};

/**
 * Controller to retrieve analysis job status for a review.
 * Verifies review ownership strictly via req.userId.
 */
const getAnalysisStatus = async (req, res) => {
  try {
    const userId = req.userId;
    const { id: reviewId } = req.params;

    // 1. Verify review ownership strictly (returns 404 if not owned by user)
    const review = await reviewService.getReviewById({ reviewId, userId });

    // 2. Fetch latest job
    const latestJob = await analysisJobService.getLatestJobForReview(reviewId, userId);

    if (!latestJob) {
      if (review.aiResult) {
        return res.status(200).json({
          success: true,
          status: 'completed',
          review
        });
      }
      return res.status(200).json({
        success: true,
        status: 'idle',
        message: 'No analysis requested yet.'
      });
    }

    let message = 'Analysis status retrieved.';
    if (latestJob.status === 'processing') message = 'Analyzing code...';
    else if (latestJob.status === 'retry_pending') message = 'Analysis is scheduled to retry automatically.';
    else if (latestJob.status === 'completed') message = 'Analysis completed.';
    else if (latestJob.status === 'failed') message = latestJob.lastErrorMessage || 'Analysis failed.';

    return res.status(200).json({
      success: true,
      status: latestJob.status,
      attempts: latestJob.attempts,
      primaryAttempts: latestJob.primaryAttempts,
      fallbackAttempts: latestJob.fallbackAttempts,
      currentModel: latestJob.currentModel,
      lastErrorType: latestJob.lastErrorType,
      nextRetryAt: latestJob.nextRetryAt,
      message,
      review: latestJob.status === 'completed' ? review : undefined
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid review ID.'
      });
    }

    safeLog.error('Get analysis status error', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve analysis status.'
    });
  }
};

/**
 * Controller to retrieve dashboard statistics for the authenticated user.
 * All statistics are scoped strictly to the authenticated user's reviews.
 */
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId;
    const stats = await statsService.getUserStats(userId);
    return res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    console.error('Dashboard stats error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to load dashboard statistics. Please try again.'
    });
  }
};

module.exports = {
  submitReview,
  getUserReviews,
  getReviewById,
  deleteReview,
  analyzeReview,
  getAnalysisStatus,
  getDashboardStats,
  validateAiResult,
  ALLOWED_LANGUAGES: reviewService.ALLOWED_LANGUAGES,
  ALLOWED_FOCUS: reviewService.ALLOWED_FOCUS,
  MAX_CODE_LENGTH: reviewService.MAX_CODE_LENGTH
};
