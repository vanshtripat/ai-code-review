const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../src/models/User');

const API_URL = 'http://localhost:5000/api/auth/register';

const runTests = async () => {
  console.log('=== STARTING DAY 4 API TESTS ===\n');

  // Cleanup pre-existing test users if needed
  await mongoose.connect(process.env.MONGODB_URI);
  await User.deleteMany({ email: { $in: ['test-registration@example.com', 'second-user@example.com'] } });

  const testCases = [
    {
      name: 'TEST 1 — Valid registration',
      body: {
        name: 'Test User',
        email: 'test-registration@example.com',
        password: 'testPassword123'
      },
      expectedStatus: 201,
      expectedSuccess: true
    },
    {
      name: 'TEST 2 — Duplicate email',
      body: {
        name: 'Test User Duplicate',
        email: 'test-registration@example.com',
        password: 'anotherPassword123'
      },
      expectedStatus: 400,
      expectedSuccess: false
    },
    {
      name: 'TEST 3 — Missing name',
      body: {
        email: 'noname@example.com',
        password: 'password123'
      },
      expectedStatus: 400,
      expectedSuccess: false
    },
    {
      name: 'TEST 4 — Missing email',
      body: {
        name: 'No Email User',
        password: 'password123'
      },
      expectedStatus: 400,
      expectedSuccess: false
    },
    {
      name: 'TEST 5 — Invalid email format',
      body: {
        name: 'Invalid Email User',
        email: 'invalid-email-format',
        password: 'password123'
      },
      expectedStatus: 400,
      expectedSuccess: false
    },
    {
      name: 'TEST 6 — Missing password',
      body: {
        name: 'No Password User',
        email: 'nopassword@example.com'
      },
      expectedStatus: 400,
      expectedSuccess: false
    },
    {
      name: 'TEST 7 — Password shorter than minimum (< 6 chars)',
      body: {
        name: 'Short Password User',
        email: 'shortpass@example.com',
        password: '123'
      },
      expectedStatus: 400,
      expectedSuccess: false
    },
    {
      name: 'TEST 8 — Different valid user',
      body: {
        name: 'Second Valid User',
        email: 'second-user@example.com',
        password: 'validPassword456'
      },
      expectedStatus: 201,
      expectedSuccess: true
    }
  ];

  const testResults = [];

  for (const test of testCases) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.body)
      });
      const data = await response.json();

      const statusPass = response.status === test.expectedStatus;
      const successPass = data.success === test.expectedSuccess;
      const noPasswordExposed = data.user ? !('password' in data.user) && !('passwordHash' in data.user) : true;

      const passed = statusPass && successPass && noPasswordExposed;

      testResults.push({
        test: test.name,
        passed,
        status: response.status,
        response: data
      });

      console.log(`[${passed ? 'PASS' : 'FAIL'}] ${test.name}`);
      console.log(`  HTTP Status: ${response.status} (Expected: ${test.expectedStatus})`);
      console.log(`  Response:`, JSON.stringify(data), '\n');
    } catch (err) {
      console.error(`[FAIL] ${test.name} threw error:`, err.message);
      testResults.push({ test: test.name, passed: false, error: err.message });
    }
  }

  // Database checks
  console.log('=== MONGODB COMPASS & SECURITY VERIFICATION ===');
  const createdUser = await User.findOne({ email: 'test-registration@example.com' });
  if (createdUser) {
    console.log('User found in DB:');
    console.log(`  Name: ${createdUser.name}`);
    console.log(`  Email: ${createdUser.email}`);
    console.log(`  createdAt: ${createdUser.createdAt}`);
    console.log(`  updatedAt: ${createdUser.updatedAt}`);
    const isHashed = createdUser.password.startsWith('$2b$') || createdUser.password.startsWith('$2a$');
    const isPlaintext = createdUser.password === 'testPassword123';
    console.log(`  Password Hashed ($2b$ prefix): ${isHashed}`);
    console.log(`  Password is NOT Plaintext: ${!isPlaintext}`);
  } else {
    console.log('Error: User not found in database!');
  }

  // Health check
  console.log('\n=== REGRESSION TESTING ===');
  try {
    const healthRes = await fetch('http://localhost:5000/api/health');
    const healthData = await healthRes.json();
    console.log(`[${healthRes.status === 200 && healthData.success ? 'PASS' : 'FAIL'}] Health endpoint (/api/health):`, healthData);
  } catch (err) {
    console.error('[FAIL] Health endpoint failed:', err.message);
  }

  await mongoose.disconnect();
  console.log('\n=== TEST RUN COMPLETE ===');
};

runTests();
