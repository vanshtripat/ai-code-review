import React from 'react';
import ScoreDisplay from './ScoreDisplay';
import ReviewSummary from './ReviewSummary';
import IssueCard from './IssueCard';
import LearningPoints from './LearningPoints';

const ReviewResultLayout = ({ review }) => {
  if (!review) return null;

  const hasScore = typeof review.overallScore === 'number';
  const hasSummary = Boolean(review.summary) || (Array.isArray(review.strengths) && review.strengths.length > 0);
  const issues = Array.isArray(review.issues) ? review.issues : [];
  const hasIssues = issues.length > 0;
  const learningPoints = Array.isArray(review.learningPoints) ? review.learningPoints : [];
  const hasLearningPoints = learningPoints.length > 0;

  const hasAnyAiData = hasScore || hasSummary || hasIssues || hasLearningPoints;

  // When no AI data exists yet (e.g. before Days 13-16 implementation),
  // do not show fake data or cluttered mock placeholders.
  if (!hasAnyAiData) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 text-center">
        <p className="text-xs text-slate-400">
          AI analysis results will appear here once the AI review engine is integrated.
        </p>
      </div>
    );
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sortedIssues = [...issues].sort((a, b) => {
    const aSeverity = (a.severity || '').toLowerCase();
    const bSeverity = (b.severity || '').toLowerCase();
    const aOrder = severityOrder[aSeverity] !== undefined ? severityOrder[aSeverity] : 5;
    const bOrder = severityOrder[bSeverity] !== undefined ? severityOrder[bSeverity] : 5;
    return aOrder - bOrder;
  });

  return (
    <div className="space-y-6">
      {/* 1. Overall Score and concise summary */}
      {hasScore && <ScoreDisplay score={review.overallScore} />}

      {/* 2. Assessment Summary & Strengths */}
      {hasSummary && (
        <ReviewSummary summary={review.summary} strengths={review.strengths} />
      )}

      {/* 3. Issues Section ordered by severity */}
      {hasIssues ? (
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Identified Issues & Recommendations (Ordered by Severity)
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-700 text-slate-300">
              {sortedIssues.length} {sortedIssues.length === 1 ? 'issue' : 'issues'}
            </span>
          </div>

          <div className="space-y-3">
            {sortedIssues.map((issue, idx) => (
              <IssueCard key={idx} issue={issue} index={idx} />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-6 shadow-xl flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">No Issues Identified</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              The submitted code is clean and adheres to quality standards for the requested focus.
            </p>
          </div>
        </div>
      )}

      {/* 4. Educational Learning Points */}
      {hasLearningPoints && <LearningPoints points={learningPoints} />}
    </div>
  );
};

export default ReviewResultLayout;
