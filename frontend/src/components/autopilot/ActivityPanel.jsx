import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Filter, Ban, RefreshCw, Building2, ArrowRight, ChevronDown } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import InfoBanner from '../ui/InfoBanner';
import EmptyState from '../ui/EmptyState';
import { getTimeline, cancelScheduled } from '../../services/agentService';
import { actionMeta, statusMeta, entityLink, explainWhy } from './actionMeta';

const STATUS_FILTERS = [
  { id: 'All', label: 'All' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'ESCALATED', label: 'Waiting for approval' },
  { id: 'SCHEDULED', label: 'In progress' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

function dateHeading(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupByDate(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = new Date(entry.time).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label: dateHeading(key),
    isToday: new Date(key).toDateString() === new Date().toDateString(),
    items,
  }));
}

function ActivityEntry({ entry, onCancel, cancelling }) {
  const [open, setOpen] = useState(false);
  const meta = actionMeta(entry.actionType);
  const status = statusMeta(entry.status);
  const Icon = meta.icon;
  const link = entityLink(entry.entityType, entry.entityId);
  const needsApproval = entry.status === 'ESCALATED';
  const canCancel = entry.cancellable && entry.status === 'SCHEDULED';
  const where = [entry.unitName, entry.propertyName].filter(Boolean).join(', ');

  return (
    <li className={`border border-slate-100 rounded-xl overflow-hidden ${entry.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border self-start flex-shrink-0 ${meta.chip}`}>
          <Icon size={12} aria-hidden="true" />
          {meta.label}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 leading-snug">{entry.summary}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-slate-500">
            {entry.tenantName && <span className="font-medium text-slate-600">{entry.tenantName}</span>}
            {where && (
              <span className="inline-flex items-center gap-1">
                <Building2 size={11} aria-hidden="true" /> {where}
              </span>
            )}
            <time dateTime={new Date(entry.time).toISOString()}>
              {new Date(entry.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </time>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${status.badge}`}>
            {status.label}
          </span>
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel(entry)}
              disabled={cancelling === entry.id}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
            >
              {cancelling === entry.id
                ? <RefreshCw size={11} className="animate-spin" aria-hidden="true" />
                : <Ban size={11} aria-hidden="true" />}
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg transition-colors"
          >
            Details
            <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-surface-50 text-sm">
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <dt className="text-xs font-semibold text-slate-600 uppercase tracking-wide">What Farik did</dt>
              <dd className="text-slate-700 mt-1">{entry.summary}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Why</dt>
              <dd className="text-slate-700 mt-1">{explainWhy(entry)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Approval</dt>
              <dd className="text-slate-700 mt-1">
                {needsApproval ? 'Required — waiting for you' : 'Not required under your rules'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Related record</dt>
              <dd className="mt-1">
                {link ? (
                  <Link to={link.to} className="inline-flex items-center gap-1 text-brand-600 font-medium hover:underline">
                    {link.label} <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="text-slate-500">None linked</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </li>
  );
}

export default function ActivityPanel() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [actionFilter, setActionFilter] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await getTimeline());
    } catch {
      setError('Could not load the activity feed. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (entry) => {
    setCancelling(entry.id);
    try {
      await cancelScheduled({
        entityId: entry.entityId,
        entityType: entry.entityType,
        actionType: entry.actionType,
        scheduledAt: entry.time,
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: 'CANCELLED', cancellable: false } : e)),
      );
    } catch {
      setError('That action could not be cancelled.');
    } finally {
      setCancelling(null);
    }
  };

  const actionTypes = useMemo(
    () => ['All', ...new Set(entries.map((e) => e.actionType).filter(Boolean))],
    [entries],
  );

  const filtered = entries.filter((e) => {
    if (statusFilter !== 'All' && e.status !== statusFilter) return false;
    if (actionFilter !== 'All' && e.actionType !== actionFilter) return false;
    return true;
  });

  const groups = groupByDate(filtered);

  if (loading) return <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>;

  return (
    <div className="space-y-5">
      {error && <InfoBanner variant="danger">{error}</InfoBanner>}

      <p className="text-sm text-slate-600">
        Everything Autopilot has done in the last 7 days, plus what it plans to do over the next 30.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Filter size={13} className="text-slate-500 flex-shrink-0" aria-hidden="true" />
        <label className="sr-only" htmlFor="activity-status">Filter by status</label>
        <select
          id="activity-status"
          className="input w-auto text-xs py-1.5"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="activity-action">Filter by action type</label>
        <select
          id="activity-action"
          className="input w-auto text-xs py-1.5"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          {actionTypes.map((t) => (
            <option key={t} value={t}>{t === 'All' ? 'All action types' : actionMeta(t).label}</option>
          ))}
        </select>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Zap}
          title={entries.length === 0 ? 'No Autopilot activity yet' : 'Nothing matches these filters'}
          description={
            entries.length === 0
              ? 'Activity appears here as Farik handles rent, maintenance, and tenant messages.'
              : 'Try clearing the status or action filter.'
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <div className="flex items-center gap-3 mb-2.5">
                <h3 className={`text-sm font-semibold ${group.isToday ? 'text-brand-600' : 'text-slate-700'}`}>
                  {group.label}
                </h3>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-500">{group.items.length}</span>
              </div>
              <ul className="space-y-2">
                {group.items.map((entry) => (
                  <ActivityEntry key={entry.id} entry={entry} onCancel={handleCancel} cancelling={cancelling} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
