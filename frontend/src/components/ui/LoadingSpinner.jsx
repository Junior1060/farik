import React from 'react';

const LoadingSpinner = ({ fullScreen = false, size = 'md' }) => {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' };

  const spinner = (
    <div className={`${sizes[size]} border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin`} />
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;
