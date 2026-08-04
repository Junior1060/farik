import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, X, Pencil, RefreshCw, Building2, ArrowRight, AlertTriangle,
} from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import InfoBanner from '../ui/InfoBanner';
import EmptyState from '../ui/EmptyState';
import { getEscalations, approveLog, rejectLog } from '../../services/agentService';
import { actionMeta, entityLink, explainWhy } from './actionMeta';
import { formatCurrency } from '../../utils/formatters';

function parseDraft(draftContent) {
  if (!draftContent) return null;
  try {
    const d = JSON.parse(draftContent);
    if (d.type === 'notice') return { kind: 'Notice draft', title: d.title, body: d.body };
    if (d.type === 'message') return { kind: 'Message draft', title: null, body: d.body };
    if (d.type === 'booking') return { kind: 'Vendor booking', title: d.title || null, body: d.body || null };
    return null;
  } catch {
    return null;
  }
}

function amountOf(details = {}) {
  const raw = details.estimatedCost ?? details.amount ?? details.outstandingAmount ?? details.invoiceAmount;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ApprovalCard({ log, onApprove, onReject, busy }) {
  const meta = actionMeta(log.actionType);
  const Icon = meta.icon;
  const details = log.details || {};
  const draft = parseDraft(log.draftContent);
  const link = entityLink(log.entityType, log.entityId);
  const amount = amountOf(details);
  const where = [details.unitName, details.propertyName].filter(Boolean).join(', ');
  const disabled = busy === log.id;

  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0 ${meta.chip}`}>
            <Icon size={12} aria-hidden="true" />
            {meta.label}
          </span>
        </div>
        {log.urgentAt && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
            <AlertTriangle size={12} aria-hidden="true" /> Waiting over 48 hours
          </span>
        )}
      </div>

      <h3 className="text-sm font-semibold text-slate-800 mt-3 leading-snug">{log.summary}</h3>

      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-3 text-sm">
        <div className="flex gap-2">
          <dt className="text-xs text-slate-500 w-24 flex-shrink-0 pt-0.5">Tenant</dt>
          <dd className="text-slate-800 font-medium">{details.tenantName || 'Not recorded'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-xs text-slate-500 w-24 flex-shrink-0 pt-0.5">Property</dt>
          <dd className="text-slate-800 font-medium inline-flex items-center gap-1.5">
            {where ? <><Building2 size={12} className="text-slate-500" aria-hidden="true" />{where}</> : 'Not recorded'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-xs text-slate-500 w-24 flex-shrink-0 pt-0.5">Amount</dt>
          <dd className="text-slate-800 font-medium">{amount !== null ? formatCurrency(amount) : 'Not applicable'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-xs text-slate-500 w-24 flex-shrink-0 pt-0.5">Raised</dt>
          <dd className="text-slate-800">
            <time dateTime={new Date(log.createdAt).toISOString()}>
              {new Date(log.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </time>
          </dd>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <dt className="text-xs text-slate-500 w-24 flex-shrink-0 pt-0.5">Why you</dt>
          <dd className="text-slate-700">{explainWhy(log)}</dd>
        </div>
      </dl>

      {draft && (
        <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-surface-50 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Preview · {draft.kind}</span>
          </div>
          <div className="p-4">
            {draft.title && <p className="text-sm font-semibold text-slate-800 mb-2">{draft.title}</p>}
            {draft.body && (
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {draft.body}
              </p>
            )}
          </div>
        </div>
      )}

      {link && (
        <Link to={link.to} className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline mt-3">
          {link.label} <ArrowRight size={12} aria-hidden="true" />
        </Link>
      )}

      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => onApprove(log.id)}
          disabled={disabled}
          className="btn-primary bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
        >
          {disabled ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
          Approve
        </button>
        {/* TODO: needs PATCH /api/agent/logs/:id/draft — approveLog executes
            draftContent verbatim and no endpoint can modify it yet. */}
        <button
          type="button"
          disabled
          title="Editing a draft before approval isn't available yet — reject it and Farik will re-draft."
          className="btn-secondary"
        >
          <Pencil size={14} aria-hidden="true" /> Edit
        </button>
        <button
          type="button"
          onClick={() => onReject(log.id)}
          disabled={disabled}
          className="btn-secondary text-red-700 hover:bg-red-50 border-red-200"
        >
          <X size={14} aria-hidden="true" /> Reject
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Editing before approval isn&apos;t available yet. Reject it and Farik will prepare a new draft.
      </p>
    </li>
  );
}

export default function ApprovalsPanel({ onCountChange }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getEscalations();
      setLogs(data);
      onCountChange?.(data.length);
    } catch {
      setError('Could not load the approval queue. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, fn, failure) => {
    setBusy(id);
    setError('');
    try {
      await fn(id);
      setLogs((prev) => {
        const next = prev.filter((l) => l.id !== id);
        onCountChange?.(next.length);
        return next;
      });
    } catch {
      setError(failure);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>;

  return (
    <div className="space-y-5">
      {error && <InfoBanner variant="danger">{error}</InfoBanner>}

      <InfoBanner variant="info">
        Farik holds anything outside your Autopilot rules here. Nothing on this list happens until you approve it.
      </InfoBanner>

      {logs.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing waiting on you"
          description="Farik is handling everything inside your Autopilot rules right now."
        />
      ) : (
        <ul className="space-y-4">
          {logs.map((log) => (
            <ApprovalCard
              key={log.id}
              log={log}
              busy={busy}
              onApprove={(id) => act(id, approveLog, 'That approval could not be completed.')}
              onReject={(id) => act(id, rejectLog, 'That rejection could not be saved.')}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
