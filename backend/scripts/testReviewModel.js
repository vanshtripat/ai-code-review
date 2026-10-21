const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Review = require('../src/models/Review');
const reviewService = require('../src/services/reviewService');

const runTests = async () => {
  console.log('====================================================');
  console.log('=== STARTING DAY 8 REVIEW MODEL TESTS ===');
  console.log('====================================================\n');

  let testUser = null;
  let testReviewId = null;

  try {
    // Connect to database
    await connectDB();
    await Review.init();
    await User.init();

    // Create a temporary user for relationship testing
    const testEmail = `review_tester_${Date.now()}@example.com`;
    testUser = await User.create({
      name: 'Review Test User',
      email: testEmail,
      password: 'hashedPassword123'
    });
    console.log(`✔ Temporary test user created with ID: ${testUser._id}\n`);

    // TEST 1: Valid Review Creation
    console.log('--- TEST 1: Valid Review Creation ---');
    const validReviewData = {
      user: testUser._id,
      language: 'javascript',
      sourceCode: 'function add(a, b) {\n  return a + b;\n}',
      focus: 'all'
    };
    const createdReview = await Review.create(validReviewData);
    testReviewId = createdReview._id;
    console.log('✔ Valid Review created successfully:', {
      id: createdReview._id.toString(),
      user: createdReview.user.toString(),
      language: createdReview.language,
      focus: createdReview.focus,
      codeLength: createdReview.sourceCode.length,
      createdAt: createdReview.createdAt
    });

    // TEST 2: Missing User Reference
    console.log('\n--- TEST 2: Validation - Missing User ---');
    try {
      await Review.create({
        language: 'javascript',
        sourceCode: 'const x = 1;',
        focus: 'all'
      });
      throw new Error('TEST 2 FAILED: Missing user should have thrown validation error.');
    } catch (err) {
      if (err.message.includes('TEST 2 FAILED')) throw err;
      console.log('✔ Correctly rejected missing user:', err.errors?.user?.message || err.message);
    }

    // TEST 3: Invalid Language
    console.log('\n--- TEST 3: Validation - Invalid Language ---');
    try {
      await Review.create({
        user: testUser._id,
        language: 'ruby',
        sourceCode: 'puts "hello"',
        focus: 'all'
      });
      throw new Error('TEST 3 FAILED: Invalid language should have thrown validation error.');
    } catch (err) {
      if (err.message.includes('TEST 3 FAILED')) throw err;
      console.log('✔ Correctly rejected invalid language:', err.errors?.language?.message || err.message);
    }

    // TEST 4: Missing Source Code
    console.log('\n--- TEST 4: Validation - Missing Source Code ---');
    try {
      await Review.create({
        user: testUser._id,
        language: 'javascript',
        focus: 'all'
      });
      throw new Error('TEST 4 FAILED: Missing sourceCode should have thrown validation error.');
    } catch (err) {
      if (err.message.includes('TEST 4 FAILED')) throw err;
      console.log('✔ Correctly rejected missing sourceCode:', err.errors?.sourceCode?.message || err.message);
    }

    // TEST 5: Whitespace-only Source Code (via Review Service)
    console.log('\n--- TEST 5: Validation - Whitespace-only Source Code ---');
    try {
      await reviewService.createReview({
        userId: testUser._id.toString(),
        language: 'javascript',
        sourceCode: '   \n\t  \n  ',
        focus: 'all'
      });
      throw new Error('TEST 5 FAILED: Whitespace-only sourceCode should have thrown validation error.');
    } catch (err) {
      if (err.message.includes('TEST 5 FAILED')) throw err;
      console.log('✔ Correctly rejected whitespace-only sourceCode:', err.message);
    }

    // TEST 6: Invalid Focus
    console.log('\n--- TEST 6: Validation - Invalid Focus ---');
    try {
      await Review.create({
        user: testUser._id,
        language: 'javascript',
        sourceCode: 'const x = 10;',
        focus: 'unsupported_focus'
      });
      throw new Error('TEST 6 FAILED: Invalid focus should have thrown validation error.');
    } catch (err) {
      if (err.message.includes('TEST 6 FAILED')) throw err;
      console.log('✔ Correctly rejected invalid focus:', err.errors?.focus?.message || err.message);
    }

    // TEST 7: Source Code Above 50,000 Characters
    console.log('\n--- TEST 7: Validation - Source Code Above 50,000 Characters ---');
    try {
      const hugeCode = 'const x = 1;\n'.repeat(4500); // 58,500 characters
      await Review.create({
        user: testUser._id,
        language: 'javascript',
        sourceCode: hugeCode,
        focus: 'all'
      });
      throw new Error('TEST 7 FAILED: Oversized source code should have thrown validation error.');
    } catch (err) {
      if (err.message.includes('TEST 7 FAILED')) throw err;
      console.log('✔ Correctly rejected oversized source code:', err.errors?.sourceCode?.message || err.message);
    }

    // TEST 8: Valid Review Belongs to Expected User
    console.log('\n--- TEST 8: Verify Review Belongs to Expected User ---');
    const reviewInDb = await Review.findById(testReviewId);
    if (!reviewInDb || reviewInDb.user.toString() !== testUser._id.toString()) {
      throw new Error('TEST 8 FAILED: Review user reference does not match expected user ID.');
    }
    console.log('✔ Review ownership verified: user ID in document matches test user ID (' + reviewInDb.user.toString() + ')');

    // TEST 9: Review Can Be Found in MongoDB
    console.log('\n--- TEST 9: Query Review from MongoDB ---');
    const queriedReview = await Review.findOne({ _id: testReviewId, user: testUser._id });
    if (!queriedReview) {
      throw new Error('TEST 9 FAILED: Review document could not be retrieved from MongoDB.');
    }
    console.log('✔ Successfully retrieved review document from MongoDB:', {
      _id: queriedReview._id.toString(),
      user: queriedReview.user.toString(),
      language: queriedReview.language,
      focus: queriedReview.focus,
      codeSnippet: queriedReview.sourceCode.substring(0, 30) + '...',
      createdAt: queriedReview.createdAt,
      updatedAt: queriedReview.updatedAt
    });

    // CLEANUP
    console.log('\n--- CLEANUP: Removing Test Documents ---');
    if (testReviewId) {
      await Review.deleteMany({ user: testUser._id });
      console.log('✔ Temporary test reviews removed from MongoDB.');
    }
    if (testUser) {
      await User.findByIdAndDelete(testUser._id);
      console.log('✔ Temporary test user removed from MongoDB.');
    }

    console.log('\n====================================================');
    console.log('=== ALL 9 REVIEW MODEL TESTS PASSED SUCCESSFULLY! ✔ ===');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Review Model test suite failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  }
};

runTests();
