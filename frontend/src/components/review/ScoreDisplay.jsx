import React from 'react';

const ScoreDisplay = ({ score }) => {
  if (typeof score !== 'number' || isNaN(score)) {
    return null;
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  let colorClass = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  let label = 'Good';

  if (clampedScore < 50) {
    colorClass = 'text-rose-400 border-rose-500/30 bg-rose-500/10';
    label = 'Needs Work';
  } else if (clampedScore < 75) {
    colorClass = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    label = 'Moderate';
  } else if (clampedScore >= 90) {
    label = 'Excellent';
  }

  return (
    <div className={`border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${colorClass}`}>
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Overall Code Score
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-900/60 border border-slate-700/60">
            {label}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-normal max-w-lg">
          Automated heuristic evaluation across safety, style, and structure. Scores provide guidance and do not guarantee complete security.
        </p>
      </div>

      <div className="flex items-baseline space-x-1 sm:self-center shrink-0">
        <span className="text-3xl font-extrabold tracking-tight">
          {clampedScore}
        </span>
        <span className="text-xs text-slate-400 font-semibold">/ 100</span>
      </div>
    </div>
  );
};

export default ScoreDisplay;
