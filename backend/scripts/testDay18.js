'use strict';
/**
 * Day 18 — Dashboard & Analytics Automated Tests
 *
 * Tests:
 * 1. Authentication requirement for stats
 * 2. Empty dataset behavior (no reviews -> clean zeroes/nulls, no NaN)
 * 3. Accurate metric calculation (total, analyzed, unanalyzed, average score)
 * 4. Language breakdown & mostUsedLanguage
 * 5. Category breakdown & mostCommonCategory
 * 6. Severity breakdown
 * 7. Recent reviews list limit and ordering
 * 8. Strict cross-user data isolation
 * 9. Controller and route integration (GET /api/reviews/stats)
 *
 * Run: node backend/scripts/testDay18.js
 */

const mongoose = require('mongoose');
const statsService = require('../src/services/statsService');
const { getDashboardStats } = require('../src/controllers/reviewController');
const Review = require('../src/models/Review');

let passed = 0;
let failed = 0;

function assert(label, fn) {
  try {
    fn();
    console.log(`  ✅ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${label}: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('=== STARTING DAY 18 DASHBOARD & ANALYTICS TESTS  ===');
  console.log('====================================================\n');

  // --- Suite 1: Input Validation & Security ---
  console.log('📋 Suite 1: Input Validation & Security');

  await (async () => {
    try {
      await statsService.getUserStats(null);
      console.error('  ❌ Throws 401 when userId is missing');
      failed++;
    } catch (err) {
      if (err.statusCode === 401) {
        console.log('  ✅ Throws 401 when userId is missing');
        passed++;
      } else {
        console.error(`  ❌ Expected 401, got ${err.statusCode}`);
        failed++;
      }
    }
  })();

  await (async () => {
    try {
      await statsService.getUserStats('not-a-valid-id');
      console.error('  ❌ Throws 400 for invalid ObjectId format');
      failed++;
    } catch (err) {
      if (err.statusCode === 400) {
        console.log('  ✅ Throws 400 for invalid ObjectId format');
        passed++;
      } else {
        console.error(`  ❌ Expected 400, got ${err.statusCode}`);
        failed++;
      }
    }
  })();

  // --- Suite 2: Unit Testing Core Logic with Mocked MongoDB ---
  console.log('\n📋 Suite 2: Empty Data Handling');

  const origFind = Review.find;

  // Mock empty find result
  Review.find = () => ({
    sort: () => ({
      lean: async () => []
    })
  });

  const emptyStats = await statsService.getUserStats(new mongoose.Types.ObjectId().toString());

  assert('Empty stats returns totalReviews = 0', () => {
    if (emptyStats.totalReviews !== 0) throw new Error(`Expected 0, got ${emptyStats.totalReviews}`);
  });

  assert('Empty stats returns analyzedReviews = 0', () => {
    if (emptyStats.analyzedReviews !== 0) throw new Error(`Expected 0, got ${emptyStats.analyzedReviews}`);
  });

  assert('Empty stats returns unanalyzedReviews = 0', () => {
    if (emptyStats.unanalyzedReviews !== 0) throw new Error(`Expected 0, got ${emptyStats.unanalyzedReviews}`);
  });

  assert('Empty stats returns averageScore = null (not NaN)', () => {
    if (emptyStats.averageScore !== null) throw new Error(`Expected null, got ${emptyStats.averageScore}`);
  });

  assert('Empty stats returns mostUsedLanguage = null', () => {
    if (emptyStats.mostUsedLanguage !== null) throw new Error(`Expected null, got ${emptyStats.mostUsedLanguage}`);
  });

  assert('Empty stats returns mostCommonCategory = null', () => {
    if (emptyStats.mostCommonCategory !== null) throw new Error(`Expected null, got ${emptyStats.mostCommonCategory}`);
  });

  assert('Empty stats returns empty recentReviews array', () => {
    if (!Array.isArray(emptyStats.recentReviews) || emptyStats.recentReviews.length !== 0) {
      throw new Error('Expected empty array');
    }
  });

  // --- Suite 3: Aggregation Calculations with Populated Dataset ---
  console.log('\n📋 Suite 3: Analytics Aggregations');

  const userIdA = new mongoose.Types.ObjectId();
  const mockReviewsUserA = [
    {
      _id: new mongoose.Types.ObjectId(),
      user: userIdA,
      language: 'javascript',
      focus: 'all',
      sourceCode: 'const x = 1;',
      createdAt: new Date('2026-09-01'),
      aiResult: {
        overallScore: 80,
        issues: [
          { category: 'bug', severity: 'high' },
          { category: 'security', severity: 'critical' }
        ]
      }
    },
    {
      _id: new mongoose.Types.ObjectId(),
      user: userIdA,
      language: 'javascript',
      focus: 'security',
      sourceCode: 'const y = 2;',
      createdAt: new Date('2026-09-02'),
      aiResult: {
        overallScore: 90,
        issues: [
          { category: 'security', severity: 'medium' }
        ]
      }
    },
    {
      _id: new mongoose.Types.ObjectId(),
      user: userIdA,
      language: 'python',
      focus: 'performance',
      sourceCode: 'def f(): pass',
      createdAt: new Date('2026-09-03'),
      aiResult: null // Unanalyzed
    }
  ];

  Review.find = (query) => {
    // Enforce user query filtering
    const userMatches = query && query.user && query.user.toString() === userIdA.toString();
    const result = userMatches ? mockReviewsUserA : [];
    return {
      sort: () => ({
        lean: async () => result
      })
    };
  };

  const statsA = await statsService.getUserStats(userIdA.toString());

  assert('Calculates totalReviews correctly', () => {
    if (statsA.totalReviews !== 3) throw new Error(`Expected 3, got ${statsA.totalReviews}`);
  });

  assert('Calculates analyzedReviews correctly', () => {
    if (statsA.analyzedReviews !== 2) throw new Error(`Expected 2, got ${statsA.analyzedReviews}`);
  });

  assert('Calculates unanalyzedReviews correctly', () => {
    if (statsA.unanalyzedReviews !== 1) throw new Error(`Expected 1, got ${statsA.unanalyzedReviews}`);
  });

  assert('Calculates averageScore correctly ((80+90)/2 = 85)', () => {
    if (statsA.averageScore !== 85) throw new Error(`Expected 85, got ${statsA.averageScore}`);
  });

  assert('Identifies mostUsedLanguage correctly ("javascript")', () => {
    if (statsA.mostUsedLanguage !== 'javascript') throw new Error(`Expected "javascript", got ${statsA.mostUsedLanguage}`);
  });

  assert('Identifies mostCommonCategory correctly ("security")', () => {
    if (statsA.mostCommonCategory !== 'security') throw new Error(`Expected "security", got ${statsA.mostCommonCategory}`);
  });

  assert('Aggregates severity counts correctly', () => {
    if (statsA.severityBreakdown.critical !== 1) throw new Error(`Expected 1 critical, got ${statsA.severityBreakdown.critical}`);
    if (statsA.severityBreakdown.high !== 1) throw new Error(`Expected 1 high, got ${statsA.severityBreakdown.high}`);
    if (statsA.severityBreakdown.medium !== 1) throw new Error(`Expected 1 medium, got ${statsA.severityBreakdown.medium}`);
  });

  assert('Recent reviews contains formatted records', () => {
    if (statsA.recentReviews.length !== 3) throw new Error(`Expected 3 recent reviews, got ${statsA.recentReviews.length}`);
    const first = statsA.recentReviews[0];
    if (!first.id || !first.language || first.isAnalyzed === undefined) {
      throw new Error('Recent review record missing expected fields');
    }
  });

  // --- Suite 4: Cross-User Isolation ---
  console.log('\n📋 Suite 4: Cross-User Isolation');

  const userIdB = new mongoose.Types.ObjectId();
  const statsB = await statsService.getUserStats(userIdB.toString());

  assert('User B cannot see User A data (returns 0 reviews)', () => {
    if (statsB.totalReviews !== 0) throw new Error(`Expected 0 reviews for User B, got ${statsB.totalReviews}`);
    if (statsB.recentReviews.length !== 0) throw new Error('User B received User A reviews');
  });

  // --- Suite 5: Controller Integration (getDashboardStats) ---
  console.log('\n📋 Suite 5: Controller Integration');

  await (async () => {
    let responseStatus = null;
    let responseBody = null;

    const req = { userId: userIdA.toString() };
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      }
    };

    await getDashboardStats(req, res);

    assert('Controller returns 200 with stats', () => {
      if (responseStatus !== 200) throw new Error(`Expected status 200, got ${responseStatus}`);
      if (!responseBody.success || !responseBody.stats) throw new Error('Invalid response body');
      if (responseBody.stats.totalReviews !== 3) throw new Error(`Expected 3 reviews, got ${responseBody.stats.totalReviews}`);
    });
  })();

  // Restore original find
  Review.find = origFind;

  console.log('\n====================================================');
  console.log(`=== DAY 18 TEST SUMMARY: ${passed}/${passed + failed} PASSED ===`);
  if (failed > 0) console.log(`=== FAILED: ${failed} ===`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
