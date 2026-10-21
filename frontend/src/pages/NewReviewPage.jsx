import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { submitCodeReview } from '../services/api';

const MAX_CHAR_LIMIT = 50000;

const LANGUAGES = [
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Java', value: 'java' },
  { label: 'Python', value: 'python' },
  { label: 'C++', value: 'cpp' },
  { label: 'C', value: 'c' }
];

const FOCUS_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Bugs', value: 'bugs' },
  { label: 'Security', value: 'security' },
  { label: 'Performance', value: 'performance' },
  { label: 'Code Quality', value: 'code_quality' }
];

const NewReviewPage = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [language, setLanguage] = useState('javascript');
  const [sourceCode, setSourceCode] = useState('');
  const [focus, setFocus] = useState('all');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleCodeChange = (e) => {
    setSourceCode(e.target.value);
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const handleSubmit = async (e, autoAnalyze = true) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMessage('');

    // 1. Client-side Validation
    if (!language) {
      setErrorMessage('Please select a supported programming language.');
      return;
    }

    if (!sourceCode || sourceCode.trim().length === 0) {
      setErrorMessage('Source code cannot be empty. Please enter or paste code to review.');
      return;
    }

    if (sourceCode.length > MAX_CHAR_LIMIT) {
      setErrorMessage(`Code length (${sourceCode.length.toLocaleString()} characters) exceeds maximum allowed limit of ${MAX_CHAR_LIMIT.toLocaleString()} characters.`);
      return;
    }

    // 2. Submit to Backend
    setLoading(true);

    try {
      const response = await submitCodeReview(
        {
          language,
          sourceCode,
          focus
        },
        token
      );

      if (response && response.success && response.review) {
        if (autoAnalyze) {
          navigate(`/review/${response.review.id}?autoAnalyze=true`);
        } else {
          navigate(`/review/${response.review.id}`);
        }
      } else {
        setErrorMessage(response?.message || 'Unable to submit code for review.');
      }
    } catch (error) {
      if (error.status === 401) {
        setErrorMessage('Session expired. Please log in again to submit a review.');
      } else if (error.status === 400) {
        setErrorMessage(error.message || 'Invalid code review submission.');
      } else if (error.isNetworkError) {
        setErrorMessage('Unable to connect to the backend server. Please verify your connection.');
      } else {
        setErrorMessage(error.message || 'Unable to submit code for review. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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
              New Review
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
              to="/dashboard"
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors hidden sm:inline-block"
            >
              Dashboard
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
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-10 flex flex-col">
        {/* Page Title & Intro */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Supported Languages:
            </span>
            {LANGUAGES.map((l) => (
              <span
                key={l.value}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                  language === l.value
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-semibold'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/60'
                }`}
              >
                {l.label}
              </span>
            ))}
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            New Code Review
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Submit code for automated analysis across security, bug detection, performance, and best practices.
          </p>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mb-6 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm flex items-center justify-between" role="alert">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-rose-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
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

        {/* Code Submission Form */}
        <form onSubmit={(e) => handleSubmit(e, true)} className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col gap-6">
          {/* Controls Bar: Language & Focus */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Programming Language Dropdown */}
            <div>
              <label htmlFor="language-select" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Programming Language
              </label>
              <select
                id="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Review Focus Dropdown */}
            <div>
              <label htmlFor="focus-select" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Review Focus
              </label>
              <select
                id="focus-select"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {FOCUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Focus Guidance Note */}
          <div className="text-xs text-slate-400 bg-slate-900/40 border border-slate-800 rounded-lg p-3">
            <span className="font-semibold text-slate-300">Review Focus Note: </span>
            {focus === 'all' && 'Comprehensive evaluation analyzing bugs, security vulnerabilities, performance bottlenecks, and style.'}
            {focus === 'bugs' && 'Deep dive into potential runtime bugs, logic errors, uncaught exceptions, and null references.'}
            {focus === 'security' && 'Focus on input sanitization, injection flaws, sensitive data exposure, and security best practices.'}
            {focus === 'performance' && 'Evaluation of time/space complexity, redundant operations, resource leaks, and algorithmic efficiency.'}
            {focus === 'code_quality' && 'Readability, idiomatic code patterns, naming conventions, maintainability, and architectural structure.'}
          </div>

          {/* Code Input Textarea */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="source-code-input" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Source Code
              </label>
              <span className={`text-xs font-mono ${sourceCode.length > MAX_CHAR_LIMIT ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                {sourceCode.length.toLocaleString()} / {MAX_CHAR_LIMIT.toLocaleString()} characters
              </span>
            </div>
            <textarea
              id="source-code-input"
              rows={14}
              value={sourceCode}
              onChange={handleCodeChange}
              placeholder="Paste your source code here..."
              disabled={loading}
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-y leading-relaxed disabled:opacity-50"
            />
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-700/60">
            <Link
              to="/dashboard"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors order-2 sm:order-1"
            >
              ← Back to Dashboard
            </Link>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto order-1 sm:order-2">
              <button
                type="button"
                onClick={(e) => handleSubmit(e, false)}
                disabled={loading || sourceCode.length > MAX_CHAR_LIMIT}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Save Draft Only
              </button>
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={loading || sourceCode.length > MAX_CHAR_LIMIT}
                className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Submitting…</span>
                  </>
                ) : (
                  <span>Analyze Code with AI →</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

export default NewReviewPage;
