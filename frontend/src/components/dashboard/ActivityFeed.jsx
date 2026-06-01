import React from 'react';
import { CreditCard, Wrench, Bell, MessageSquare, FileText, Home } from 'lucide-react';
import { formatRelative } from '../../utils/formatters';

const typeConfig = {
  PAYMENT: { icon: CreditCard, bg: 'bg-emerald-50 dark:bg-emerald-900/30', color: 'text-emerald-600 dark:text-emerald-400' },
  MAINTENANCE: { icon: Wrench, bg: 'bg-blue-50 dark:bg-blue-900/30', color: 'text-blue-600 dark:text-blue-400' },
  NOTICE: { icon: Bell, bg: 'bg-amber-50 dark:bg-amber-900/30', color: 'text-amber-600 dark:text-amber-400' },
  MESSAGE: { icon: MessageSquare, bg: 'bg-violet-50 dark:bg-violet-900/30', color: 'text-violet-600 dark:text-violet-400' },
  LEASE: { icon: FileText, bg: 'bg-slate-100 dark:bg-brand-700', color: 'text-slate-600 dark:text-slate-400' },
  DEFAULT: { icon: Home, bg: 'bg-slate-100 dark:bg-brand-700', color: 'text-slate-600 dark:text-slate-400' },
};

const ActivityFeed = ({ activity = [] }) => {
  return (
    <div>
      <h3 className="section-title mb-4">Recent Activity</h3>
      {activity.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">No activity yet</p>
      ) : (
        <div className="space-y-3">
          {activity.slice(0, 8).map((item) => {
            const cfg = typeConfig[item.type] || typeConfig.DEFAULT;
            const Icon = cfg.icon;
            return (
              <div key={item.id} className="flex items-start gap-3">
                <div className={`w-8 h-8 ${cfg.bg} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <Icon size={14} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{item.description}</p>
                  )}
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{formatRelative(item.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;
