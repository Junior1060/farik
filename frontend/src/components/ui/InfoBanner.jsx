import React from 'react';
import { Info, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';

const VARIANTS = {
  info:    { wrap: 'bg-brand-50 border-brand-200 text-brand-900',   icon: 'text-brand-600',   Icon: Info },
  warning: { wrap: 'bg-amber-50 border-amber-200 text-amber-900',   icon: 'text-amber-600',   Icon: AlertTriangle },
  danger:  { wrap: 'bg-red-50 border-red-200 text-red-900',         icon: 'text-red-600',     Icon: AlertCircle },
  success: { wrap: 'bg-emerald-50 border-emerald-200 text-emerald-900', icon: 'text-emerald-600', Icon: CheckCircle2 },
};

/** Inline notice block used for demo/trust/limitation copy across the app. */
const InfoBanner = ({ variant = 'info', title, children, icon, className = '' }) => {
  const v = VARIANTS[variant] || VARIANTS.info;
  const Icon = icon || v.Icon;
  return (
    <div className={`flex items-start gap-2.5 border rounded-xl px-4 py-3 text-sm ${v.wrap} ${className}`}>
      <Icon size={16} className={`${v.icon} flex-shrink-0 mt-0.5`} aria-hidden="true" />
      <div className="min-w-0 leading-relaxed">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  );
};

export default InfoBanner;
