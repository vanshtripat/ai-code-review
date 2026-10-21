import React from 'react';

const CATEGORY_CONFIG = {
  bug: {
    label: 'Bug',
    bg: 'bg-red-500/10',
    text: 'text-red-300',
    border: 'border-red-500/20'
  },
  security: {
    label: 'Security',
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/20'
  },
  performance: {
    label: 'Performance',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/20'
  },
  code_quality: {
    label: 'Code Quality',
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/20'
  },
  style: {
    label: 'Style',
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    border: 'border-blue-500/20'
  },
  maintainability: {
    label: 'Maintainability',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-300',
    border: 'border-cyan-500/20'
  }
};

const CategoryBadge = ({ category }) => {
  if (!category) return null;

  const normalized = category.toLowerCase().trim();
  const config = CATEGORY_CONFIG[normalized] || {
    label: category.replace('_', ' '),
    bg: 'bg-slate-700/50',
    text: 'text-slate-300',
    border: 'border-slate-600/50'
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium tracking-wide border capitalize ${config.bg} ${config.text} ${config.border}`}
    >
      {config.label}
    </span>
  );
};

export default CategoryBadge;
