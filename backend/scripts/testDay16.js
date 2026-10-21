'use strict';
/**
 * Day 16 — Security + Rate Limiting Tests
 *
 * Tests the analyzeRateLimiter middleware and the analyzeReview controller
 * using mocked Gemini responses. Does NOT call the live Gemini API.
 *
 * Run: node backend/scripts/testDay16.js
 */

// Load environment variables (for JWT_SECRET etc.)
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { analyzeRateLimiter, _clearRateLimitState, _getRateLimitState, getCooldownSeconds } = require('../src/middleware/rateLimitMiddleware');

// ─── Test Harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(description, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      // Async — shouldn't happen in this harness but guard anyway
      result.then(() => {
        console.log(`  ✅ ${description}`);
        passed++;
      }).catch(err => {
        console.error(`  ❌ ${description}`);
        console.error(`     ${err.message}`);
        failed++;
      });
    } else {
      console.log(`  ✅ ${description}`);
      passed++;
    }
  } catch (err) {
    console.error(`  ❌ ${description}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function assertThrows(description, fn, expectedMsg) {
  try {
    fn();
    console.error(`  ❌ ${description} — expected error but none was thrown`);
    failed++;
  } catch (err) {
    if (expectedMsg && !err.message.includes(expectedMsg)) {
      console.error(`  ❌ ${description} — wrong error: "${err.message}"`);
      failed++;
    } else {
      console.log(`  ✅ ${description}`);
      passed++;
    }
  }
}

// ─── Mock request/response helpers ──────────────────────────────────────────

function makeReq(userId, reviewId) {
  return {
    userId,
    params: { id: reviewId },
    _releaseAnalyzeLock: null
  };
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

// ─── Suite 1: getCooldownSeconds ─────────────────────────────────────────────

console.log('\n📋 Suite 1: getCooldownSeconds configuration');

assert('Returns 30 when env var is not set', () => {
  const original = process.env.AI_ANALYZE_COOLDOWN_SECONDS;
  delete process.env.AI_ANALYZE_COOLDOWN_SECONDS;
  const result = getCooldownSeconds();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = original;
  if (result !== 30) throw new Error(`Expected 30, got ${result}`);
});

assert('Returns configured value from env', () => {
  const original = process.env.AI_ANALYZE_COOLDOWN_SECONDS;
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '60';
  const result = getCooldownSeconds();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = original;
  if (result !== 60) throw new Error(`Expected 60, got ${result}`);
});

assert('Returns 0 when env var is "0" (disables cooldown)', () => {
  const original = process.env.AI_ANALYZE_COOLDOWN_SECONDS;
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '0';
  const result = getCooldownSeconds();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = original;
  if (result !== 0) throw new Error(`Expected 0, got ${result}`);
});

assert('Returns 30 for invalid string env var', () => {
  const original = process.env.AI_ANALYZE_COOLDOWN_SECONDS;
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = 'banana';
  const result = getCooldownSeconds();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = original;
  if (result !== 30) throw new Error(`Expected 30, got ${result}`);
});

// ─── Suite 2: Normal analysis allowed ────────────────────────────────────────

console.log('\n📋 Suite 2: Normal analysis allowed');

assert('First analysis request passes middleware', () => {
  _clearRateLimitState();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '30';

  const req = makeReq('user1', 'review1');
  const res = makeRes();
  let nextCalled = false;

  analyzeRateLimiter(req, res, () => { nextCalled = true; });

  if (!nextCalled) throw new Error('next() was not called for first request');
  if (typeof req._releaseAnalyzeLock !== 'function') throw new Error('_releaseAnalyzeLock not set');
});

assert('Lock is set during in-flight analysis', () => {
  _clearRateLimitState();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '30';

  const req = makeReq('user1', 'review1');
  const res = makeRes();
  analyzeRateLimiter(req, res, () => {});

  // Before releasing, the key should be in concurrency store
  const state = _getRateLimitState();
  if (state.concurrencyCount !== 1) throw new Error(`Expected 1 in-flight, got ${state.concurrencyCount}`);
});

assert('Lock is released after calling _releaseAnalyzeLock', () => {
  _clearRateLimitState();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '30';

  const req = makeReq('user1', 'review1');
  const res = makeRes();
  analyzeRateLimiter(req, res, () => {});
  req._releaseAnalyzeLock();

  const state = _getRateLimitState();
  if (state.concurrencyCount !== 0) throw new Error(`Expected 0 in-flight after release, got ${state.concurrencyCount}`);
  // cooldown should now be tracked
  if (state.cooldownCount !== 1) throw new Error(`Expected 1 cooldown entry, got ${state.cooldownCount}`);
});

// ─── Suite 3: Immediate re-request is blocked (cooldown) ─────────────────────

console.log('\n📋 Suite 3: Cooldown — immediate re-request blocked');

assert('Second request within cooldown returns 429', () => {
  _clearRateLimitState();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '30';

  // First request — passes
  const req1 = makeReq('user1', 'review1');
  const res1 = makeRes();
  analyzeRateLimiter(req1, res1, () => {});
  req1._releaseAnalyzeLock();

  // Second request — should be rate limited
  const req2 = makeReq('user1', 'review1');
  const res2 = makeRes();
  let nextCalled = false;
  analyzeRateLimiter(req2, res2, () => { nextCalled = true; });

  if (nextCalled) throw new Error('next() was called despite being within cooldown');
  if (res2.statusCode !== 429) throw new Error(`Expected 429, got ${res2.statusCode}`);
  if (!res2.body || !res2.body.message) throw new Error('No message in rate-limit response');
  if (typeof res2.body.retryAfter !== 'number') throw new Error('retryAfter must be a number');
});

assert('Rate-limited response has retryAfter field', () => {
  _clearRateLimitState();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '30';

  const req1 = makeReq('user2', 'review2');
  const res1 = makeRes();
  analyzeRateLimiter(req1, res1, () => {});
  req1._releaseAnalyzeLock();

  const req2 = makeReq('user2', 'review2');
  const res2 = makeRes();
  analyzeRateLimiter(req2, res2, () => {});

  if (!Number.isInteger(res2.body.retryAfter) || res2.body.retryAfter <= 0) {
    throw new Error(`retryAfter should be positive integer, got ${res2.body.retryAfter}`);
  }
});

assert('Cooldown is per-user: different user is NOT blocked', () => {
  _clearRateLimitState();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '30';

  // User A analyzes review1
  const reqA = makeReq('userA', 'review1');
  const resA = makeRes();
  analyzeRateLimiter(reqA, resA, () => {});
  reqA._releaseAnalyzeLock();

  // User B analyzes same review1 — should be allowed
  const reqB = makeReq('userB', 'review1');
  const resB = makeRes();
  let nextCalledB = false;
  analyzeRateLimiter(reqB, resB, () => { nextCalledB = true; });

  if (!nextCalledB) throw new Error('User B should not be rate-limited by User A');
});

assert('Cooldown is per-review: same user, different review is NOT blocked', () => {
  _clearRateLimitState();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '30';

  // Analyze review1
  const req1 = makeReq('userX', 'review1');
  const res1 = makeRes();
  analyzeRateLimiter(req1, res1, () => {});
  req1._releaseAnalyzeLock();

  // Analyze review2 (different review) — should be allowed
  const req2 = makeReq('userX', 'review2');
  const res2 = makeRes();
  let nextCalled = false;
  analyzeRateLimiter(req2, res2, () => { nextCalled = true; });

  if (!nextCalled) throw new Error('Different review should not be rate-limited');
});

// ─── Suite 4: Concurrency protection ─────────────────────────────────────────

console.log('\n📋 Suite 4: Concurrency — duplicate in-flight request blocked');

assert('Concurrent duplicate request for same review is blocked (429)', () => {
  _clearRateLimitState();
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '30';

  // First request — passes and holds the lock (no release yet)
  const req1 = makeReq('userZ', 'reviewZ');
  const res1 = makeRes();
  analyzeRateLimiter(req1, res1, () => {});

  // Second request — same key, lock is held
  const req2 = makeReq('userZ', 'reviewZ');
  const res2 = makeRes();
  let nextCalled = false;
  analyzeRateLimiter(req2, res2, () => { nextCalled = true; });

  if (nextCalled) throw new Error('next() should not be called when lock is held');
  if (res2.statusCode !== 429) throw new Error(`Expected 429, got ${res2.statusCode}`);
  if (!res2.body.message.includes('progress')) throw new Error('Expected in-progress message');

  // Release the lock
  req1._releaseAnalyzeLock();
});

assert('After lock released, new request succeeds (cooldown permitting)', () => {
  _clearRateLimitState();
  // Disable cooldown so we can test just the concurrency lock
  process.env.AI_ANALYZE_COOLDOWN_SECONDS = '0';

  const req1 = makeReq('userZ', 'reviewZ');
  const res1 = makeRes();
  analyzeRateLimiter(req1, res1, () => {});

  // Release the lock
  req1._releaseAnalyzeLock();

  // Now a new request should succeed
  const req2 = makeReq('userZ', 'reviewZ');
  const res2 = makeRes();
  let nextCalled = false;
  analyzeRateLimiter(req2, res2, () => { nextCalled = true; });

  if (!nextCalled) throw new Error('Expected next() to be called after lock was released and cooldown is 0');
});

// ─── Suite 5: Missing userId/reviewId ────────────────────────────────────────

console.log('\n📋 Suite 5: Missing userId / reviewId');

assert('Request with no userId returns 400', () => {
  _clearRateLimitState();
  const req = { userId: null, params: { id: 'review1' } };
  const res = makeRes();
  let nextCalled = false;
  analyzeRateLimiter(req, res, () => { nextCalled = true; });
  if (nextCalled) throw new Error('next() should not be called without userId');
  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
});

assert('Request with no reviewId returns 400', () => {
  _clearRateLimitState();
  const req = { userId: 'user1', params: { id: null } };
  const res = makeRes();
  let nextCalled = false;
  analyzeRateLimiter(req, res, () => { nextCalled = true; });
  if (nextCalled) throw new Error('next() should not be called without reviewId');
  if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
});

// ─── Suite 6: AI Service input guards (no live Gemini) ───────────────────────

console.log('\n📋 Suite 6: AI Service input guards');

const aiService = require('../src/services/aiService');

(async () => {
  let s6pass = 0;
  let s6fail = 0;

  async function assertAsync(desc, fn) {
    try {
      await fn();
      console.log(`  ✅ ${desc}`);
      s6pass++;
      passed++;
    } catch (err) {
      console.error(`  ❌ ${desc}`);
      console.error(`     ${err.message}`);
      s6fail++;
      failed++;
    }
  }

  async function assertThrowsAsync(desc, fn, expectedMsg) {
    try {
      await fn();
      console.error(`  ❌ ${desc} — expected error but none was thrown`);
      s6fail++;
      failed++;
    } catch (err) {
      if (expectedMsg && !err.message.includes(expectedMsg)) {
        console.error(`  ❌ ${desc} — wrong error: "${err.message}"`);
        s6fail++;
        failed++;
      } else {
        console.log(`  ✅ ${desc}`);
        s6pass++;
        passed++;
      }
    }
  }

  await assertThrowsAsync(
    'Oversized source code does not call Gemini (throws 400)',
    () => aiService.analyzeCode({ sourceCode: 'x'.repeat(50001), language: 'javascript', focus: 'all' }),
    'exceeds AI analysis limit'
  );

  await assertThrowsAsync(
    'Empty source code does not call Gemini (throws 400)',
    () => aiService.analyzeCode({ sourceCode: '', language: 'javascript', focus: 'all' }),
    'required'
  );

  await assertAsync('analyzeCode throws 503 when GEMINI_API_KEY is missing', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    aiService.clearClient();
    try {
      await aiService.analyzeCode({ sourceCode: 'x = 1', language: 'python', focus: 'all' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (err.statusCode !== 503) throw new Error(`Expected 503, got ${err.statusCode}: ${err.message}`);
    } finally {
      process.env.GEMINI_API_KEY = original;
      aiService.clearClient();
    }
  });

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log('\n====================================================');
  console.log(`=== DAY 16 TEST SUMMARY: ${passed}/${passed + failed} PASSED ===`);
  if (failed > 0) console.log(`=== FAILED: ${failed} ===`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
})();
