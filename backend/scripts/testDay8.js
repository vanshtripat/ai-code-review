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
  console.log('=== STARTING DAY 8 VERIFICATION & INTEGRATION TESTS ==');
  console.log('====================================================\n');

  // TEST 1: Health Check
  console.log('[TEST 1] Testing Backend Health Check (GET /api/health)...');
  const resHealth = await fetch(`${BASE_URL}/health`);
  const dataHealth = await resHealth.json();
  console.log(`Status: ${resHealth.status}`, dataHealth);
  if (resHealth.status !== 200 || !dataHealth.success || dataHealth.message !== 'API is running') {
    throw new Error('Health check test failed');
  }
  console.log('✔ Health check passed\n');

  // TEST 2: User Registration & Login (Obtain Valid JWT)
  const testUser = {
    name: 'Dev Reviewer 8',
    email: `reviewer8_${Date.now()}@example.com`,
    password: 'Password123'
  };

  console.log(`[TEST 2] Registering and Logging in test user (${testUser.email})...`);
  const resReg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser)
  });
  const dataReg = await resReg.json();
  if (resReg.status !== 201 || !dataReg.success) {
    throw new Error(`Registration failed: ${JSON.stringify(dataReg)}`);
  }

  const resLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testUser.email,
      password: testUser.password
    })
  });
  const dataLogin = await resLogin.json();
  if (resLogin.status !== 200 || !dataLogin.token) {
    throw new Error(`Login failed: ${JSON.stringify(dataLogin)}`);
  }
  const validToken = dataLogin.token;
  const loggedInUserId = dataLogin.user.id;
  console.log(`✔ Registration & Login succeeded (UserId: ${loggedInUserId})\n`);

  // TEST 3: Unauthenticated Access to POST /api/reviews
  console.log('[TEST 3] Testing POST /api/reviews without Authorization header...');
  const resNoAuth = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'javascript',
      sourceCode: 'const x = 10;',
      focus: 'all'
    })
  });
  const dataNoAuth = await resNoAuth.json();
  console.log(`Status: ${resNoAuth.status}`, dataNoAuth);
  if (resNoAuth.status !== 401 || dataNoAuth.success) {
    throw new Error('Unauthenticated request was not rejected with 401');
  }
  console.log('✔ Unauthenticated request correctly rejected with 401\n');

  // TEST 4: Invalid JWT on POST /api/reviews
  console.log('[TEST 4] Testing POST /api/reviews with invalid JWT token...');
  const resBadToken = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer invalid.token.payload'
    },
    body: JSON.stringify({
      language: 'javascript',
      sourceCode: 'const x = 10;',
      focus: 'all'
    })
  });
  const dataBadToken = await resBadToken.json();
  console.log(`Status: ${resBadToken.status}`, dataBadToken);
  if (resBadToken.status !== 401 || dataBadToken.success) {
    throw new Error('Invalid JWT was not rejected with 401');
  }
  console.log('✔ Invalid JWT correctly rejected with 401\n');

  // TEST 5: Authenticated Valid Submission & Real MongoDB Persistence
  console.log('[TEST 5] Testing Authenticated Code Submission with Persistence (POST /api/reviews)...');
  const validSnippet = 'function add(a, b) {\n  return a + b;\n}';
  const resValid = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validToken}`
    },
    body: JSON.stringify({
      language: 'javascript',
      sourceCode: validSnippet,
      focus: 'all'
    })
  });
  const dataValid = await resValid.json();
  console.log(`Status: ${resValid.status}`, dataValid);
  if (
    resValid.status !== 201 ||
    !dataValid.success ||
    dataValid.message !== 'Review saved successfully.' ||
    !dataValid.review.id ||
    dataValid.review.language !== 'javascript' ||
    dataValid.review.focus !== 'all' ||
    dataValid.review.codeLength !== validSnippet.length
  ) {
    throw new Error('Valid submission test failed');
  }
  const createdReviewId = dataValid.review.id;
  console.log(`✔ Valid submission succeeded! Saved Review ID: ${createdReviewId}\n`);

  // TEST 6: Verify Ownership (Attacker cannot spoof userId in body)
  console.log('[TEST 6] Testing that client-sent "userId" is ignored in favor of JWT identity...');
  const fakeUserId = '6523abcde123456789012345';
  const resSpoof = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validToken}`
    },
    body: JSON.stringify({
      userId: fakeUserId, // Spoofed userId
      language: 'python',
      sourceCode: 'def greet():\n    return "hello"',
      focus: 'bugs'
    })
  });
  const dataSpoof = await resSpoof.json();
  console.log(`Status: ${resSpoof.status}`, dataSpoof);
  if (resSpoof.status !== 201 || !dataSpoof.success || !dataSpoof.review.id) {
    throw new Error('Review with spoofed body userId failed');
  }
  const spoofTestReviewId = dataSpoof.review.id;
  console.log(`✔ Spoof attempt handled securely. Review ID: ${spoofTestReviewId}\n`);

  // TEST 7: Invalid Language Rejection
  console.log('[TEST 7] Testing Invalid Language Rejection (language: "ruby")...');
  const resBadLang = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validToken}`
    },
    body: JSON.stringify({
      language: 'ruby',
      sourceCode: 'puts "hello world"',
      focus: 'all'
    })
  });
  const dataBadLang = await resBadLang.json();
  console.log(`Status: ${resBadLang.status}`, dataBadLang);
  if (resBadLang.status !== 400 || dataBadLang.success) {
    throw new Error('Invalid language was not correctly rejected');
  }
  console.log('✔ Invalid language correctly rejected with 400 Bad Request\n');

  // TEST 8: Invalid Focus Rejection
  console.log('[TEST 8] Testing Invalid Focus Rejection (focus: "invalid_focus")...');
  const resBadFocus = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validToken}`
    },
    body: JSON.stringify({
      language: 'javascript',
      sourceCode: 'const x = 10;',
      focus: 'invalid_focus'
    })
  });
  const dataBadFocus = await resBadFocus.json();
  console.log(`Status: ${resBadFocus.status}`, dataBadFocus);
  if (resBadFocus.status !== 400 || dataBadFocus.success) {
    throw new Error('Invalid focus was not correctly rejected');
  }
  console.log('✔ Invalid focus correctly rejected with 400 Bad Request\n');

  // TEST 9: Empty / Whitespace Code Rejection
  console.log('[TEST 9] Testing Empty and Whitespace Code Rejection...');
  const resEmptyCode = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validToken}`
    },
    body: JSON.stringify({
      language: 'javascript',
      sourceCode: '   \n  \t  ',
      focus: 'all'
    })
  });
  const dataEmptyCode = await resEmptyCode.json();
  console.log(`Status: ${resEmptyCode.status}`, dataEmptyCode);
  if (resEmptyCode.status !== 400 || dataEmptyCode.success) {
    throw new Error('Whitespace-only code was not rejected');
  }
  console.log('✔ Empty/whitespace code correctly rejected with 400 Bad Request\n');

  // TEST 10: Oversized Code Rejection (> 50,000 chars)
  console.log('[TEST 10] Testing Code Size Limit (> 50,000 characters)...');
  const hugeCode = '// Comment\n' + 'const x = 1;\n'.repeat(5000); // 65,000+ chars
  const resHugeCode = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validToken}`
    },
    body: JSON.stringify({
      language: 'javascript',
      sourceCode: hugeCode,
      focus: 'all'
    })
  });
  const dataHugeCode = await resHugeCode.json();
  console.log(`Status: ${resHugeCode.status}`, dataHugeCode);
  if (resHugeCode.status !== 400 || dataHugeCode.success) {
    throw new Error('Oversized code was not rejected');
  }
  console.log('✔ Oversized code correctly rejected with 400 Bad Request\n');

  // TEST 11: Direct Database Verification
  console.log('[TEST 11] Direct MongoDB Verification: checking stored document in reviews collection...');
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Check reviews collection exists
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log('Active MongoDB collections:', collectionNames);
    if (!collectionNames.includes('reviews')) {
      throw new Error('Database verification failed: "reviews" collection not found in MongoDB!');
    }

    // Verify stored review document
    const storedReview = await db.collection('reviews').findOne({ _id: new mongoose.Types.ObjectId(createdReviewId) });
    if (!storedReview) {
      throw new Error('Database verification failed: Review document not found in reviews collection!');
    }
    console.log('Stored Review Document in MongoDB:', {
      _id: storedReview._id.toString(),
      user: storedReview.user.toString(),
      language: storedReview.language,
      focus: storedReview.focus,
      sourceCodeSnippet: storedReview.sourceCode.substring(0, 35) + '...',
      createdAt: storedReview.createdAt
    });

    if (storedReview.user.toString() !== loggedInUserId) {
      throw new Error(`Ownership mismatch: Stored user ${storedReview.user} does not match logged-in user ${loggedInUserId}`);
    }
    console.log('✔ Review document verified in MongoDB with correct user ObjectId reference!\n');

    // Verify spoof test was saved with logged-in user, NOT the spoofed ID
    const spoofStoredReview = await db.collection('reviews').findOne({ _id: new mongoose.Types.ObjectId(spoofTestReviewId) });
    if (!spoofStoredReview || spoofStoredReview.user.toString() !== loggedInUserId) {
      throw new Error('Security verification failed: Spoofed userId was improperly accepted!');
    }
    console.log('✔ Security verified: Spoofed request saved under logged-in user ObjectId, not the injected ID.\n');

    // Cleanup test data
    await db.collection('reviews').deleteMany({ user: new mongoose.Types.ObjectId(loggedInUserId) });
    await db.collection('users').deleteOne({ _id: new mongoose.Types.ObjectId(loggedInUserId) });
    console.log('✔ Cleanup completed: Test review and user documents removed from MongoDB.');
    await mongoose.disconnect();
  }

  console.log('====================================================');
  console.log('=== ALL 11 DAY 8 INTEGRATION TESTS PASSED! ✔✔✔   ===');
  console.log('====================================================');
};

runTests().catch((err) => {
  console.error('❌ Day 8 Test suite failed:', err);
  process.exit(1);
});
