const BASE_URL = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('=== STARTING DAY 6 INTEGRATION & VERIFICATION TESTS ===\n');

  // Test 1: Backend Health
  console.log('[TEST 1] Testing Backend Health Check (GET /api/health)...');
  const resHealth = await fetch(`${BASE_URL}/health`);
  const dataHealth = await resHealth.json();
  console.log(`Status: ${resHealth.status}`, dataHealth);
  if (resHealth.status !== 200 || !dataHealth.success || dataHealth.message !== 'API is running') {
    throw new Error('Health check test failed');
  }
  console.log('✔ Health check passed\n');

  // Test 2: User Registration
  const testUser = {
    name: 'Alice Walker',
    email: `alice_${Date.now()}@example.com`,
    password: 'Password123'
  };

  console.log(`[TEST 2] Testing User Registration for ${testUser.email}...`);
  const resReg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser)
  });
  const dataReg = await resReg.json();
  console.log(`Status: ${resReg.status}`, dataReg);
  if (resReg.status !== 201 || !dataReg.success || !dataReg.user.id) {
    throw new Error('Registration test failed');
  }
  console.log('✔ Registration passed\n');

  // Test 3: Duplicate Registration
  console.log(`[TEST 3] Testing Duplicate Registration for ${testUser.email}...`);
  const resDup = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser)
  });
  const dataDup = await resDup.json();
  console.log(`Status: ${resDup.status}`, dataDup);
  if (resDup.status !== 400 || dataDup.success || !dataDup.message.includes('already exists')) {
    throw new Error('Duplicate registration test failed');
  }
  console.log('✔ Duplicate registration correctly rejected with friendly message\n');

  // Test 4: Successful Login
  console.log(`[TEST 4] Testing Successful Login for ${testUser.email}...`);
  const resLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testUser.email,
      password: testUser.password
    })
  });
  const dataLogin = await resLogin.json();
  console.log(`Status: ${resLogin.status}`, dataLogin);
  if (resLogin.status !== 200 || !dataLogin.success || !dataLogin.token || !dataLogin.user) {
    throw new Error('Login test failed');
  }
  if (dataLogin.user.password || dataLogin.user.passwordHash) {
    throw new Error('Security violation: password returned in login response');
  }
  console.log('✔ Login passed, JWT received, sanitized user profile returned\n');

  // Test 5: Wrong Password Login
  console.log(`[TEST 5] Testing Login with Wrong Password for ${testUser.email}...`);
  const resWrong = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testUser.email,
      password: 'WrongPassword999'
    })
  });
  const dataWrong = await resWrong.json();
  console.log(`Status: ${resWrong.status}`, dataWrong);
  if (resWrong.status !== 401 || dataWrong.success || dataWrong.token) {
    throw new Error('Wrong password test failed');
  }
  console.log('✔ Wrong password correctly rejected with generic 401 error\n');

  // Test 6: Unknown Email Login
  console.log('[TEST 6] Testing Login with Unknown Email...');
  const resUnknown = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'nonexistent_person_12345@example.com',
      password: 'Password123'
    })
  });
  const dataUnknown = await resUnknown.json();
  console.log(`Status: ${resUnknown.status}`, dataUnknown);
  if (resUnknown.status !== 401 || dataUnknown.success || dataUnknown.token) {
    throw new Error('Unknown email test failed');
  }
  console.log('✔ Unknown email correctly rejected without revealing existence\n');

  // Test 7: Frontend Vite Server Availability
  console.log('[TEST 7] Testing Frontend Server availability on http://localhost:5173...');
  const resFrontend = await fetch('http://localhost:5173');
  const textFrontend = await resFrontend.text();
  console.log(`Frontend Status: ${resFrontend.status}, contains root div: ${textFrontend.includes('root')}`);
  if (resFrontend.status !== 200 || !textFrontend.includes('root')) {
    throw new Error('Frontend server check failed');
  }
  console.log('✔ Frontend dev server is responding at http://localhost:5173\n');

  console.log('=== ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY! ===');
};

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
