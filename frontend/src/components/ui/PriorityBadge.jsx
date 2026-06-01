import React from 'react';

const variants = {
  LOW: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  MEDIUM: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  HIGH: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
};

const PriorityBadge = ({ priority, className = '' }) => {
  const style = variants[priority] || variants.MEDIUM;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style} ${className}`}>
      {priority?.charAt(0) + priority?.slice(1).toLowerCase()}
    </span>
  );
};

export default PriorityBadge;
