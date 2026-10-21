/**
 * Rate Limit Middleware — AI Analysis Endpoint Protection
 *
 * Provides two layers of protection for POST /api/reviews/:id/analyze:
 *
 * 1. Cooldown: prevents the same user from re-analyzing the same review
 *    within AI_ANALYZE_COOLDOWN_SECONDS (default: 30 seconds).
 *
 * 2. Concurrency lock: prevents duplicate simultaneous requests for the
 *    same review from the same user being sent to Gemini concurrently.
 *
 * LIMITATION: Both stores are in-memory (JavaScript Maps/Sets).
 * They will reset on server restart. They are not distributed — if
 * multiple server instances run, each maintains its own state.
 * For a single-instance development/staging environment this is sufficient.
 * A production multi-instance deployment would require a shared store (e.g. Redis).
 */

// cooldownStore: Map< "userId:reviewId" -> timestamp of last analysis >
const cooldownStore = new Map();

// concurrencyStore: Set< "userId:reviewId" > — active in-flight requests
const concurrencyStore = new Set();

/**
 * Returns the cooldown duration in seconds from env or the default.
 */
const getCooldownSeconds = () => {
  const configured = parseInt(process.env.AI_ANALYZE_COOLDOWN_SECONDS, 10);
  return Number.isFinite(configured) && configured >= 0 ? configured : 30;
};

/**
 * Express middleware that enforces:
 *  - Per-user cooldown between analysis requests for the same review.
 *  - Concurrent duplicate request protection for the same review.
 *
 * Must be used AFTER the `protect` middleware so req.userId is available.
 * Must be used on routes that include `:id` param for the review ID.
 *
 * On success: calls next(), and sets req._rateLimitKey so analyzeReview
 * can release the concurrency lock after the Gemini request completes.
 */
const analyzeRateLimiter = (req, res, next) => {
  const userId = req.userId;
  const reviewId = req.params.id;

  // Guard: both must be present (auth middleware should have ensured userId)
  if (!userId || !reviewId) {
    return res.status(400).json({
      success: false,
      message: 'Missing user or review identifier.'
    });
  }

  const key = `${userId}:${reviewId}`;
  const cooldownSeconds = getCooldownSeconds();

  // 1. Concurrency check — is there already an in-flight request for this key?
  if (concurrencyStore.has(key)) {
    return res.status(429).json({
      success: false,
      message: 'Analysis is already in progress for this review. Please wait for it to complete.',
      retryAfter: 5
    });
  }

  // 2. Cooldown check
  if (cooldownSeconds > 0) {
    const lastAnalyzedAt = cooldownStore.get(key);
    if (lastAnalyzedAt) {
      const elapsedMs = Date.now() - lastAnalyzedAt;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      const remaining = cooldownSeconds - elapsedSeconds;
      if (remaining > 0) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${remaining} second${remaining !== 1 ? 's' : ''} before re-analyzing this review.`,
          retryAfter: remaining
        });
      }
    }
  }

  // 3. Acquire concurrency lock
  concurrencyStore.add(key);

  // Expose the release function on the request object so the controller
  // can release the lock after the Gemini call completes (success or failure).
  req._releaseAnalyzeLock = () => {
    concurrencyStore.delete(key);
    // Record cooldown start time (only after successful lock release)
    cooldownStore.set(key, Date.now());
  };

  next();
};

/**
 * Exported for testing purposes only — clears all in-memory state.
 */
const _clearRateLimitState = () => {
  cooldownStore.clear();
  concurrencyStore.clear();
};

/**
 * Exported for testing purposes only — inspect state.
 */
const _getRateLimitState = () => ({
  cooldownCount: cooldownStore.size,
  concurrencyCount: concurrencyStore.size
});

module.exports = {
  analyzeRateLimiter,
  _clearRateLimitState,
  _getRateLimitState,
  getCooldownSeconds
};
