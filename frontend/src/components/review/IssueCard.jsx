import React, { useState } from 'react';
import SeverityBadge from './SeverityBadge';
import CategoryBadge from './CategoryBadge';

const IssueCard = ({ issue, index }) => {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!issue) return null;

  const {
    title = 'Identified Issue',
    category,
    severity,
    lineStart,
    lineEnd,
    explanation,
    whyItMatters,
    suggestion,
    suggestedCode
  } = issue;

  const lineRangeText =
    lineStart && lineEnd
      ? lineStart === lineEnd
        ? `Line ${lineStart}`
        : `Lines ${lineStart}–${lineEnd}`
      : lineStart
      ? `Line ${lineStart}`
      : null;

  const handleCopyCode = async (e) => {
    e.stopPropagation();
    if (!suggestedCode) return;
    try {
      await navigator.clipboard.writeText(suggestedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is blocked
      const textArea = document.createElement('textarea');
      textArea.value = suggestedCode;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Ignore clipboard failure
      }
      document.body.removeChild(textArea);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded((prev) => !prev);
    }
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 transition-all hover:border-slate-600 shadow-sm">
      {/* Header */}
      <div
        className="flex items-start justify-between gap-3 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg p-1 -m-1"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
          {typeof index === 'number' && (
            <span className="text-xs font-mono text-slate-400 font-semibold shrink-0">
              #{index + 1}
            </span>
          )}
          <h3 className="text-sm font-semibold text-white truncate">
            {title}
          </h3>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <CategoryBadge category={category} />
          <SeverityBadge severity={severity} />
          <span
            className="text-xs text-slate-400 hover:text-slate-200 ml-1 p-0.5"
            aria-hidden="true"
          >
            {expanded ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </span>
        </div>
      </div>

      {/* Details (when expanded) */}
      {expanded && (
        <div className="mt-3.5 pt-3 border-t border-slate-700/60 space-y-3.5 text-xs leading-relaxed">
          {lineRangeText && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-700/70 text-slate-300 font-mono text-[11px]">
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{lineRangeText}</span>
            </div>
          )}

          {explanation && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Explanation
              </div>
              <p className="text-slate-200">{explanation}</p>
            </div>
          )}

          {whyItMatters && (
            <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-1">
                Why It Matters
              </div>
              <p className="text-slate-300">{whyItMatters}</p>
            </div>
          )}

          {suggestion && (
            <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 mb-1">
                Suggested Solution
              </div>
              <p className="text-slate-300">{suggestion}</p>
            </div>
          )}

          {suggestedCode && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Suggested Code
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded transition-colors cursor-pointer"
                  aria-label="Copy suggested code to clipboard"
                >
                  {copied ? (
                    <>
                      <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 overflow-x-auto">
                <pre className="font-mono text-xs text-emerald-300 whitespace-pre leading-relaxed">
                  <code>{suggestedCode}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IssueCard;
