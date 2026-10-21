const mongoose = require('mongoose');

/**
 * AnalysisJob Model
 *
 * Tracks asynchronous and resilient AI analysis executions for Code Reviews.
 * Guarantees persistence of pending retries across server restarts,
 * prevents duplicate in-flight processing, and provides verifiable status
 * for frontend state restoration after page refreshes.
 *
 * SECURITY:
 * - Always belongs to authenticated user (user field).
 * - Scoped strictly by req.userId.
 */
const analysisJobSchema = new mongoose.Schema(
  {
    review: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review',
      required: [true, 'Review ID is required'],
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    status: {
      type: String,
      enum: {
        values: ['queued', 'processing', 'retry_pending', 'completed', 'failed'],
        message: '{VALUE} is not a valid analysis job status'
      },
      default: 'queued',
      index: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    primaryAttempts: {
      type: Number,
      default: 0
    },
    fallbackAttempts: {
      type: Number,
      default: 0
    },
    currentModel: {
      type: String,
      default: null
    },
    lastErrorType: {
      type: String,
      default: null
    },
    lastErrorCode: {
      type: Number,
      default: null
    },
    lastErrorMessage: {
      type: String,
      default: null
    },
    nextRetryAt: {
      type: Date,
      default: null
    },
    startedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for background recovery worker and rapid user/review job queries
analysisJobSchema.index({ status: 1, nextRetryAt: 1 });
analysisJobSchema.index({ review: 1, status: 1 });
analysisJobSchema.index({ review: 1, createdAt: -1 });

const AnalysisJob = mongoose.model('AnalysisJob', analysisJobSchema);

module.exports = AnalysisJob;
