const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { analyzeRateLimiter } = require('../middleware/rateLimitMiddleware');
const {
  submitReview,
  getUserReviews,
  getReviewById,
  deleteReview,
  analyzeReview,
  getAnalysisStatus,
  getDashboardStats
} = require('../controllers/reviewController');

const router = express.Router();

// All review routes require authentication
router.post('/', protect, submitReview);
router.get('/stats', protect, getDashboardStats);
router.get('/', protect, getUserReviews);
router.get('/:id', protect, getReviewById);
router.delete('/:id', protect, deleteReview);
// Rate limited analyze trigger
router.post('/:id/analyze', protect, analyzeRateLimiter, analyzeReview);
// Analysis status query for polling and refresh recovery
router.get('/:id/analysis-status', protect, getAnalysisStatus);

module.exports = router;
