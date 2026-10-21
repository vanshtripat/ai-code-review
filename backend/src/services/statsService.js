'use strict';
const mongoose = require('mongoose');
const Review = require('../models/Review');

/**
 * Dashboard Statistics Service (Day 18)
 *
 * Computes aggregated metrics strictly scoped to the authenticated user.
 * Never leaks data across users.
 * Handles empty datasets safely without NaN or crashes.
 */

/**
 * Retrieve aggregated statistics for a specific user.
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<Object>} User statistics object
 */
const getUserStats = async (userId) => {
  if (!userId) {
    const error = new Error('Authentication required to view statistics.');
    error.statusCode = 401;
    throw error;
  }

  // Ensure valid ObjectId format
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error('Invalid user ID.');
    error.statusCode = 400;
    throw error;
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Fetch all reviews for this user, sorted newest first
  const reviews = await Review.find({ user: userObjectId })
    .sort({ createdAt: -1 })
    .lean();

  const totalReviews = reviews.length;

  // Empty state handling
  if (totalReviews === 0) {
    return {
      totalReviews: 0,
      analyzedReviews: 0,
      unanalyzedReviews: 0,
      averageScore: null,
      mostUsedLanguage: null,
      mostCommonCategory: null,
      languageBreakdown: {},
      categoryBreakdown: {},
      severityBreakdown: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
      },
      recentReviews: []
    };
  }

  let analyzedCount = 0;
  let totalScore = 0;
  const languageCounts = {};
  const categoryCounts = {};
  const severityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };

  for (const review of reviews) {
    // Language counting
    if (review.language) {
      languageCounts[review.language] = (languageCounts[review.language] || 0) + 1;
    }

    // AI Analysis check
    const ai = review.aiResult;
    if (ai && typeof ai.overallScore === 'number') {
      analyzedCount++;
      totalScore += ai.overallScore;

      // Issue metrics
      if (Array.isArray(ai.issues)) {
        for (const issue of ai.issues) {
          if (issue.category) {
            categoryCounts[issue.category] = (categoryCounts[issue.category] || 0) + 1;
          }
          if (issue.severity && severityCounts[issue.severity] !== undefined) {
            severityCounts[issue.severity]++;
          }
        }
      }
    }
  }

  // Average score (null if no reviews analyzed yet)
  const averageScore = analyzedCount > 0 
    ? Math.round((totalScore / analyzedCount) * 10) / 10 
    : null;

  // Most used language
  let mostUsedLanguage = null;
  let maxLangCount = 0;
  for (const [lang, count] of Object.entries(languageCounts)) {
    if (count > maxLangCount) {
      maxLangCount = count;
      mostUsedLanguage = lang;
    }
  }

  // Most common issue category
  let mostCommonCategory = null;
  let maxCatCount = 0;
  for (const [cat, count] of Object.entries(categoryCounts)) {
    if (count > maxCatCount) {
      maxCatCount = count;
      mostCommonCategory = cat;
    }
  }

  // Recent 5 reviews
  const recentReviews = reviews.slice(0, 5).map((r) => ({
    id: r._id.toString(),
    language: r.language,
    focus: r.focus,
    codeLength: r.sourceCode ? r.sourceCode.length : 0,
    createdAt: r.createdAt,
    isAnalyzed: Boolean(r.aiResult && typeof r.aiResult.overallScore === 'number'),
    score: r.aiResult?.overallScore ?? null,
    issueCount: Array.isArray(r.aiResult?.issues) ? r.aiResult.issues.length : 0
  }));

  return {
    totalReviews,
    analyzedReviews: analyzedCount,
    unanalyzedReviews: totalReviews - analyzedCount,
    averageScore,
    mostUsedLanguage,
    mostCommonCategory,
    languageBreakdown: languageCounts,
    categoryBreakdown: categoryCounts,
    severityBreakdown: severityCounts,
    recentReviews
  };
};

module.exports = {
  getUserStats
};
