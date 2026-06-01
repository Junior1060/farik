import React, { useState } from 'react';
import {
  AlertTriangle, DollarSign, Wrench, MessageSquare, FileText,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { useAutopilot } from '../../context/AutopilotContext';
import { useNavigate } from 'react-router-dom';

const ACTION_META = {
  RENT_REMINDER:          { icon: DollarSign,    color: 'text-emerald-600', bg: 'bg-emerald-100' },
  LATE_RENT_NOTICE:       { icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-100'   },
  LATE_RENT_ESCALATION:   { icon: AlertTriangle, color: 'text-red-600',     bg: 'bg-red-100'     },
  MAINTENANCE_TRIAGE:     { icon: Wrench,        color: 'text-violet-600',  bg: 'bg-violet-100'  },
  MAINTENANCE_ESCALATION: { icon: Wrench,        color: 'text-red-600',     bg: 'bg-red-100'     },
  MESSAGE_RESPONSE:       { icon: MessageSquare, color: 'text-blue-600',    bg: 'bg-blue-100'    },
  LEASE_RENEWAL_DRAFT:    { icon: FileText,      color: 'text-slate-600',   bg: 'bg-slate-100'   },
  CHARGE_DISPUTE:         { icon: DollarSign,    color: 'text-red-600',     bg: 'bg-red-100'     },
  LEASE_BREAK_REQUEST:    { icon: FileText,      color: 'text-red-600',     bg: 'bg-red-100'     },
  LEGAL_ESCALATION:       { icon: AlertTriangle, color: 'text-red-600',     bg: 'bg-red-100'     },
  TENANT_COMPLAINT:       { icon: MessageSquare, color: 'text-amber-600',   bg: 'bg-amber-100'   },
};

const ACTION_LABELS = {
  RENT_REMINDER:          'Rent Reminder',
  LATE_RENT_NOTICE:       'Late Rent Notice',
  LATE_RENT_ESCALATION:   'Late Rent — Escalated',
  MAINTENANCE_TRIAGE:     'Maintenance',
  MAINTENANCE_ESCALATION: 'Maintenance — High Cost',
  MESSAGE_RESPONSE:       'Message Response',
  LEASE_RENEWAL_DRAFT:    'Lease Renewal',
  CHARGE_DISPUTE:         'Charge Dispute',
  LEASE_BREAK_REQUEST:    'Lease Break Request',
  LEGAL_ESCALATION:       'Legal Language Detected',
  TENANT_COMPLAINT:       'Tenant Complaint',
};

function parseDraft(draftContent) {
  if (!draftContent) return null;
  try {
    return typeof draftContent === 'string' ? JSON.parse(draftContent) : draftContent;
  } catch {
    return null;
  }
}

function DraftPreview({ draftContent }) {
  const [open, setOpen] = useState(false);
  const draft = parseDraft(draftContent);
  if (!draft) return null;

  const body = draft.body || draft.message || draft.content || draft.text;
  if (!body) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? 'Hide draft' : 'Preview draft'}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-white dark:bg-brand-900 border border-slate-200 dark:border-brand-600 rounded-xl text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
          {body}
        </div>
      )}
    </div>
  );
}

function EscalationCard({ escalation }) {
  const { handleApprove, handleDismiss } = useAutopilot();
  const [loading, setLoading] = useState(null);
  const meta = ACTION_META[escalation.actionType] || ACTION_META.LATE_RENT_ESCALATION;
  const Icon = meta.icon;
  const isUrgent = escalation.urgentAt !== null;

  const act = async (fn, type) => {
    setLoading(type);
    try { await fn(escalation.id); } finally { setLoading(null); }
  };

  return (
    <div className={`rounded-2xl border p-4 ${
      isUrgent
        ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/15'
        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/15'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
          <Icon size={15} className={meta.color} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${isUrgent ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {ACTION_LABELS[escalation.actionType] || escalation.actionType}
            </span>
            {isUrgent && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                <AlertTriangle size={9} /> URGENT
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{escalation.summary}</p>

          {escalation.details?.tenantName && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {escalation.details.tenantName}
              {escalation.details.unitName && ` · ${escalation.details.unitName}`}
            </p>
          )}

          <DraftPreview draftContent={escalation.draftContent} />

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => act(handleApprove, 'approve')}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCircle2 size={12} />
              {loading === 'approve' ? 'Sending…' : 'Approve & Send'}
            </button>
            <button
              onClick={() => act(handleDismiss, 'dismiss')}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-brand-700 hover:bg-slate-100 dark:hover:bg-brand-600 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg border border-slate-200 dark:border-brand-600 transition-colors disabled:opacity-50"
            >
              <XCircle size={12} />
              {loading === 'dismiss' ? 'Handling…' : "I'll Handle This"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NeedsYouPanel() {
  const autopilot = useAutopilot();
  const navigate = useNavigate();
  const escalations = autopilot?.escalations || [];

  if (!autopilot?.loaded || escalations.length === 0) return null;

  const urgent = escalations.filter((e) => e.urgentAt !== null);
  const normal = escalations.filter((e) => e.urgentAt === null);
  const sorted = [...urgent, ...normal];

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-amber-500" />
          <h3 className="section-title">Needs You</h3>
          <span className={`min-w-[20px] h-5 flex items-center justify-center text-[11px] font-bold rounded-full px-1.5 ${
            urgent.length > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
          }`}>
            {escalations.length}
          </span>
        </div>
        <button
          onClick={() => navigate('/agent')}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          View all in AI Manager
        </button>
      </div>

      <div className="space-y-3">
        {sorted.slice(0, 3).map((e) => (
          <EscalationCard key={e.id} escalation={e} />
        ))}
        {sorted.length > 3 && (
          <button
            onClick={() => navigate('/agent')}
            className="w-full text-xs text-slate-500 hover:text-brand-600 font-medium py-2 text-center"
          >
            +{sorted.length - 3} more — view all in AI Manager
          </button>
        )}
      </div>
    </div>
  );
}
