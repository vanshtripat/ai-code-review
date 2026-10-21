const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE_URL = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('====================================================');
  console.log('=== STARTING DAY 7 VERIFICATION & REGRESSION TESTS ==');
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
    name: 'Dev Reviewer',
    email: `reviewer_${Date.now()}@example.com`,
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
  console.log('✔ Registration & Login succeeded and valid JWT received\n');

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

  // TEST 5: Authenticated Valid Submission
  console.log('[TEST 5] Testing Authenticated Valid Code Submission (POST /api/reviews)...');
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
    dataValid.review.language !== 'javascript' ||
    dataValid.review.focus !== 'all' ||
    dataValid.review.codeLength !== validSnippet.length
  ) {
    throw new Error('Valid submission test failed');
  }
  console.log('✔ Valid submission succeeded with correct temporary response structure\n');

  // TEST 6: Invalid Language Rejection
  console.log('[TEST 6] Testing Invalid Language Rejection (language: "ruby")...');
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
  if (resBadLang.status !== 400 || dataBadLang.success || !dataBadLang.message.includes('supported programming language')) {
    throw new Error('Invalid language was not correctly rejected');
  }
  console.log('✔ Invalid language correctly rejected with 400 Bad Request\n');

  // TEST 7: Invalid Focus Rejection
  console.log('[TEST 7] Testing Invalid Focus Rejection (focus: "invalid_focus")...');
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
  if (resBadFocus.status !== 400 || dataBadFocus.success || !dataBadFocus.message.includes('Invalid review focus')) {
    throw new Error('Invalid focus was not correctly rejected');
  }
  console.log('✔ Invalid focus correctly rejected with 400 Bad Request\n');

  // TEST 8: Empty / Whitespace Code Rejection
  console.log('[TEST 8] Testing Empty and Whitespace Code Rejection...');
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
  if (resEmptyCode.status !== 400 || dataEmptyCode.success || !dataEmptyCode.message.includes('Source code is required')) {
    throw new Error('Whitespace-only code was not rejected');
  }
  console.log('✔ Empty/whitespace code correctly rejected with 400 Bad Request\n');

  // TEST 9: Oversized Code Rejection (> 50,000 chars)
  console.log('[TEST 9] Testing Code Size Limit (> 50,000 characters)...');
  const hugeCode = '// Comment\n' + 'const x = 1;\n'.repeat(5000); // 65,000+ chars
  console.log(`Sending payload of ${hugeCode.length} characters...`);
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
  if (resHugeCode.status !== 400 || dataHugeCode.success || !dataHugeCode.message.includes('Code is too large')) {
    throw new Error('Oversized code was not rejected');
  }
  console.log('✔ Oversized code correctly rejected with 400 Bad Request\n');

  // TEST 10: Database Connectivity Check
  // Note: The "reviews" collection now legitimately exists after Day 8 persistence was added.
  console.log('[TEST 10] Checking MongoDB connection and active collections...');
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log('Active MongoDB collections:', collectionNames);
    if (!collectionNames.includes('users')) {
      throw new Error('Database check failed: "users" collection not found in MongoDB');
    }
    console.log('✔ Database check passed: MongoDB connected, "users" collection exists\n');
    await mongoose.disconnect();
  } else {
    console.log('MONGODB_URI not found, skipping direct db listing');
  }

  console.log('====================================================');
  console.log('=== ALL 10 DAY 7 INTEGRATION TESTS PASSED! ✔✔✔   ===');
  console.log('====================================================');
};

runTests().catch((err) => {
  console.error('❌ Day 7 Test suite failed:', err);
  process.exit(1);
});
