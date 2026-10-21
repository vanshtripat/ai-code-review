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
  console.log('=== STARTING DAY 9 VERIFICATION & SECURITY TESTS ===');
  console.log('====================================================\n');

  // TEST 1: Health Check
  console.log('[TEST 1] Testing Backend Health Check (GET /api/health)...');
  const resHealth = await fetch(`${BASE_URL}/health`);
  const dataHealth = await resHealth.json();
  console.log(`Status: ${resHealth.status}`, dataHealth);
  if (resHealth.status !== 200 || !dataHealth.success || dataHealth.message !== 'API is running') {
    throw new Error('Health check test failed');
  }
  console.log('✔ Health check passed (200)\n');

  // TEST 2: GET /api/reviews without token
  console.log('[TEST 2] Testing GET /api/reviews without Authorization token (Expect 401)...');
  const resNoAuth = await fetch(`${BASE_URL}/reviews`);
  const dataNoAuth = await resNoAuth.json();
  console.log(`Status: ${resNoAuth.status}`, dataNoAuth);
  if (resNoAuth.status !== 401 || dataNoAuth.success) {
    throw new Error('Unauthenticated GET /api/reviews was not rejected with 401');
  }
  console.log('✔ Unauthenticated request correctly rejected with 401\n');

  // TEST 3: GET /api/reviews with invalid token
  console.log('[TEST 3] Testing GET /api/reviews with invalid token (Expect 401)...');
  const resBadToken = await fetch(`${BASE_URL}/reviews`, {
    headers: { 'Authorization': 'Bearer invalid.fake.token' }
  });
  const dataBadToken = await resBadToken.json();
  console.log(`Status: ${resBadToken.status}`, dataBadToken);
  if (resBadToken.status !== 401 || dataBadToken.success) {
    throw new Error('Invalid token on GET /api/reviews was not rejected with 401');
  }
  console.log('✔ Invalid token correctly rejected with 401\n');

  // SETUP: Create User A and User B
  console.log('[SETUP] Creating Test User A and User B...');
  const userA = {
    name: 'User A Day9',
    email: `usera_${Date.now()}@example.com`,
    password: 'PasswordA123'
  };
  const userB = {
    name: 'User B Day9',
    email: `userb_${Date.now()}@example.com`,
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

  console.log(`✔ User A created (ID: ${userAId})`);
  console.log(`✔ User B created (ID: ${userBId})\n`);

  // Submit Review A for User A
  console.log('[SETUP] Submitting Review A (User A) and Review B (User B)...');
  const resReviewA = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      language: 'javascript',
      sourceCode: 'console.log("Hello from User A");',
      focus: 'all'
    })
  });
  const dataReviewA = await resReviewA.json();
  const reviewAId = dataReviewA.review.id;

  // Submit Review B for User B
  const resReviewB = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`
    },
    body: JSON.stringify({
      language: 'python',
      sourceCode: 'print("Hello from User B")',
      focus: 'security'
    })
  });
  const dataReviewB = await resReviewB.json();
  const reviewBId = dataReviewB.review.id;

  console.log(`✔ Review A created (ID: ${reviewAId}) for User A`);
  console.log(`✔ Review B created (ID: ${reviewBId}) for User B\n`);

  // TEST 4: GET /api/reviews with User A token (returns only User A reviews)
  console.log('[TEST 4] Testing GET /api/reviews with User A token (Isolation check)...');
  const resGetReviewsA = await fetch(`${BASE_URL}/reviews`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataGetReviewsA = await resGetReviewsA.json();
  console.log(`Status: ${resGetReviewsA.status}`, dataGetReviewsA);
  if (
    resGetReviewsA.status !== 200 ||
    !dataGetReviewsA.success ||
    !Array.isArray(dataGetReviewsA.reviews) ||
    dataGetReviewsA.reviews.length !== 1 ||
    dataGetReviewsA.reviews[0].id !== reviewAId
  ) {
    throw new Error('Isolation check failed: User A did not receive only their own review');
  }
  // Confirm User B's review ID is not in User A's results
  const hasUserBReview = dataGetReviewsA.reviews.some(r => r.id === reviewBId);
  if (hasUserBReview) {
    throw new Error('CRITICAL SECURITY FLAW: User A received User B\'s review in GET /api/reviews!');
  }
  console.log('✔ Isolation confirmed: User A only received Review A.\n');

  // TEST 5: GET /api/reviews/:id with valid own review ID (Review A)
  console.log(`[TEST 5] Testing GET /api/reviews/${reviewAId} with User A token (Own review)...`);
  const resGetReviewA = await fetch(`${BASE_URL}/reviews/${reviewAId}`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataGetReviewA = await resGetReviewA.json();
  console.log(`Status: ${resGetReviewA.status}`, dataGetReviewA);
  if (
    resGetReviewA.status !== 200 ||
    !dataGetReviewA.success ||
    !dataGetReviewA.review ||
    dataGetReviewA.review.id !== reviewAId ||
    dataGetReviewA.review.language !== 'javascript'
  ) {
    throw new Error('Failed to retrieve own review');
  }
  console.log('✔ Successfully retrieved own review by ID (200)\n');

  // TEST 6: GET /api/reviews/:id with invalid ObjectId
  console.log('[TEST 6] Testing GET /api/reviews/not-a-valid-id (Expect 400 Bad Request)...');
  const resInvalidId = await fetch(`${BASE_URL}/reviews/not-a-valid-id`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataInvalidId = await resInvalidId.json();
  console.log(`Status: ${resInvalidId.status}`, dataInvalidId);
  if (resInvalidId.status !== 400 || dataInvalidId.success || dataInvalidId.message !== 'Invalid review ID.') {
    throw new Error('Invalid ObjectId was not handled with 400 Bad Request');
  }
  console.log('✔ Invalid ObjectId correctly handled with 400 "Invalid review ID."\n');

  // TEST 7: GET /api/reviews/:id with another user's review ID (Cross-user access)
  console.log(`[TEST 7] Testing GET /api/reviews/${reviewBId} with User A token (Accessing User B review)...`);
  const resCrossGet = await fetch(`${BASE_URL}/reviews/${reviewBId}`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataCrossGet = await resCrossGet.json();
  console.log(`Status: ${resCrossGet.status}`, dataCrossGet);
  if (resCrossGet.status !== 404 || dataCrossGet.success || dataCrossGet.message !== 'Review not found.') {
    throw new Error('CRITICAL SECURITY FLAW: Cross-user review access was not safely rejected with 404!');
  }
  console.log('✔ Cross-user GET correctly returned safe 404 "Review not found." (Zero information leakage)\n');

  // TEST 8: DELETE /api/reviews/:id with another user's review ID (Cross-user deletion)
  console.log(`[TEST 8] Testing DELETE /api/reviews/${reviewBId} with User A token (Deleting User B review)...`);
  const resCrossDelete = await fetch(`${BASE_URL}/reviews/${reviewBId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataCrossDelete = await resCrossDelete.json();
  console.log(`Status: ${resCrossDelete.status}`, dataCrossDelete);
  if (resCrossDelete.status !== 404 || dataCrossDelete.success || dataCrossDelete.message !== 'Review not found.') {
    throw new Error('CRITICAL SECURITY FLAW: Cross-user deletion attempt was not safely rejected with 404!');
  }
  console.log('✔ Cross-user DELETE correctly returned safe 404 "Review not found."\n');

  // TEST 9: DELETE /api/reviews/:id with invalid ObjectId
  console.log('[TEST 9] Testing DELETE /api/reviews/not-a-valid-id (Expect 400 Bad Request)...');
  const resDeleteInvalidId = await fetch(`${BASE_URL}/reviews/not-a-valid-id`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataDeleteInvalidId = await resDeleteInvalidId.json();
  console.log(`Status: ${resDeleteInvalidId.status}`, dataDeleteInvalidId);
  if (resDeleteInvalidId.status !== 400 || dataDeleteInvalidId.success || dataDeleteInvalidId.message !== 'Invalid review ID.') {
    throw new Error('Invalid ObjectId for DELETE was not rejected with 400');
  }
  console.log('✔ Invalid ObjectId for DELETE correctly returned 400 "Invalid review ID."\n');

  // TEST 10: DELETE /api/reviews/:id with own review ID (Review A)
  console.log(`[TEST 10] Testing DELETE /api/reviews/${reviewAId} with User A token (Own review)...`);
  const resDeleteOwn = await fetch(`${BASE_URL}/reviews/${reviewAId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataDeleteOwn = await resDeleteOwn.json();
  console.log(`Status: ${resDeleteOwn.status}`, dataDeleteOwn);
  if (resDeleteOwn.status !== 200 || !dataDeleteOwn.success || dataDeleteOwn.message !== 'Review deleted successfully.') {
    throw new Error('Failed to delete own review');
  }
  console.log('✔ Own review successfully deleted (200)\n');

  // TEST 11: GET /api/reviews after deletion
  console.log('[TEST 11] Testing GET /api/reviews for User A after deletion (Expect 0 reviews)...');
  const resGetAfterDelete = await fetch(`${BASE_URL}/reviews`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const dataGetAfterDelete = await resGetAfterDelete.json();
  console.log(`Status: ${resGetAfterDelete.status}`, dataGetAfterDelete);
  if (resGetAfterDelete.status !== 200 || dataGetAfterDelete.reviews.length !== 0) {
    throw new Error('Deleted review still appears in GET /api/reviews');
  }
  console.log('✔ Deleted review no longer appears for User A.\n');

  // TEST 12: Direct MongoDB Atlas Verification
  console.log('[TEST 12] Direct MongoDB Atlas Verification: Checking collections & document status...');
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Check Review A is truly gone from MongoDB
    const checkReviewA = await db.collection('reviews').findOne({ _id: new mongoose.Types.ObjectId(reviewAId) });
    if (checkReviewA) {
      throw new Error('Database check failed: Review A still exists in MongoDB after deletion!');
    }
    console.log('✔ Verified in MongoDB: Review A was permanently deleted from reviews collection.');

    // Check Review B is STILL INTACT in MongoDB (was NOT affected by User A's attempts)
    const checkReviewB = await db.collection('reviews').findOne({ _id: new mongoose.Types.ObjectId(reviewBId) });
    if (!checkReviewB) {
      throw new Error('CRITICAL SECURITY FLAW: User B\'s review was accidentally deleted or lost in MongoDB!');
    }
    if (checkReviewB.user.toString() !== userBId) {
      throw new Error('User B review ownership corrupted in MongoDB');
    }
    console.log('✔ Verified in MongoDB: User B\'s Review B remains completely intact and owned by User B.');

    // Cleanup test data
    await db.collection('reviews').deleteMany({ user: { $in: [new mongoose.Types.ObjectId(userAId), new mongoose.Types.ObjectId(userBId)] } });
    await db.collection('users').deleteMany({ _id: { $in: [new mongoose.Types.ObjectId(userAId), new mongoose.Types.ObjectId(userBId)] } });
    console.log('✔ Cleanup completed: Test users & reviews safely removed from MongoDB.');
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log('=== ALL 12 DAY 9 INTEGRATION & SECURITY TESTS PASSED! ✔✔✔ ===');
  console.log('====================================================');
};

runTests().catch((err) => {
  console.error('❌ Day 9 Test suite failed:', err);
  process.exit(1);
});
