import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getReviews, deleteReview } from '../services/api';

const ReviewHistoryPage = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [reviewToDelete, setReviewToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await getReviews(token);
      if (data && data.success) {
        setReviews(data.reviews || []);
      } else {
        setErrorMessage('Unable to load your reviews. Please try again.');
      }
    } catch (error) {
      if (error.status === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      setErrorMessage('Unable to load your reviews. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token, logout, navigate]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const confirmDelete = (review) => {
    setReviewToDelete(review);
  };

  const cancelDelete = () => {
    setReviewToDelete(null);
  };

  // Close delete modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && reviewToDelete && !deleting) {
        setReviewToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reviewToDelete, deleting]);

  const handleDelete = async () => {
    if (!reviewToDelete) return;
    setDeleting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await deleteReview(reviewToDelete.id, token);
      setReviews((prev) => prev.filter((r) => r.id !== reviewToDelete.id));
      setSuccessMessage('Review deleted successfully.');
      setReviewToDelete(null);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to delete review. Please try again.');
      setReviewToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getScoreBadge = (rev) => {
    if (!rev.aiResult || typeof rev.aiResult.overallScore !== 'number') {
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 rounded-full">
          Unanalyzed
        </span>
      );
    }
    const score = rev.aiResult.overallScore;
    const colorClass =
      score >= 80
        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
        : score >= 60
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
        : 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    return (
      <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${colorClass}`}>
        AI Score: {score}/100
      </span>
    );
  };


  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link to="/dashboard" className="text-xl font-bold text-white tracking-tight hover:text-indigo-400 transition-colors">
              AI Code Review
            </Link>
            <span className="text-slate-600">/</span>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
              Review History
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              to="/dashboard"
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors hidden sm:inline-block"
            >
              Dashboard
            </Link>
            <Link
              to="/review/new"
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              + New Review
            </Link>
            <span className="text-sm text-slate-300 hidden sm:inline-block">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-10 flex flex-col">
        {/* Page Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Review History
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Your previous code submissions and reviews.
            </p>
          </div>
          <div>
            <Link
              to="/review/new"
              className="inline-flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg shadow transition-colors"
            >
              + New Review
            </Link>
          </div>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-emerald-300 text-sm flex items-center justify-between">
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage('')}
              className="text-emerald-400 hover:text-emerald-200 text-xs font-semibold ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Alert with Retry */}
        {errorMessage && (
          <div className="mb-6 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm flex items-center justify-between">
            <span>{errorMessage}</span>
            <div className="flex items-center space-x-3 ml-4">
              <button
                onClick={fetchReviews}
                className="px-3 py-1 bg-rose-600/30 hover:bg-rose-600/40 text-rose-200 rounded text-xs font-semibold cursor-pointer transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => setErrorMessage('')}
                className="text-rose-400 hover:text-rose-200 text-xs cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Content States */}
        {loading ? (
          /* Loading State */
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
            <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <p className="text-slate-300 font-medium text-base">
              Loading your reviews...
            </p>
          </div>
        ) : reviews.length === 0 ? (
          /* Empty State */
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-12 text-center my-auto flex flex-col items-center max-w-lg mx-auto w-full">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 text-2xl font-bold">
              &lt;/&gt;
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              No reviews yet.
            </h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              Submit your first piece of code to start building your review history.
            </p>
            <Link
              to="/review/new"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors shadow"
            >
              New Review
            </Link>
          </div>
        ) : (
          /* Review List */
          <div className="space-y-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
              Total Reviews: {reviews.length}
            </div>

            <div className="grid gap-3">
              {reviews.map((rev) => {
                const charCount = rev.sourceCode ? rev.sourceCode.length : 0;
                return (
                  <div
                    key={rev.id}
                    className="bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 rounded-xl p-5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    {/* Review Info */}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded uppercase tracking-wide">
                          {rev.language}
                        </span>
                        <span className="px-2.5 py-0.5 text-xs font-medium bg-slate-700/60 text-slate-300 border border-slate-600/60 rounded capitalize">
                          Focus: {rev.focus ? rev.focus.replace('_', ' ') : 'All'}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {charCount.toLocaleString()} characters
                        </span>
                        {getScoreBadge(rev)}
                      </div>

                      <div className="text-xs text-slate-400">
                        Submitted: <span className="text-slate-300">{formatDate(rev.createdAt)}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-700/60">
                      <Link
                        to={`/review/${rev.id}`}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                      >
                        View Review
                      </Link>
                      <button
                        onClick={() => confirmDelete(rev)}
                        className="px-3 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/30 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {reviewToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-history-title"
          onClick={() => !deleting && setReviewToDelete(null)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-history-title" className="text-lg font-bold text-white mb-2">
              Delete this review?
            </h3>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              This action cannot be undone. This review ({reviewToDelete.language} - {reviewToDelete.focus?.replace('_', ' ') || 'all'}) will be permanently removed.
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={deleting}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewHistoryPage;
