import React from 'react';
import { Phone, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatRelative } from '../../utils/formatters';

const STATUS_STYLES = {
  SENT: 'bg-slate-100 text-slate-600',
  DELIVERED: 'bg-blue-50 text-blue-700',
  NO_RESPONSE: 'bg-amber-50 text-amber-700',
  ACCEPTED: 'bg-emerald-50 text-emerald-700',
  DECLINED: 'bg-red-50 text-red-700',
};

const STATUS_ICON = {
  ACCEPTED: CheckCircle2,
  DECLINED: XCircle,
};

export default function VendorContactPanel({ attempts = [] }) {
  if (attempts.length === 0) {
    return <p className="text-sm text-slate-400">No vendors contacted yet.</p>;
  }

  return (
    <div className="space-y-2">
      {attempts.map((attempt) => {
        const Icon = STATUS_ICON[attempt.status] || Clock;
        return (
          <div key={attempt.id} className="flex items-center justify-between gap-3 p-3 border border-slate-100 rounded-xl">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Phone size={14} className="text-slate-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{attempt.vendor?.name || 'Vendor'}</p>
                <p className="text-xs text-slate-400">Attempt {attempt.attemptNumber} · {formatRelative(attempt.sentAt)}</p>
              </div>
            </div>
            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_STYLES[attempt.status] || 'bg-slate-100 text-slate-600'}`}>
              <Icon size={12} /> {attempt.status.replace('_', ' ')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
