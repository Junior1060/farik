import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, AlertTriangle, Wrench, MessageSquare, FileText,
  Zap, CheckCircle2, Clock, XCircle, Ban, Filter,
  Building2, ChevronDown, RefreshCw,
} from 'lucide-react';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { getTimeline, cancelScheduled } from '../services/agentService';

// ── Constants ────────────────────────────────────────────────────────────────

const ACTION_META = {
  RENT_REMINDER:        { label: 'Rent Reminder',     icon: DollarSign,    color: 'bg-emerald-100 text-emerald-600 border-emerald-200',  dot: 'bg-emerald-400' },
  LATE_RENT_NOTICE:     { label: 'Late Rent Notice',  icon: AlertTriangle, color: 'bg-amber-100 text-amber-600 border-amber-200',        dot: 'bg-amber-400'   },
  LATE_RENT_ESCALATION: { label: 'Rent Escalation',   icon: AlertTriangle, color: 'bg-red-100 text-red-600 border-red-200',              dot: 'bg-red-500'     },
  MAINTENANCE_TRIAGE:   { label: 'Maintenance Triage',icon: Wrench,        color: 'bg-violet-100 text-violet-600 border-violet-200',     dot: 'bg-violet-400'  },
  MAINTENANCE_BOOKING:  { label: 'Vendor Booking',    icon: Wrench,        color: 'bg-violet-100 text-violet-600 border-violet-200',     dot: 'bg-violet-400'  },
  MESSAGE_RESPONSE:     { label: 'Message Reply',     icon: MessageSquare, color: 'bg-blue-100 text-blue-600 border-blue-200',           dot: 'bg-blue-400'    },
  LEASE_RENEWAL_DRAFT:  { label: 'Lease Renewal',     icon: FileText,      color: 'bg-slate-100 text-slate-600 border-slate-200',        dot: 'bg-slate-400'   },
};

const STATUS_META = {
  SCHEDULED:  { label: 'Scheduled',  bg: 'bg-blue-50 text-blue-700',    ring: 'bg-blue-400'   },
  COMPLETED:  { label: 'Completed',  bg: 'bg-green-50 text-green-700',  ring: 'bg-green-400'  },
  ESCALATED:  { label: 'Escalated',  bg: 'bg-amber-50 text-amber-700',  ring: 'bg-amber-400'  },
  APPROVED:   { label: 'Approved',   bg: 'bg-green-50 text-green-700',  ring: 'bg-green-400'  },
  REJECTED:   { label: 'Rejected',   bg: 'bg-slate-100 text-slate-500', ring: 'bg-slate-300'  },
  CANCELLED:  { label: 'Cancelled',  bg: 'bg-slate-100 text-slate-400', ring: 'bg-slate-300'  },
};

