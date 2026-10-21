import React from 'react';

const ReviewSummary = ({ summary, strengths }) => {
  if (!summary && (!strengths || strengths.length === 0)) {
    return null;
  }

  return (
    <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
      {summary && (
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Assessment Summary
          </h2>
          <p className="text-slate-200 text-sm leading-relaxed">
            {summary}
          </p>
        </div>
      )}

      {strengths && Array.isArray(strengths) && strengths.length > 0 && (
        <div className="pt-3 border-t border-slate-700/60">
          <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
            Key Strengths
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {strengths.map((str, idx) => (
              <li key={idx} className="flex items-start gap-2 bg-slate-900/40 border border-slate-700/40 rounded-lg p-2.5">
                <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="leading-relaxed">{str}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ReviewSummary;
