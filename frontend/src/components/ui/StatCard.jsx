import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const StatCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBg = 'bg-indigo-50',
  iconColor = 'text-indigo-600',
  trend,
  className = '',
}) => {
  return (
    <div className={`card p-4 sm:p-6 flex items-start gap-3 sm:gap-4 ${className}`}>
      <div className={`w-9 h-9 sm:w-11 sm:h-11 ${iconBg} rounded-2xl flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">{title}</p>
        <p className="text-lg sm:text-2xl font-bold text-slate-900 mt-0.5 leading-none truncate" title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}>{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1.5">{subtitle}</p>}
        {trend && (
          <div className={`inline-flex items-center gap-1 mt-2 text-xs font-semibold px-2 py-0.5 rounded-lg ${
            trend.up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          }`}>
            {trend.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trend.label}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
