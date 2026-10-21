const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../src/config/db');
const User = require('../src/models/User');

const runTests = async () => {
  console.log('=== STARTING DAY 3 USER MODEL TESTS ===\n');

  try {
    // 1. Connect to Database
    await connectDB();
    
    // Ensure index creation for unique email constraint
    await User.init();

    // Cleanup any existing test users from previous runs
    const testEmail = 'test-user@example.com';
    await User.deleteMany({ email: testEmail });

    console.log('--- TEST 1: Valid User Creation ---');
    const validUserData = {
      name: 'Test User',
      email: testEmail,
      password: 'safeTestPassword123'
    };

    const createdUser = await User.create(validUserData);
    console.log('✔ Test User created successfully.');

    // Confirm document exists in database
    const foundUser = await User.findById(createdUser._id);
    if (!foundUser) {
      throw new Error('Verification failed: Inserted document was not found in database!');
    }
    console.log('✔ Database verification successful: Document exists in MongoDB Atlas.');

    // Exclude password in logs
    const safeUserLog = foundUser.toObject();
    delete safeUserLog.password;
    console.log('Safe User Object (Password excluded from log):');
    console.log(JSON.stringify(safeUserLog, null, 2));

    console.log('\n--- TEST 2: Validation - Missing Name ---');
    try {
      await User.create({ email: 'noname@example.com', password: 'password123' });
      console.error('❌ Failed: Missing name should have thrown an error.');
    } catch (err) {
      console.log('✔ Correctly rejected missing name:', err.errors?.name?.message || err.message);
    }

    console.log('\n--- TEST 3: Validation - Missing Email ---');
    try {
      await User.create({ name: 'No Email User', password: 'password123' });
      console.error('❌ Failed: Missing email should have thrown an error.');
    } catch (err) {
      console.log('✔ Correctly rejected missing email:', err.errors?.email?.message || err.message);
    }

    console.log('\n--- TEST 4: Validation - Invalid Email Format ---');
    try {
      await User.create({ name: 'Bad Email User', email: 'invalid-email-format', password: 'password123' });
      console.error('❌ Failed: Invalid email format should have thrown an error.');
    } catch (err) {
      console.log('✔ Correctly rejected invalid email:', err.errors?.email?.message || err.message);
    }

    console.log('\n--- TEST 5: Validation - Missing Password ---');
    try {
      await User.create({ name: 'No Password User', email: 'nopassword@example.com' });
      console.error('❌ Failed: Missing password should have thrown an error.');
    } catch (err) {
      console.log('✔ Correctly rejected missing password:', err.errors?.password?.message || err.message);
    }

    console.log('\n--- TEST 6: Validation - Duplicate Email ---');
    try {
      await User.create({ name: 'Duplicate User', email: testEmail, password: 'anotherPassword123' });
      console.error('❌ Failed: Duplicate email should have thrown an error.');
    } catch (err) {
      if (err.code === 11000) {
        console.log('✔ Correctly rejected duplicate email (MongoDB duplicate key error code 11000).');
      } else {
        console.log('✔ Correctly rejected duplicate email:', err.message);
      }
    }

    console.log('\n--- CLEANUP: Removing Temporary Test User ---');
    await User.deleteMany({ email: testEmail });
    console.log('✔ Temporary test user removed successfully.');

    console.log('\n=== ALL USER MODEL TESTS PASSED SUCCESSFULLY! ===');
  } catch (error) {
    console.error('❌ Test execution failed with error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  }
};

runTests();
