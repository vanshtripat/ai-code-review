import React from 'react';

const LearningPoints = ({ points }) => {
  if (!points || !Array.isArray(points) || points.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-3">
      <div className="flex items-center space-x-2">
        <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <h2 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
          Learning Points & Takeaways
        </h2>
      </div>

      <ul className="space-y-2 text-xs text-slate-300">
        {points.map((pt, idx) => (
          <li key={idx} className="flex items-start space-x-2.5 bg-slate-900/60 border border-slate-700/50 rounded-lg p-3">
            <span className="text-indigo-400 font-semibold shrink-0">{idx + 1}.</span>
            <span className="leading-relaxed">{pt}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LearningPoints;