const ACTION_TYPES = ['All', ...Object.keys(ACTION_META)];
const STATUSES = ['All', 'SCHEDULED', 'COMPLETED', 'ESCALATED', 'CANCELLED'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeading(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function isFuture(date) {
  return new Date(date) > new Date();
}

function groupByDate(entries) {
  const groups = {};
  for (const entry of entries) {
    const key = new Date(entry.time).toDateString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return Object.entries(groups).map(([key, items]) => ({
    dateKey: key,
    label: formatDateHeading(key),
    isFuture: isFuture(new Date(key)),
    isToday: new Date(key).toDateString() === new Date().toDateString(),
    items,
  }));
}

// ── Timeline Entry ────────────────────────────────────────────────────────────

function TimelineEntry({ entry, onCancel, cancelling }) {
  const meta = ACTION_META[entry.actionType] || ACTION_META.RENT_REMINDER;
  const statusMeta = STATUS_META[entry.status] || STATUS_META.SCHEDULED;
  const Icon = meta.icon;
  const cancelled = entry.status === 'CANCELLED';
  const canCancel = entry.cancellable && entry.status === 'SCHEDULED';

  return (
    <div className={`flex gap-4 py-3 group ${cancelled ? 'opacity-50' : ''}`}>
      {/* Time */}
      <div className="w-16 flex-shrink-0 text-right">
        <span className="text-xs text-slate-400 font-mono leading-6">{formatTime(entry.time)}</span>
      </div>

      {/* Dot on the line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm mt-1.5 flex-shrink-0 ${
          entry.status === 'ESCALATED' ? `${statusMeta.ring} animate-pulse` : statusMeta.ring
        }`} />
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 pb-3 ${cancelled ? 'line-through decoration-slate-400' : ''}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Action type chip */}
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${meta.color}`}>
              <Icon size={11} />
              {meta.label}
            </span>
            {/* Status badge */}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusMeta.bg}`}>
              {statusMeta.label}
            </span>
            {/* Confidence */}
            {entry.confidence === 'LOW' && (
              <span className="text-xs text-orange-500 font-medium">needs approval</span>
            )}
          </div>

          {canCancel && (
            <button
              onClick={() => onCancel(entry)}
              disabled={cancelling === entry.id}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100 border border-transparent hover:border-red-100 disabled:opacity-40"
            >
              {cancelling === entry.id
                ? <RefreshCw size={11} className="animate-spin" />
                : <Ban size={11} />}
              Cancel
            </button>
          )}
        </div>

        {/* Summary */}
        <p className={`text-sm mt-1 leading-snug ${cancelled ? 'text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {entry.summary}
        </p>

        {/* Tenant / unit */}
        {(entry.tenantName || entry.unitName || entry.propertyName) && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {entry.tenantName && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{entry.tenantName}</span>
            )}
            {entry.unitName && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Building2 size={10} /> {entry.unitName}
                  {entry.propertyName && `, ${entry.propertyName}`}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Date Group ───────────────────────────────────────────────────────────────

function DateGroup({ group, onCancel, cancelling, collapsed, onToggle }) {
  return (
    <div>
      {/* Date header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 py-2 sticky top-0 bg-surface-100 dark:bg-brand-900 z-10"
      >
        <div className={`flex items-center gap-2 ${group.isToday ? 'text-brand-600' : group.isFuture ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
          <span className={`text-sm font-semibold ${group.isToday ? 'text-brand-600 dark:text-brand-400' : ''}`}>
            {group.label}
          </span>
          {group.isToday && (
            <span className="text-xs bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-medium">today</span>
          )}
          {group.isFuture && !group.isToday && (
            <span className="text-xs text-slate-400">↑ upcoming</span>
          )}
        </div>
        <div className="flex-1 h-px bg-slate-200 dark:bg-brand-700" />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{group.items.length}</span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </div>
      </button>

      {/* Entries */}
      {!collapsed && (
        <div className="relative ml-[5.5rem]">
          {/* Vertical connector line */}
          <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200 dark:bg-brand-700" />
          <div className="space-y-0">
            {group.items.map((entry) => (
              <TimelineEntry
                key={entry.id}
                entry={entry}
                onCancel={onCancel}
                cancelling={cancelling}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AutopilotTimelinePage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);
  const [filterAction, setFilterAction] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTimeline();
      setEntries(data);
    } catch (err) {
      console.error(err);
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
        prev.map((e) => (e.id === entry.id ? { ...e, status: 'CANCELLED', cancellable: false } : e))
      );
    } finally {
      setCancelling(null);
    }
  };

  const toggleGroup = (key) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  // Filter
  const filtered = entries.filter((e) => {
    if (filterAction !== 'All' && e.actionType !== filterAction) return false;
    if (filterStatus !== 'All' && e.status !== filterStatus) return false;
    return true;
  });

  const groups = groupByDate(filtered);

  // Stats
  const completed = entries.filter((e) => e.status === 'COMPLETED').length;
  const scheduled = entries.filter((e) => e.status === 'SCHEDULED').length;
  const escalated = entries.filter((e) => e.status === 'ESCALATED').length;
  const cancelled = entries.filter((e) => e.status === 'CANCELLED').length;

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Autopilot Timeline</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Past 7 days of completed actions · Next 30 days of scheduled work
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-brand-700 rounded-xl hover:bg-slate-50 dark:hover:bg-brand-700 transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Completed', value: completed, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', filter: 'COMPLETED' },
          { label: 'Scheduled', value: scheduled, icon: Clock,         color: 'text-blue-600',  bg: 'bg-blue-50 dark:bg-blue-900/20',  filter: 'SCHEDULED' },
          { label: 'Escalated', value: escalated, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20',filter: 'ESCALATED' },
          { label: 'Cancelled', value: cancelled, icon: XCircle,       color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800',  filter: 'CANCELLED' },
        ].map(({ label, value, icon: Icon, color, bg, filter }) => (
          <button
            key={label}
            onClick={() => setFilterStatus(filterStatus === filter ? 'All' : filter)}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
              filterStatus === filter
                ? 'border-brand-300 bg-brand-50 dark:bg-brand-800 dark:border-brand-600'
                : 'border-slate-100 dark:border-brand-700 bg-white dark:bg-brand-800 hover:border-slate-200'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
              <Icon size={15} className={color} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-none">{value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-start gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter size={13} className="text-slate-400 flex-shrink-0" />
          {ACTION_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilterAction(t)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filterAction === t
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 dark:bg-brand-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-brand-700'
              }`}
            >
              {t === 'All' ? 'All types' : ACTION_META[t]?.label || t}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {groups.length === 0 ? (
        <div className="bg-white dark:bg-brand-800 rounded-2xl border border-slate-100 dark:border-brand-700 p-16 text-center">
          <Zap size={36} className="text-slate-200 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">No timeline entries</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            {filterAction !== 'All' || filterStatus !== 'All'
              ? 'Try clearing the filters'
              : 'The agent timeline will populate as leases and payments are created'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-brand-800 rounded-2xl border border-slate-100 dark:border-brand-700 px-6 py-4 space-y-1">
          {groups.map((group) => (
            <DateGroup
              key={group.dateKey}
              group={group}
              onCancel={handleCancel}
              cancelling={cancelling}
              collapsed={!!collapsed[group.dateKey]}
              onToggle={() => toggleGroup(group.dateKey)}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-5 flex items-center gap-4 flex-wrap px-1">
        <span className="text-xs text-slate-400 font-medium">Legend</span>
        {Object.entries(STATUS_META).map(([status, { label, ring }]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${ring}`} />
            <span className="text-xs text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
