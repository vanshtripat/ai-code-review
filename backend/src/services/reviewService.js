const mongoose = require('mongoose');
const Review = require('../models/Review');

const ALLOWED_LANGUAGES = ['javascript', 'typescript', 'java', 'python', 'cpp', 'c'];
const ALLOWED_FOCUS = ['all', 'bugs', 'security', 'performance', 'code_quality'];
const MAX_CODE_LENGTH = 50000;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

/**
 * Service to handle code review creation and persistence in MongoDB.
 * 
 * Flow:
 * 1. Validate inputs (userId, language, sourceCode, focus)
 * 2. Persist new review in MongoDB associated with userId
 * 3. Return sanitized review summary
 */
const createReview = async ({ userId, language, sourceCode, focus = 'all' }) => {
  // 1. Validate User ID
  if (!userId) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  // 2. Validate Language
  if (!language || typeof language !== 'string') {
    const error = new Error('Please select a supported programming language.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedLanguage = language.trim().toLowerCase();
  if (!ALLOWED_LANGUAGES.includes(normalizedLanguage)) {
    const error = new Error('Unsupported programming language.');
    error.statusCode = 400;
    throw error;
  }

  // 3. Validate Source Code (Preserve exact code whitespace)
  if (!sourceCode || typeof sourceCode !== 'string' || sourceCode.trim().length === 0) {
    const error = new Error('Source code is required.');
    error.statusCode = 400;
    throw error;
  }

  if (sourceCode.length > MAX_CODE_LENGTH) {
    const error = new Error('Code is too large. Maximum allowed size is 50,000 characters.');
    error.statusCode = 400;
    throw error;
  }

  // 4. Validate Focus
  if (!focus || typeof focus !== 'string') {
    const error = new Error('Invalid review focus.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedFocus = focus.trim().toLowerCase();
  if (!ALLOWED_FOCUS.includes(normalizedFocus)) {
    const error = new Error('Invalid review focus.');
    error.statusCode = 400;
    throw error;
  }

  // 5. Create Review Document in MongoDB
  const review = await Review.create({
    user: userId,
    language: normalizedLanguage,
    sourceCode, // Exact source code without destructive transformations
    focus: normalizedFocus
  });

  // 6. Return Sanitized Review Summary
  return {
    id: review._id.toString(),
    language: review.language,
    focus: review.focus,
    codeLength: review.sourceCode.length,
    createdAt: review.createdAt
  };
};

/**
 * Service to retrieve all reviews for the authenticated user.
 * Supports simple pagination and sorts newest first.
 * Enforces ownership via { user: userId }.
 */
const getUserReviews = async ({ userId, page = 1, limit = DEFAULT_PAGE_LIMIT }) => {
  if (!userId) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  // Parse and sanitize pagination parameters
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_PAGE_LIMIT));
  const skip = (parsedPage - 1) * parsedLimit;

  // Query database using indexed 'user' field, sorted newest first
  const [reviews, total] = await Promise.all([
    Review.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    Review.countDocuments({ user: userId })
  ]);

  // Format reviews for client
  const formattedReviews = reviews.map((rev) => ({
    id: rev._id.toString(),
    language: rev.language,
    focus: rev.focus,
    sourceCode: rev.sourceCode,
    aiResult: rev.aiResult,
    createdAt: rev.createdAt,
    updatedAt: rev.updatedAt
  }));

  return {
    reviews: formattedReviews,
    count: formattedReviews.length,
    total,
    page: parsedPage,
    totalPages: Math.ceil(total / parsedLimit) || 1,
    limit: parsedLimit
  };
};

/**
 * Service to retrieve a single review by ID for the authenticated owner.
 * Validates ObjectId and ensures { _id: reviewId, user: userId }.
 * Returns safe 404 if not found or owned by another user.
 */
const getReviewById = async ({ reviewId, userId }) => {
  if (!userId) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  // Validate ObjectId to prevent unhandled Mongoose CastError
  if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
    const error = new Error('Invalid review ID.');
    error.statusCode = 400;
    throw error;
  }

  // Find review strictly matching both reviewId and owner's userId
  const review = await Review.findOne({
    _id: reviewId,
    user: userId
  }).lean();

  if (!review) {
    const error = new Error('Review not found.');
    error.statusCode = 404;
    throw error;
  }

  return {
    id: review._id.toString(),
    language: review.language,
    focus: review.focus,
    sourceCode: review.sourceCode,
    aiResult: review.aiResult,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
};

/**
 * Service to delete a single review by ID for the authenticated owner.
 * Validates ObjectId and ensures { _id: reviewId, user: userId }.
 * Returns safe 404 if not found or owned by another user.
 */
const deleteReview = async ({ reviewId, userId }) => {
  if (!userId) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  // Validate ObjectId
  if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
    const error = new Error('Invalid review ID.');
    error.statusCode = 400;
    throw error;
  }

  // Find and delete strictly matching both reviewId and owner's userId
  const deletedReview = await Review.findOneAndDelete({
    _id: reviewId,
    user: userId
  });

  if (!deletedReview) {
    const error = new Error('Review not found.');
    error.statusCode = 404;
    throw error;
  }

  return {
    id: deletedReview._id.toString(),
    deleted: true
  };
};

/**
 * Service to save the validated AI result to a review.
 * Ensures the review belongs to the user.
 */
const saveAiResult = async ({ reviewId, userId, aiResult }) => {
  if (!userId) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
    const error = new Error('Invalid review ID.');
    error.statusCode = 400;
    throw error;
  }

  const review = await Review.findOne({ _id: reviewId, user: userId });
  if (!review) {
    const error = new Error('Review not found.');
    error.statusCode = 404;
    throw error;
  }

  review.aiResult = {
    ...aiResult,
    analyzedAt: new Date(),
    // modelUsed is passed in aiResult from the controller if present
    modelUsed: aiResult.modelUsed || undefined
  };

  await review.save();

  return {
    id: review._id.toString(),
    language: review.language,
    focus: review.focus,
    sourceCode: review.sourceCode,
    aiResult: review.aiResult,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
};

module.exports = {
  createReview,
  getUserReviews,
  getReviewById,
  deleteReview,
  saveAiResult,
  ALLOWED_LANGUAGES,
  ALLOWED_FOCUS,
  MAX_CODE_LENGTH,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT
};

