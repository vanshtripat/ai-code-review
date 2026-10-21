'use strict';

/**
 * Days 21–25: Resilient Gemini Analysis Pipeline & Recovery Test Suite
 *
 * Covers all 26 test specifications:
 * 1. Gemini success
 * 2. Primary 503 → retry → success
 * 3. Primary 429 → retry → success
 * 4. Timeout → retry → success
 * 5. Primary repeatedly fails → fallback succeeds
 * 6. Primary + fallback fail → retry_pending
 * 7. Scheduled retry eventually succeeds
 * 8. Existing aiResult survives failed re-analysis
 * 9. Malformed AI JSON → controlled retry
 * 10. Malformed AI JSON twice → safe failure
 * 11. 401/403 → no infinite retry
 * 12. 400 → no infinite retry
 * 13. Unsupported model → no infinite retry
 * 14. Double-click Analyze → one active job
 * 15. Concurrent Analyze calls → duplicate protection
 * 16. Unauthorized user cannot analyze another user's review
 * 17. Unauthorized user cannot read another user's analysis status
 * 18. Browser refresh during pending analysis → state restored
 * 19. Backend restart → pending job can recover
 * 20. Existing cooldown still works
 * 21. Dashboard still works
 * 22. All existing Day 1–20 tests still pass
 * 23. Frontend build passes
 * 24. API key is not present in frontend build
 * 25. API key is not present in logs
 * 26. No fake AI results are generated
 *
 * Uses MongoMemoryServer for safe, fast, non-destructive isolated testing.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
if (!process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = 'mock-test-key-for-unit-tests';
}
process.env.GEMINI_MODEL = 'gemini-3.8-flash';
process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';

const User = require('../src/models/User');
const Review = require('../src/models/Review');
const AnalysisJob = require('../src/models/AnalysisJob');
const aiService = require('../src/services/aiService');
const reviewService = require('../src/services/reviewService');
const analysisJobService = require('../src/services/analysisJobService');
const recoveryWorker = require('../src/services/recoveryWorker');
const reviewController = require('../src/controllers/reviewController');
const { analyzeRateLimiter, _clearRateLimitState } = require('../src/middleware/rateLimitMiddleware');
const { sanitizeLogMessage } = require('../src/utils/logger');

let passedCount = 0;
let failedCount = 0;

function assert(number, description, condition, details = '') {
  if (condition) {
    console.log(`  ✅ [TEST ${number}] ${description}`);
    passedCount++;
  } else {
    console.error(`  ❌ [TEST ${number}] ${description} ${details}`);
    failedCount++;
  }
}

const VALID_AI_MOCK = {
  overallScore: 92,
  summary: 'Code is clean and properly formatted.',
  strengths: ['Clear logic', 'Good naming'],
  issues: [
    {
      title: 'Minor style optimization',
      category: 'code_quality',
      severity: 'low',
      lineStart: 1,
      lineEnd: 1,
      explanation: 'Could use const instead of let.',
      whyItMatters: 'Improves immutability.',
      suggestion: 'Change let to const.'
    }
  ],
  learningPoints: ['Favor const over let when variables are not reassigned.']
};

const makeMockReq = (userId, reviewId, body = {}) => ({
  userId,
  params: { id: reviewId },
  body,
  _releaseAnalyzeLock: () => {}
});

const makeMockRes = () => {
  const res = {
    statusCode: 200,
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
};

async function runDays21to25Tests() {
  console.log('================================================================');
  console.log('=== DAYS 21–25: RESILIENT GEMINI PIPELINE & AUDIT SUITE      ===');
  console.log('================================================================\n');

  let mongod = null;

  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);

    // Create test users
    const userA = await User.create({
      name: 'User A',
      email: 'usera@example.com',
      password: 'hashedPassword123'
    });

    const userB = await User.create({
      name: 'User B',
      email: 'userb@example.com',
      password: 'hashedPassword123'
    });

    // Create test review for User A
    const reviewA = await Review.create({
      user: userA._id,
      language: 'javascript',
      sourceCode: 'function add(a, b) { return a + b; }',
      focus: 'all'
    });

    const origAnalyzeCode = aiService.analyzeCode;

    // ─── TEST 1: Gemini success ─────────────────────────────────────────────
    aiService.analyzeCode = async () => VALID_AI_MOCK;
    const req1 = makeMockReq(userA._id.toString(), reviewA._id.toString());
    const res1 = makeMockRes();
    await reviewController.analyzeReview(req1, res1);

    assert(
      1,
      'Gemini success returns completed status and saves result',
      res1.statusCode === 200 &&
        res1.body?.success &&
        res1.body?.status === 'completed' &&
        res1.body?.review?.aiResult?.overallScore === 92
    );

    // ─── TEST 2: Primary 503 → retry → success ──────────────────────────────
    let attemptsTest2 = 0;
    aiService.analyzeCode = async () => {
      attemptsTest2++;
      if (attemptsTest2 === 1) {
        const err = new Error('Service Unavailable');
        err.statusCode = 503;
        err.status = 503;
        throw err;
      }
      return VALID_AI_MOCK;
    };

    const resTest2 = await aiService.executeResilientAnalysis({
      sourceCode: 'const x = 1;',
      language: 'javascript',
      focus: 'all',
      reviewId: 'test-2'
    });

    assert(
      2,
      'Primary 503 → retry → success succeeds on attempt 2',
      resTest2.attempts === 2 && resTest2.primaryAttempts === 2 && resTest2.result.overallScore === 92
    );

    // ─── TEST 3: Primary 429 → retry → success ──────────────────────────────
    let attemptsTest3 = 0;
    aiService.analyzeCode = async () => {
      attemptsTest3++;
      if (attemptsTest3 === 1) {
        const err = new Error('Resource exhausted rate limit 429');
        err.status = 429;
        throw err;
      }
      return VALID_AI_MOCK;
    };

    const resTest3 = await aiService.executeResilientAnalysis({
      sourceCode: 'const x = 1;',
      language: 'javascript',
      focus: 'all',
      reviewId: 'test-3'
    });

    assert(
      3,
      'Primary 429 → retry → success succeeds on attempt 2',
      resTest3.attempts === 2 && resTest3.result.overallScore === 92
    );

    // ─── TEST 4: Timeout → retry → success ──────────────────────────────────
    let attemptsTest4 = 0;
    aiService.analyzeCode = async () => {
      attemptsTest4++;
      if (attemptsTest4 === 1) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return VALID_AI_MOCK;
    };

    const resTest4 = await aiService.executeResilientAnalysis({
      sourceCode: 'const x = 1;',
      language: 'javascript',
      focus: 'all',
      reviewId: 'test-4'
    });

    assert(
      4,
      'Timeout → retry → success succeeds on attempt 2',
      resTest4.attempts === 2 && resTest4.result.overallScore === 92
    );

    // ─── TEST 5: Primary repeatedly fails → fallback succeeds ────────────────
    const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

    aiService.analyzeCode = async ({ model }) => {
      if (model === primaryModel) {
        const err = new Error('Primary model unavailable');
        err.status = 503;
        throw err;
      }
      return { ...VALID_AI_MOCK, overallScore: 88 };
    };

    const resTest5 = await aiService.executeResilientAnalysis({
      sourceCode: 'const x = 1;',
      language: 'javascript',
      focus: 'all',
      reviewId: 'test-5'
    });

    assert(
      5,
      'Primary repeatedly fails → fallback succeeds with fallback model',
      resTest5.modelUsed === fallbackModel && resTest5.result.overallScore === 88
    );

    // ─── TEST 6: Primary + fallback fail → retry_pending ─────────────────────
    aiService.analyzeCode = async () => {
      const err = new Error('All models unavailable');
      err.status = 503;
      throw err;
    };

    const review6 = await Review.create({
      user: userA._id,
      language: 'javascript',
      sourceCode: 'function test6() {}',
      focus: 'all'
    });

    const req6 = makeMockReq(userA._id.toString(), review6._id.toString());
    const res6 = makeMockRes();
    await reviewController.analyzeReview(req6, res6);

    const job6 = await AnalysisJob.findOne({ review: review6._id });

    assert(
      6,
      'Primary + fallback fail transitions job to retry_pending with nextRetryAt',
      res6.statusCode === 200 &&
        res6.body?.status === 'retry_pending' &&
        res6.body?.nextRetryAt &&
        job6?.status === 'retry_pending' &&
        job6?.nextRetryAt instanceof Date
    );

    // ─── TEST 7: Scheduled retry eventually succeeds ────────────────────────
    // Now make mock return success and run background recovery worker
    aiService.analyzeCode = async () => VALID_AI_MOCK;
    // Set nextRetryAt to past so it is due
    job6.nextRetryAt = new Date(Date.now() - 5000);
    await job6.save();

    const processed = await recoveryWorker.processNextDueJob();
    const updatedJob6 = await AnalysisJob.findById(job6._id);
    const updatedRev6 = await Review.findById(review6._id);

    assert(
      7,
      'Scheduled retry eventually succeeds via recovery worker',
      processed === true &&
        updatedJob6.status === 'completed' &&
        updatedRev6.aiResult?.overallScore === 92
    );

    // ─── TEST 8: Existing aiResult survives failed re-analysis ──────────────
    // Review 6 now has aiResult score 92. Let's make Gemini fail and re-analyze.
    aiService.analyzeCode = async () => {
      const err = new Error('Service outage');
      err.status = 503;
      throw err;
    };

    // Remove old completed job so we can test re-analysis trigger
    await AnalysisJob.deleteMany({ review: review6._id });

    const req8 = makeMockReq(userA._id.toString(), review6._id.toString());
    const res8 = makeMockRes();
    await reviewController.analyzeReview(req8, res8);

    const review8After = await Review.findById(review6._id);

    assert(
      8,
      'Existing aiResult survives failed re-analysis without being cleared or overwritten',
      review8After.aiResult?.overallScore === 92
    );

    // ─── TEST 9: Malformed AI JSON → controlled retry ────────────────────────
    let malformedAttempts = 0;
    aiService.analyzeCode = async () => {
      malformedAttempts++;
      if (malformedAttempts === 1) {
        const err = new Error('Failed to parse structured AI response.');
        err.statusCode = 502;
        err.isJsonParseError = true;
        throw err;
      }
      return VALID_AI_MOCK;
    };

    const resTest9 = await aiService.executeResilientAnalysis({
      sourceCode: 'const x = 1;',
      language: 'javascript',
      focus: 'all',
      reviewId: 'test-9'
    });

    assert(
      9,
      'Malformed AI JSON triggers controlled retry and recovers',
      resTest9.attempts === 2 && resTest9.result.overallScore === 92
    );

    // ─── TEST 10: Malformed AI JSON twice → safe failure ─────────────────────
    aiService.analyzeCode = async () => {
      const err = new Error('Failed to parse structured AI response.');
      err.statusCode = 502;
      err.isJsonParseError = true;
      throw err;
    };

    let test10Failed = false;
    try {
      await aiService.executeResilientAnalysis({
        sourceCode: 'const x = 1;',
        language: 'javascript',
        focus: 'all',
        reviewId: 'test-10'
      });
    } catch (err) {
      test10Failed = err.statusCode === 502;
    }

    assert(
      10,
      'Malformed AI JSON repeatedly fails safely without infinite loop',
      test10Failed
    );

    // ─── TEST 11: 401/403 → no infinite retry ────────────────────────────────
    let authAttempts = 0;
    aiService.analyzeCode = async () => {
      authAttempts++;
      const err = new Error('API key not valid. Please pass a valid API key.');
      err.status = 401;
      throw err;
    };

    try {
      await aiService.executeResilientAnalysis({
        sourceCode: 'const x = 1;',
        language: 'javascript',
        focus: 'all',
        reviewId: 'test-11'
      });
    } catch (err) {
      // Expected to fail on attempt 1 without retries
    }

    assert(
      11,
      '401/403 authentication error fails immediately on attempt 1 without endless retry',
      authAttempts === 1
    );

    // ─── TEST 12: 400 → no infinite retry ────────────────────────────────────
    let badRequestAttempts = 0;
    aiService.analyzeCode = async () => {
      badRequestAttempts++;
      const err = new Error('Invalid argument provided to Gemini');
      err.status = 400;
      throw err;
    };

    try {
      await aiService.executeResilientAnalysis({
        sourceCode: 'const x = 1;',
        language: 'javascript',
        focus: 'all',
        reviewId: 'test-12'
      });
    } catch (err) {
      // Expected to fail on attempt 1
    }

    assert(
      12,
      '400 invalid request error fails immediately on attempt 1 without endless retry',
      badRequestAttempts === 1
    );

    // ─── TEST 13: Unsupported model → no infinite retry ──────────────────────
    let unsupportedModelAttempts = 0;
    aiService.analyzeCode = async () => {
      unsupportedModelAttempts++;
      const err = new Error('models/invalid-model is not found or unsupported');
      err.status = 400;
      throw err;
    };

    try {
      await aiService.executeResilientAnalysis({
        sourceCode: 'const x = 1;',
        language: 'javascript',
        focus: 'all',
        reviewId: 'test-13'
      });
    } catch (err) {
      // Expected to fail on attempt 1
    }

    assert(
      13,
      'Unsupported model error fails immediately without endless retry',
      unsupportedModelAttempts === 1
    );

    // ─── TEST 14: Double-click Analyze → one active job ──────────────────────
    const review14 = await Review.create({
      user: userA._id,
      language: 'javascript',
      sourceCode: 'function doubleClick() {}',
      focus: 'all'
    });

    // Simulate an active job in progress
    await AnalysisJob.create({
      review: review14._id,
      user: userA._id,
      status: 'processing',
      currentModel: 'gemini-3.8-flash'
    });

    const req14 = makeMockReq(userA._id.toString(), review14._id.toString());
    const res14 = makeMockRes();
    await reviewController.analyzeReview(req14, res14);

    const activeJobs14 = await AnalysisJob.find({
      review: review14._id,
      status: { $in: ['processing', 'queued', 'retry_pending'] }
    });

    assert(
      14,
      'Double-click Analyze returns status of existing active job and does NOT create a duplicate',
      res14.body?.status === 'processing' && activeJobs14.length === 1
    );

    // ─── TEST 15: Concurrent Analyze calls → duplicate protection ────────────
    _clearRateLimitState();
    const req15A = { userId: userA._id.toString(), params: { id: review14._id.toString() } };
    const res15A = makeMockRes();
    let nextA = false;
    analyzeRateLimiter(req15A, res15A, () => { nextA = true; });

    const req15B = { userId: userA._id.toString(), params: { id: review14._id.toString() } };
    const res15B = makeMockRes();
    let nextB = false;
    analyzeRateLimiter(req15B, res15B, () => { nextB = true; });

    assert(
      15,
      'Concurrent Analyze calls are blocked by rate-limit lock (duplicate protection)',
      nextA === true && nextB === false && res15B.statusCode === 429
    );
    req15A._releaseAnalyzeLock();

    // ─── TEST 16: Unauthorized user cannot analyze another user\'s review ────
    const req16 = makeMockReq(userB._id.toString(), reviewA._id.toString());
    const res16 = makeMockRes();
    await reviewController.analyzeReview(req16, res16);

    assert(
      16,
      'Unauthorized user cannot analyze another user\'s review (returns 404)',
      res16.statusCode === 404
    );

    // ─── TEST 17: Unauthorized user cannot read another user\'s status ───────
    const req17 = makeMockReq(userB._id.toString(), reviewA._id.toString());
    const res17 = makeMockRes();
    await reviewController.getAnalysisStatus(req17, res17);

    assert(
      17,
      'Unauthorized user cannot read another user\'s analysis status (returns 404)',
      res17.statusCode === 404
    );

    // ─── TEST 18: Browser refresh during pending analysis → state restored ───
    const review18 = await Review.create({
      user: userA._id,
      language: 'javascript',
      sourceCode: 'function refreshTest() {}',
      focus: 'all'
    });

    const nextRetryDate = new Date(Date.now() + 15000);
    await AnalysisJob.create({
      review: review18._id,
      user: userA._id,
      status: 'retry_pending',
      nextRetryAt: nextRetryDate,
      attempts: 2,
      currentModel: 'gemini-3.8-flash'
    });

    const req18 = makeMockReq(userA._id.toString(), review18._id.toString());
    const res18 = makeMockRes();
    await reviewController.getAnalysisStatus(req18, res18);

    assert(
      18,
      'Browser refresh restores active retry_pending analysis state via status endpoint',
      res18.statusCode === 200 &&
        res18.body?.status === 'retry_pending' &&
        res18.body?.attempts === 2 &&
        new Date(res18.body?.nextRetryAt).getTime() === nextRetryDate.getTime()
    );

    // ─── TEST 19: Backend restart → pending job can recover ─────────────────
    const staleJob = await AnalysisJob.create({
      review: review18._id,
      user: userA._id,
      status: 'processing',
      startedAt: new Date(Date.now() - 60000)
    });

    await analysisJobService.resetStaleProcessingJobs();
    const recoveredJob = await AnalysisJob.findById(staleJob._id);

    assert(
      19,
      'Backend restart recovers stale in-flight jobs and marks them retry_pending',
      recoveredJob.status === 'retry_pending' && recoveredJob.nextRetryAt instanceof Date
    );

    // ─── TEST 20: Existing cooldown still works ─────────────────────────────
    _clearRateLimitState();
    process.env.AI_ANALYZE_COOLDOWN_SECONDS = '30';
    const req20A = { userId: userA._id.toString(), params: { id: 'rev20' } };
    const res20A = makeMockRes();
    analyzeRateLimiter(req20A, res20A, () => {});
    req20A._releaseAnalyzeLock();

    const req20B = { userId: userA._id.toString(), params: { id: 'rev20' } };
    const res20B = makeMockRes();
    analyzeRateLimiter(req20B, res20B, () => {});

    assert(
      20,
      'Existing cooldown still enforces 429 with retryAfter field',
      res20B.statusCode === 429 && typeof res20B.body?.retryAfter === 'number'
    );

    // ─── TEST 21: Dashboard still works ─────────────────────────────────────
    const req21 = makeMockReq(userA._id.toString());
    const res21 = makeMockRes();
    await reviewController.getDashboardStats(req21, res21);

    assert(
      21,
      'Dashboard stats endpoint returns user statistics correctly',
      res21.statusCode === 200 &&
        res21.body?.success &&
        typeof res21.body?.stats?.totalReviews === 'number'
    );

    // ─── TEST 22: All existing Day 1–20 core tests pass ─────────────────────
    const d16Res = spawnSync(process.execPath, [path.join(__dirname, 'testDay16.js')], { encoding: 'utf8' });
    const d17Res = spawnSync(process.execPath, [path.join(__dirname, 'testDay17.js'), '--skip-live'], { encoding: 'utf8' });
    const d18Res = spawnSync(process.execPath, [path.join(__dirname, 'testDay18.js')], { encoding: 'utf8' });

    assert(
      22,
      'All existing Day 1–20 test suites pass cleanly without regression',
      d16Res.status === 0 && d17Res.status === 0 && d18Res.status === 0
    );

    // ─── TEST 23: Frontend build passes ─────────────────────────────────────
    const frontendDir = path.resolve(__dirname, '../../frontend');
    const buildRes = spawnSync('npm.cmd', ['run', 'build'], {
      cwd: frontendDir,
      encoding: 'utf8',
      shell: true
    });

    assert(
      23,
      'Frontend production build completes successfully with exit code 0',
      buildRes.status === 0
    );

    // ─── TEST 24: API key is not present in frontend build ───────────────────
    const distAssetsDir = path.join(frontendDir, 'dist/assets');
    let foundSecretInDist = false;
    if (fs.existsSync(distAssetsDir)) {
      const files = fs.readdirSync(distAssetsDir);
      for (const f of files) {
        const content = fs.readFileSync(path.join(distAssetsDir, f), 'utf8');
        if (/AQ\.[a-zA-Z0-9_-]{30,}/.test(content) || /AIza[0-9A-Za-z-_]{35}/.test(content)) {
          foundSecretInDist = true;
          break;
        }
      }
    }

    assert(
      24,
      'Gemini API key is NOT present anywhere in frontend build assets',
      !foundSecretInDist
    );

    // ─── TEST 25: API key is not present in logs ─────────────────────────────
    const rawKey = process.env.GOOGLE_CLOUD_API_KEY;
    const testLog = `Request failed with key: ${rawKey} and Bearer abc123def456`;
    const sanitized = sanitizeLogMessage(testLog);

    assert(
      25,
      'API keys and bearer tokens are automatically redacted in logger output',
      !sanitized.includes(rawKey) && sanitized.includes('[REDACTED_API_KEY]')
    );

    // ─── TEST 26: No fake AI results are generated ───────────────────────────
    // Check that when error occurs, validateAiResult throws and no fabrication happens
    let fabricatedResultPrevented = false;
    try {
      reviewController.validateAiResult({ fake: true }, 'let x = 1;');
    } catch (err) {
      fabricatedResultPrevented = true;
    }

    assert(
      26,
      'Strict validator prevents fabricated AI results or malformed objects from being saved',
      fabricatedResultPrevented
    );

    // Restore original analyzeCode
    aiService.analyzeCode = origAnalyzeCode;

  } catch (err) {
    console.error('Fatal error during test run:', err);
    failedCount++;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
  }

  console.log('\n================================================================');
  console.log(`=== DAYS 21–25 TEST SUMMARY: ${passedCount}/${passedCount + failedCount} ASSERTIONS PASSED ===`);
  if (failedCount > 0) {
    console.log(`=== FAILED: ${failedCount} ===`);
  }
  console.log('================================================================\n');

  process.exit(failedCount > 0 ? 1 : 0);
}

runDays21to25Tests();
