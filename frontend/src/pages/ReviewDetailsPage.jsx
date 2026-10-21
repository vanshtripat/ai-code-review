import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getReviewById, deleteReview, analyzeReview, getAnalysisStatus } from '../services/api';
import ReviewResultLayout from '../components/review/ReviewResultLayout';

const ReviewDetailsPage = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Analysis Lifecycle States:
  // 'idle' | 'analyzing' | 'retrying' | 'fallback' | 'queued' | 'retry_pending' | 'completed' | 'failed'
  const [analysisState, setAnalysisState] = useState('idle');
  const [jobMeta, setJobMeta] = useState({
    attempts: 0,
    currentModel: null,
    nextRetryAt: null
  });
  const [retryCountdown, setRetryCountdown] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);

  const pollingRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const cooldownTimerRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Close delete modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showDeleteModal && !deleting) {
        setShowDeleteModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteModal, deleting]);

  // Copy full source code
  const handleCopySourceCode = async () => {
    if (!review?.sourceCode) return;
    try {
      await navigator.clipboard.writeText(review.sourceCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = review.sourceCode;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      } catch {
        // ignore
      }
      document.body.removeChild(textArea);
    }
  };

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      return;
    }

    cooldownTimerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [cooldownRemaining]);

  // Next retry countdown timer for retry_pending jobs
  const startRetryCountdown = useCallback((targetDate) => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (!targetDate) return;

    const updateTimer = () => {
      const diffMs = new Date(targetDate).getTime() - Date.now();
      const seconds = Math.max(0, Math.ceil(diffMs / 1000));
      setRetryCountdown(seconds);
      if (seconds <= 0 && countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };

    updateTimer();
    countdownTimerRef.current = setInterval(updateTimer, 1000);
  }, []);

  // Poll analysis status until completed or failed
  const startStatusPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const data = await getAnalysisStatus(id, token);
        if (!data || !data.success) return;

        const status = data.status;
        setAnalysisState(status);
        setJobMeta({
          attempts: data.attempts || 0,
          currentModel: data.currentModel,
          nextRetryAt: data.nextRetryAt
        });

        if (status === 'retry_pending' && data.nextRetryAt) {
          startRetryCountdown(data.nextRetryAt);
        }

        if (status === 'completed') {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          if (data.review) {
            setReview(data.review);
          } else {
            // Re-fetch full review if payload omitted review body
            const fullReview = await getReviewById(id, token);
            if (fullReview?.success && fullReview?.review) {
              setReview(fullReview.review);
            }
          }
          setSuccessMessage('AI Analysis completed successfully!');
        } else if (status === 'failed') {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setErrorMessage(data.message || 'AI Analysis failed permanently. Please check backend configuration.');
        }
      } catch {
        // Silent catch during background polling to avoid interrupting UI
      }
    }, 3000);
  }, [id, token, startRetryCountdown]);

  const fetchReview = useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    setErrorMessage('');

    try {
      // 1. Fetch review data
      const data = await getReviewById(id, token);
      if (data && data.success && data.review) {
        setReview(data.review);

        // 2. Fetch analysis job status for refresh recovery
        try {
          const statusData = await getAnalysisStatus(id, token);
          if (statusData && statusData.success) {
            const currentStatus = statusData.status;
            if (['queued', 'processing', 'retry_pending'].includes(currentStatus)) {
              setAnalysisState(currentStatus);
              setJobMeta({
                attempts: statusData.attempts || 0,
                currentModel: statusData.currentModel,
                nextRetryAt: statusData.nextRetryAt
              });
              if (currentStatus === 'retry_pending' && statusData.nextRetryAt) {
                startRetryCountdown(statusData.nextRetryAt);
              }
              startStatusPolling();
            }
          }
        } catch {
          // If status fetch fails, fallback to review state
        }
      } else {
        setNotFound(true);
      }
    } catch (error) {
      if (error.status === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      if (error.status === 404 || error.status === 400) {
        setNotFound(true);
      } else {
        setErrorMessage(error.message || 'Unable to retrieve review. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [id, token, logout, navigate, startRetryCountdown, startStatusPolling]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  const handleDelete = async () => {
    setDeleting(true);
    setErrorMessage('');

    try {
      await deleteReview(id, token);
      navigate('/reviews', { replace: true });
    } catch (error) {
      setErrorMessage(error.message || 'Unable to delete review. Please try again.');
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleAnalyze = useCallback(async () => {
    setAnalysisState('analyzing');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const data = await analyzeReview(id, token);

      if (data && data.success) {
        if (data.status === 'completed' && data.review) {
          setReview(data.review);
          setAnalysisState('completed');
          setSuccessMessage('AI Analysis completed successfully!');
          return;
        }

        if (data.status === 'retry_pending' || data.status === 'processing' || data.status === 'queued') {
          setAnalysisState(data.status);
          setJobMeta({
            attempts: data.attempts || 1,
            currentModel: data.currentModel,
            nextRetryAt: data.nextRetryAt
          });
          if (data.nextRetryAt) {
            startRetryCountdown(data.nextRetryAt);
          }
          startStatusPolling();
        }
      }
    } catch (error) {
      if (error.status === 429) {
        const retryAfter = error.data?.retryAfter;
        if (retryAfter) {
          setCooldownRemaining(retryAfter);
        }
        setErrorMessage(
          error.message ||
            (retryAfter
              ? `Analysis cooldown active. Please wait ${retryAfter} seconds before re-analyzing.`
              : 'Analysis is in progress or cooldown active. Please wait a moment.')
        );
        setAnalysisState('idle');
      } else {
        setAnalysisState('failed');
        setErrorMessage(error.message || 'Failed to analyze code. Please try again.');
      }
    }
  }, [id, token, startRetryCountdown, startStatusPolling]);

  // Trigger analysis automatically if redirected from New Review with autoAnalyze=true
  useEffect(() => {
    if (review && !loading && !review.aiResult && searchParams.get('autoAnalyze') === 'true' && analysisState === 'idle') {
      setSearchParams({}, { replace: true });
      handleAnalyze();
    }
  }, [review, loading, searchParams, setSearchParams, analysisState, handleAnalyze]);

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

  const isAnalysisInProgress = ['analyzing', 'retrying', 'fallback', 'queued', 'processing', 'retry_pending'].includes(
    analysisState
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              to="/dashboard"
              className="text-xl font-bold text-white tracking-tight hover:text-indigo-400 transition-colors"
            >
              AI Code Review
            </Link>
            <span className="text-slate-600">/</span>
            <Link to="/reviews" className="text-sm font-semibold text-slate-400 hover:text-indigo-400 transition-colors">
              Reviews
            </Link>
            <span className="text-slate-600">/</span>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
              Details
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              to="/reviews"
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors hidden sm:inline-block"
            >
              Review History
            </Link>
            <Link
              to="/review/new"
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              + New Review
            </Link>
            <span className="text-sm text-slate-300 hidden sm:inline-block">{user?.email}</span>
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
        {/* Navigation Breadcrumb / Back Link */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/reviews"
            className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            ← Back to Reviews
          </Link>
          {review && !loading && !notFound && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-3.5 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/30 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Delete Review
            </button>
          )}
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-3">
              <span className="font-bold text-rose-400">Notice:</span>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage('')}
              className="text-rose-400 hover:text-rose-200 text-xs font-semibold ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-emerald-300 text-sm flex items-center justify-between shadow-lg">
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage('')}
              className="text-emerald-400 hover:text-emerald-200 text-xs font-semibold ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active Analysis State Banner (Real Recovery Experience) */}
        {isAnalysisInProgress && (
          <div className="mb-6 bg-slate-900 border border-indigo-500/30 rounded-xl p-4.5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center space-x-3.5">
                <div className="w-6 h-6 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <div className="text-white font-medium text-sm flex items-center gap-2">
                    {analysisState === 'analyzing' && <span>Analyzing your code…</span>}
                    {analysisState === 'retrying' && (
                      <span>AI service is temporarily busy. Retrying automatically…</span>
                    )}
                    {analysisState === 'fallback' && (
                      <span>The primary model is temporarily unavailable. Trying the backup model…</span>
                    )}
                    {(analysisState === 'retry_pending' || analysisState === 'queued') && (
                      <span>Your request is saved. Automatic retry is scheduled.</span>
                    )}
                    {analysisState === 'processing' && <span>Processing analysis job…</span>}
                  </div>

                  <div className="text-slate-400 text-xs mt-1 flex flex-wrap items-center gap-3">
                    {jobMeta.attempts > 1 && (
                      <span className="font-mono text-indigo-300">
                        Attempt {jobMeta.attempts} of 3
                      </span>
                    )}
                    {analysisState === 'retry_pending' && retryCountdown !== null && retryCountdown > 0 && (
                      <span className="text-amber-300 font-medium">
                        Retrying in {retryCountdown}s…
                      </span>
                    )}
                    {jobMeta.currentModel && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-slate-300">
                        Model: {jobMeta.currentModel}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-md px-2.5 py-1 self-start sm:self-center font-medium">
                Automatic Retry Enabled
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
            <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
            <p className="text-slate-300 font-medium text-base">Loading review details...</p>
          </div>
        ) : notFound ? (
          /* Not Found State */
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-12 text-center my-auto flex flex-col items-center max-w-lg mx-auto w-full">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 text-2xl font-bold">
              !
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Review not found.</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              The review you are looking for does not exist or you do not have permission to view it.
            </p>
            <Link
              to="/reviews"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors shadow"
            >
              Back to Reviews
            </Link>
          </div>
        ) : (
          /* Review Details Content */
          <div className="space-y-6">
            {/* Metadata Summary Card */}
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-5 mb-5">
                <div>
                  <h1 className="text-2xl font-extrabold text-white tracking-tight capitalize">
                    {review.language} Code Submission
                  </h1>
                  <p className="text-slate-400 text-xs mt-1 font-mono">ID: {review.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded uppercase tracking-wide">
                    {review.language}
                  </span>
                  <span className="px-3 py-1 text-xs font-medium bg-slate-700/80 text-slate-200 border border-slate-600 rounded capitalize">
                    Focus: {review.focus ? review.focus.replace('_', ' ') : 'All'}
                  </span>
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3.5">
                  <dt className="text-slate-500 uppercase tracking-wider font-semibold">Submitted</dt>
                  <dd className="text-slate-200 font-medium mt-1">{formatDate(review.createdAt)}</dd>
                </div>
                <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3.5">
                  <dt className="text-slate-500 uppercase tracking-wider font-semibold">Last Updated</dt>
                  <dd className="text-slate-200 font-medium mt-1">
                    {formatDate(review.updatedAt || review.createdAt)}
                  </dd>
                </div>
                <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3.5">
                  <dt className="text-slate-500 uppercase tracking-wider font-semibold">Code Size</dt>
                  <dd className="text-slate-200 font-medium mt-1">
                    {(review.sourceCode?.length || 0).toLocaleString()} characters
                  </dd>
                </div>
              </dl>
            </div>

            {/* AI Review Results Section */}
            {review.aiResult ? (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {review.aiResult.analyzedAt && (
                    <div className="flex items-center space-x-2 text-xs text-slate-400">
                      <span>Analyzed {formatDate(review.aiResult.analyzedAt)}</span>
                      {review.aiResult.modelUsed && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-indigo-400">
                          {review.aiResult.modelUsed}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="sm:ml-auto">
                    <button
                      onClick={handleAnalyze}
                      disabled={isAnalysisInProgress || cooldownRemaining > 0}
                      className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {isAnalysisInProgress && (
                        <div className="w-3.5 h-3.5 border-2 border-indigo-300/30 border-t-indigo-300 rounded-full animate-spin" />
                      )}
                      <span>
                        {cooldownRemaining > 0
                          ? `Re-analyze available in ${cooldownRemaining}s`
                          : isAnalysisInProgress
                          ? 'Re-analyzing...'
                          : 'Re-analyze Code'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Persistent AI Result Layout — preserved during re-analysis until new result is ready */}
                <ReviewResultLayout review={review.aiResult} />
              </div>
            ) : (
              <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-10 shadow-xl text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Ready for AI Analysis</h3>
                <p className="text-slate-400 text-sm mb-8 max-w-md">
                  This code submission hasn't been analyzed yet. Click below to generate a comprehensive AI code review
                  using Gemini.
                </p>
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalysisInProgress || cooldownRemaining > 0}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 cursor-pointer"
                >
                  {isAnalysisInProgress ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>
                        {analysisState === 'retrying'
                          ? 'Retrying analysis...'
                          : analysisState === 'fallback'
                          ? 'Trying backup model...'
                          : analysisState === 'retry_pending'
                          ? 'Scheduled to retry...'
                          : 'Analyzing Code...'}
                      </span>
                    </>
                  ) : cooldownRemaining > 0 ? (
                    <span>Re-analyze available in {cooldownRemaining}s</span>
                  ) : (
                    <span>Analyze Code with AI</span>
                  )}
                </button>
              </div>
            )}

            {/* Source Code Card */}
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Source Code</h2>
                  <span className="text-xs text-slate-500 font-mono">
                    ({review.sourceCode ? review.sourceCode.split('\n').length : 0} lines)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopySourceCode}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 rounded-lg transition-colors cursor-pointer"
                  aria-label="Copy entire source code"
                >
                  {codeCopied ? (
                    <>
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-emerald-400 font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto">
                <pre className="font-mono text-sm text-slate-200 whitespace-pre leading-relaxed">
                  <code>{review.sourceCode}</code>
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-dialog-title" className="text-lg font-bold text-white mb-2">Delete this review?</h3>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              This action cannot be undone. This code submission will be permanently removed.
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
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

export default ReviewDetailsPage;
