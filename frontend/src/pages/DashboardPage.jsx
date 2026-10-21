import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats } from '../services/api';

const DashboardPage = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await getDashboardStats(token);
      if (data && data.success) {
        setStats(data.stats);
      } else {
        setErrorMessage('Unable to load dashboard statistics.');
      }
    } catch (error) {
      if (error.status === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      setErrorMessage(error.message || 'Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  }, [token, logout, navigate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getScoreBadgeColor = (score) => {
    if (typeof score !== 'number') return 'text-slate-400 bg-slate-700/50 border-slate-600';
    if (score >= 80) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (score >= 60) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/95 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 shrink-0">
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">
              AI Code Review
            </span>
            <span className="px-2 py-0.5 text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
              Dashboard
            </span>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            <Link
              to="/reviews"
              className="text-xs sm:text-sm text-slate-300 hover:text-white transition-colors"
            >
              Reviews
            </Link>
            <Link
              to="/review/new"
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              + New Review
            </Link>
            <span className="text-xs text-slate-400 hidden md:inline-block max-w-[150px] truncate">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="px-2.5 sm:px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Developer Session Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Welcome back, {user?.name || 'Developer'}
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">
              Real-time overview of your code reviews and automated AI quality metrics.
            </p>
          </div>

          <Link
            to="/review/new"
            className="self-start sm:self-auto px-4 py-2 sm:px-5 sm:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold rounded-lg shadow transition-all flex items-center space-x-1.5 shrink-0"
          >
            <span>+ Create New Review</span>
          </Link>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={fetchStats}
              className="text-xs text-rose-400 hover:text-rose-200 underline font-medium cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <p className="text-slate-400 text-sm">Loading your analytics...</p>
          </div>
        ) : stats ? (
          <>
            {/* Real Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Total Reviews */}
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Total Reviews
                  </span>
                  <div className="text-3xl font-black text-white mt-2">
                    {stats.totalReviews}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-4">
                  {stats.totalReviews === 0 ? 'No submissions yet' : `${stats.totalReviews} total submitted`}
                </p>
              </div>

              {/* Analyzed Reviews */}
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Analyzed by AI
                  </span>
                  <div className="text-3xl font-black text-indigo-400 mt-2">
                    {stats.analyzedReviews}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-4">
                  {stats.unanalyzedReviews > 0 ? (
                    <span className="text-amber-400/90 font-medium">{stats.unanalyzedReviews} pending analysis</span>
                  ) : (
                    'All reviews analyzed'
                  )}
                </p>
              </div>

              {/* Average AI Score */}
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Average AI Score
                  </span>
                  <div className="text-3xl font-black mt-2">
                    {stats.averageScore !== null ? (
                      <span className={stats.averageScore >= 80 ? 'text-emerald-400' : stats.averageScore >= 60 ? 'text-amber-400' : 'text-rose-400'}>
                        {stats.averageScore}
                        <span className="text-base text-slate-500 font-normal">/100</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 text-2xl font-normal">—</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-4">
                  {stats.analyzedReviews > 0 ? `Across ${stats.analyzedReviews} analyzed reviews` : 'Run AI review to see score'}
                </p>
              </div>

              {/* Top Language & Common Issue */}
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Top Language
                  </span>
                  <div className="text-2xl font-bold text-white mt-2 capitalize truncate">
                    {stats.mostUsedLanguage || '—'}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-4 truncate">
                  Top issue: <span className="text-slate-300 capitalize">{stats.mostCommonCategory ? stats.mostCommonCategory.replace('_', ' ') : 'None'}</span>
                </p>
              </div>
            </div>

            {/* Empty State Callout if 0 reviews */}
            {stats.totalReviews === 0 && (
              <div className="bg-slate-800/50 border border-slate-700/80 rounded-2xl p-10 text-center flex flex-col items-center">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 text-2xl font-bold">
                  &lt;/&gt;
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Ready for your first code review?</h3>
                <p className="text-slate-400 text-sm max-w-md mb-6">
                  Submit code snippet in JavaScript, TypeScript, Python, Java, C, or C++ to receive automated AI feedback and security checks.
                </p>
                <Link
                  to="/review/new"
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg transition-all"
                >
                  Create Your First Review
                </Link>
              </div>
            )}

            {/* Recent Reviews Section */}
            {stats.recentReviews && stats.recentReviews.length > 0 && (
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white tracking-tight uppercase">
                    Recent Reviews
                  </h2>
                  <Link
                    to="/reviews"
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                  >
                    View All Reviews ({stats.totalReviews}) →
                  </Link>
                </div>

                <div className="divide-y divide-slate-700/60">
                  {stats.recentReviews.map((rev) => (
                    <div
                      key={rev.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-2 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded uppercase tracking-wide">
                          {rev.language}
                        </span>
                        <span className="text-xs text-slate-400 font-medium capitalize">
                          Focus: {rev.focus ? rev.focus.replace('_', ' ') : 'All'}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDate(rev.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center space-x-3">
                        {rev.isAnalyzed ? (
                          <span
                            className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getScoreBadgeColor(
                              rev.score
                            )}`}
                          >
                            Score: {rev.score}/100 ({rev.issueCount} {rev.issueCount === 1 ? 'issue' : 'issues'})
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/50">
                            Pending Analysis
                          </span>
                        )}

                        <Link
                          to={`/review/${rev.id}`}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                        >
                          View →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Account Details Card */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Account Information
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <dt className="text-slate-500">Developer</dt>
                  <dd className="text-slate-200 font-medium mt-0.5">{user?.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Email</dt>
                  <dd className="text-slate-200 font-medium mt-0.5 truncate">{user?.email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Authentication</dt>
                  <dd className="text-emerald-400 font-medium mt-0.5 flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>JWT Session Verified</span>
                  </dd>
                </div>
              </dl>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default DashboardPage;
