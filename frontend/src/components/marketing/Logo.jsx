import React from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';

/** Farik wordmark. Renders as a link home unless `to` is null. */
const Logo = ({ size = 'md', to = '/', className = '' }) => {
  const small = size === 'sm';
  const inner = (
    <>
      <span
        className={`${small ? 'w-6 h-6 rounded-md' : 'w-8 h-8 rounded-lg'} bg-indigo-600 flex items-center justify-center flex-shrink-0`}
        aria-hidden="true"
      >
        <Building2 size={small ? 12 : 16} className="text-white" />
      </span>
      <span className={`${small ? 'text-sm' : 'text-lg'} font-semibold text-slate-900 tracking-tight`}>Farik</span>
    </>
  );
  const classes = `inline-flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className}`;
  if (!to) return <span className={classes}>{inner}</span>;
  return <Link to={to} className={classes} aria-label="Farik home">{inner}</Link>;
};

export default Logo;
