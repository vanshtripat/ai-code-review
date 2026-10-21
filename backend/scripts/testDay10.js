const mongoose = require('mongoose');
const dns = require('dns');
const dotenv = require('dotenv');
const path = require('path');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const BASE_URL = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('====================================================');
  console.log('=== STARTING DAY 10 VERIFICATION & SECURITY TESTS ==');
  console.log('====================================================\n');

  // TEST 1: Health Check
  console.log('[TEST 1] Testing Backend Health Check (GET /api/health)...');
  const resHealth = await fetch(`${BASE_URL}/health`);
  const dataHealth = await resHealth.json();
  if (resHealth.status !== 200 || !dataHealth.success) {
    throw new Error('Health check test failed');
  }
  console.log('✔ Health check passed (200 OK)\n');

  // TEST 2: Setup User A and User B
  console.log('[SETUP] Creating Test User A and User B...');
  const userA = {
    name: 'Alice User A',
    email: `alice_${Date.now()}@example.com`,
    password: 'PasswordA123'
  };
  const userB = {
    name: 'Bob User B',
    email: `bob_${Date.now()}@example.com`,
    password: 'PasswordB123'
  };

  // Register & Login User A
  const resRegA = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userA)
  });
  const dataRegA = await resRegA.json();
  if (resRegA.status !== 201) throw new Error(`User A Registration failed: ${JSON.stringify(dataRegA)}`);

  const resLoginA = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userA.email, password: userA.password })
  });
  const dataLoginA = await resLoginA.json();
  const tokenA = dataLoginA.token;
  const userAId = dataLoginA.user.id;

  // Register & Login User B
  const resRegB = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userB)
  });
  const dataRegB = await resRegB.json();
  if (resRegB.status !== 201) throw new Error(`User B Registration failed: ${JSON.stringify(dataRegB)}`);

  const resLoginB = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userB.email, password: userB.password })
  });
  const dataLoginB = await resLoginB.json();
  const tokenB = dataLoginB.token;
  const userBId = dataLoginB.user.id;

  console.log(`✔ User A registered and logged in (ID: ${userAId})`);
  console.log(`✔ User B registered and logged in (ID: ${userBId})\n`);

  // Submissions: User A creates a JS review, User B creates a Python review
  console.log('[SETUP] Submitting Review for User A and Review for User B...');
  const resReviewA = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      language: 'javascript',
      sourceCode: 'function sum(a, b) {\n  return a + b;\n}\nconsole.log(sum(2, 3));',
      focus: 'all'
    })
  });
  const dataReviewA = await resReviewA.json();
  const reviewAId = dataReviewA.review.id;

  const resReviewB = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`
    },
    body: JSON.stringify({
      language: 'python',
      sourceCode: 'def authenticate(user, password):\n    return user == "admin" and password == "secret"',
      focus: 'security'
    })
  });
  const dataReviewB = await resReviewB.json();
  const reviewBId = dataReviewB.review.id;

  console.log(`✔ Review A created for User A (ID: ${reviewAId})`);
  console.log(`✔ Review B created for User B (ID: ${reviewBId})\n`);

  // =========================================================================
  // CRITICAL CROSS-USER SECURITY TESTS (POSTPONED FROM DAY 9)
  // =========================================================================

  // TEST A: Login as User A -> GET /reviews -> Only User A's reviews appear
  console.log('--- [CRITICAL SECURITY TEST A] User A calls GET /api/reviews ---');
  const resGetReviewsA = await fetch(`${BASE_URL}/reviews`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataGetReviewsA = await resGetReviewsA.json();
  console.log(`Status: ${resGetReviewsA.status}`, `Count: ${dataGetReviewsA.reviews.length}`);
  if (
    resGetReviewsA.status !== 200 ||
    !dataGetReviewsA.success ||
    dataGetReviewsA.reviews.length !== 1 ||
    dataGetReviewsA.reviews[0].id !== reviewAId
  ) {
    throw new Error('SECURITY TEST A FAILED: User A received reviews not belonging exclusively to User A');
  }
  const leakedReviewB = dataGetReviewsA.reviews.some(r => r.id === reviewBId);
  if (leakedReviewB) {
    throw new Error('CRITICAL SECURITY VIOLATION: User B\'s review appeared in User A\'s review history!');
  }
  console.log('✔ TEST A PASSED: Only User A\'s review appears in User A\'s review history list.\n');

  // TEST B: Authenticated as User A -> GET /api/reviews/USER_B_REVIEW_ID -> Expected: 404 "Review not found."
  console.log('--- [CRITICAL SECURITY TEST B] User A attempts to view User B\'s review (GET /api/reviews/USER_B_REVIEW_ID) ---');
  const resCrossGet = await fetch(`${BASE_URL}/reviews/${reviewBId}`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataCrossGet = await resCrossGet.json();
  console.log(`Status: ${resCrossGet.status}`, dataCrossGet);
  if (resCrossGet.status !== 404 || dataCrossGet.success || dataCrossGet.message !== 'Review not found.') {
    throw new Error('SECURITY TEST B FAILED: User A was able to view User B\'s review or got improper status');
  }
  console.log('✔ TEST B PASSED: User A cannot view User B\'s review. Received safe 404 "Review not found."\n');

  // TEST C: Authenticated as User A -> attempt DELETE /api/reviews/USER_B_REVIEW_ID -> Expected: 404 "Review not found."
  console.log('--- [CRITICAL SECURITY TEST C] User A attempts to delete User B\'s review (DELETE /api/reviews/USER_B_REVIEW_ID) ---');
  const resCrossDelete = await fetch(`${BASE_URL}/reviews/${reviewBId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataCrossDelete = await resCrossDelete.json();
  console.log(`Status: ${resCrossDelete.status}`, dataCrossDelete);
  if (resCrossDelete.status !== 404 || dataCrossDelete.success || dataCrossDelete.message !== 'Review not found.') {
    throw new Error('SECURITY TEST C FAILED: User A was able to delete User B\'s review or got improper status');
  }
  console.log('✔ TEST C PASSED: User A cannot delete User B\'s review. Received safe 404 "Review not found."\n');

  // TEST D: Open MongoDB -> Verify User B's review still exists intact
  console.log('--- [CRITICAL SECURITY TEST D] Database Verification: Verify User B\'s review still intact in MongoDB ---');
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const checkReviewB = await db.collection('reviews').findOne({ _id: new mongoose.Types.ObjectId(reviewBId) });
    if (!checkReviewB) {
      throw new Error('SECURITY TEST D FAILED: User B\'s review was deleted or modified in MongoDB!');
    }
    if (checkReviewB.user.toString() !== userBId) {
      throw new Error('SECURITY TEST D FAILED: User B\'s review owner was corrupted in MongoDB!');
    }
    console.log(`✔ TEST D PASSED: User B\'s review remains completely intact in MongoDB (Doc ID: ${checkReviewB._id}, User: ${checkReviewB.user}).\n`);

    // TEST E: Verify User A can view and delete their own review
    console.log('[TEST E] User A views own review (GET /api/reviews/USER_A_REVIEW_ID)...');
    const resGetOwn = await fetch(`${BASE_URL}/reviews/${reviewAId}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const dataGetOwn = await resGetOwn.json();
    if (resGetOwn.status !== 200 || dataGetOwn.review.id !== reviewAId) {
      throw new Error('User A failed to retrieve own review');
    }
    console.log('✔ User A successfully viewed own review.\n');

    console.log('[TEST F] User A deletes own review (DELETE /api/reviews/USER_A_REVIEW_ID)...');
    const resDeleteOwn = await fetch(`${BASE_URL}/reviews/${reviewAId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const dataDeleteOwn = await resDeleteOwn.json();
    if (resDeleteOwn.status !== 200 || !dataDeleteOwn.success) {
      throw new Error('User A failed to delete own review');
    }
    console.log('✔ User A successfully deleted own review.\n');

    // Confirm in DB
    const checkReviewA = await db.collection('reviews').findOne({ _id: new mongoose.Types.ObjectId(reviewAId) });
    if (checkReviewA) {
      throw new Error('Review A still exists in MongoDB after deletion');
    }
    console.log('✔ Verified in MongoDB: Review A removed after legitimate owner deletion.\n');

    // Cleanup
    await db.collection('reviews').deleteMany({ user: { $in: [new mongoose.Types.ObjectId(userAId), new mongoose.Types.ObjectId(userBId)] } });
    await db.collection('users').deleteMany({ _id: { $in: [new mongoose.Types.ObjectId(userAId), new mongoose.Types.ObjectId(userBId)] } });
    console.log('✔ Test data cleanup completed.');
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log('=== ALL DAY 10 INTEGRATION & SECURITY TESTS PASSED! ✔✔✔ ===');
  console.log('====================================================\n');
};

runTests().catch((err) => {
  console.error('❌ Day 10 Test failed:', err);
  process.exit(1);
});
