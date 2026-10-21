import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LandingPage = () => {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="max-w-2xl w-full bg-slate-800/80 border border-slate-700 rounded-2xl p-8 md:p-10 shadow-2xl backdrop-blur-sm">
        <div className="inline-block px-3 py-1 bg-indigo-500/10 text-indigo-400 text-xs font-semibold rounded-full border border-indigo-500/20 mb-6">
          AI Code Review & Mentorship
        </div>
        
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
          AI-Powered Code Review & Mentorship Platform
        </h1>
        
        <p className="text-slate-300 text-base md:text-lg mb-8 leading-relaxed">
          An AI-powered platform that helps developers understand, debug, and improve their code with personalized mentorship.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm"
            >
              Go to Dashboard ({user?.name || user?.email}) →
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg border border-slate-700 transition-colors text-sm"
              >
                Create Account
              </Link>
            </>
          )}
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-6 border-t border-slate-700/60">
          <div className="p-3 bg-slate-900/40 border border-slate-700/40 rounded-lg">
            <h2 className="text-xs font-semibold text-slate-200">Multi-Language Static Analysis</h2>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">
              Support for JavaScript, TypeScript, Python, Java, C++, and C codebases.
            </p>
          </div>
          <div className="p-3 bg-slate-900/40 border border-slate-700/40 rounded-lg">
            <h2 className="text-xs font-semibold text-slate-200">Security & Performance Focus</h2>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">
              Categorized insights covering runtime errors, security vulnerabilities, and complexity.
            </p>
          </div>
          <div className="p-3 bg-slate-900/40 border border-slate-700/40 rounded-lg">
            <h2 className="text-xs font-semibold text-slate-200">Resilient Processing</h2>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">
              Automated bounded retries, fallback inference, and background recovery.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
