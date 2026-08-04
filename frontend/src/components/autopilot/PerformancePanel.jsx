import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Info } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import InfoBanner from '../ui/InfoBanner';
import EmptyState from '../ui/EmptyState';
import { getAgentLogs } from '../../services/agentService';
import { actionMeta } from './actionMeta';

/** Approval rate is meaningless on a handful of decisions — hide it until then. */
const MIN_DECISIONS_FOR_RATE = 5;

function medianMinutes(logs) {
  const spans = logs
    .map((l) => (new Date(l.updatedAt) - new Date(l.createdAt)) / 60000)
    .filter((m) => Number.isFinite(m) && m >= 0)
    .sort((a, b) => a - b);
  if (spans.length === 0) return null;
  const mid = Math.floor(spans.length / 2);
  return spans.length % 2 ? spans[mid] : (spans[mid - 1] + spans[mid]) / 2;
}

function humanDuration(minutes) {
  if (minutes === null) return null;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

function Metric({ label, value, hint }) {
  return (
    <div className="card">
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-sm font-medium text-slate-700 mt-2">{label}</p>
      {hint && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

export default function PerformancePanel() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAgentLogs({ limit: 200 });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {
      setError('Could not load Autopilot performance. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const by = (s) => logs.filter((l) => l.status === s);
    const approved = by('APPROVED');
    const rejected = by('REJECTED');
    const decisions = [...approved, ...rejected];
    const breakdown = [...logs.reduce((m, l) => m.set(l.actionType, (m.get(l.actionType) || 0) + 1), new Map())]
      .sort((a, b) => b[1] - a[1]);
    return {
      executed: by('EXECUTED').length,
      escalated: by('ESCALATED').length,
      approved: approved.length,
      rejected: rejected.length,
      decisions: decisions.length,
      approvalRate: decisions.length >= MIN_DECISIONS_FOR_RATE
        ? Math.round((approved.length / decisions.length) * 100)
        : null,
      medianDecision: humanDuration(medianMinutes(decisions)),
      breakdown,
      max: breakdown[0]?.[1] || 1,
    };
  }, [logs]);

  if (loading) return <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>;

  if (error) return <InfoBanner variant="danger">{error}</InfoBanner>;

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No Autopilot history yet"
        description="Metrics appear here once Farik has handled tenant messages, rent follow-ups, or maintenance requests on this account."
      />
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Counted from your own Autopilot activity record. Nothing here is estimated or projected.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="Actions recorded" value={total} hint="Everything Farik has logged on this account." />
        <Metric label="Completed automatically" value={stats.executed} hint="Inside your Autopilot rules." />
        <Metric label="Sent to you for approval" value={stats.escalated + stats.approved + stats.rejected} hint={`${stats.escalated} still waiting.`} />
        <Metric
          label="Approval rate"
          value={stats.approvalRate === null ? '—' : `${stats.approvalRate}%`}
          hint={
            stats.approvalRate === null
              ? `Shown after ${MIN_DECISIONS_FOR_RATE} decisions (you have ${stats.decisions}).`
              : `${stats.approved} approved, ${stats.rejected} rejected.`
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="section-title mb-1">Time to decide</h3>
          <p className="text-xs text-slate-500 mb-4">
            Median time between Farik raising an action and you approving or rejecting it.
          </p>
          {stats.medianDecision ? (
            <p className="text-2xl font-bold text-slate-900">{stats.medianDecision}</p>
          ) : (
            <p className="text-sm text-slate-500">Not enough history yet.</p>
          )}
        </div>

        <div className="card">
          <h3 className="section-title mb-1">What Farik works on</h3>
          <p className="text-xs text-slate-500 mb-4">Recorded actions by type.</p>
          <ul className="space-y-2.5">
            {stats.breakdown.slice(0, 6).map(([type, count]) => (
              <li key={type}>
                <div className="flex items-center justify-between gap-3 text-sm mb-1">
                  <span className="text-slate-700 truncate">{actionMeta(type).label}</span>
                  <span className="font-semibold text-slate-900 flex-shrink-0">{count}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(count / stats.max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-500 px-1">
        <Info size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
        Response-time and message-volume metrics need the messaging integration to be configured before they can be measured.
      </p>
    </div>
  );
}
