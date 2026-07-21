import React, { useState, useEffect } from 'react';
import {
  DollarSign, Clock, Home, Wrench, CheckCircle2, AlertTriangle,
  Bot, Zap, MessageSquare, FileText, RotateCcw, ChevronRight, ArrowRight,
} from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import RentCollectionChart from '../components/dashboard/RentCollectionChart';
import RightPanel from '../components/dashboard/RightPanel';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import StatusBadge from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import useFetch from '../hooks/useFetch';
import { getDashboardSummary, getDashboardActivity } from '../services/dashboardService';
import { undoLog } from '../services/agentService';
import { formatCurrency, formatDate, daysUntilLabel } from '../utils/formatters';
import { useNavigate } from 'react-router-dom';
import { useAutopilot } from '../context/AutopilotContext';
import NeedsYouPanel from '../components/dashboard/NeedsYouPanel';

// ── Autopilot Status Bar ────────────────────────────────────────────────────

const STATUS_CONFIG = {
  green: {
    bar: 'bg-emerald-50 border-emerald-200',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    subtext: 'text-emerald-600',
    icon: CheckCircle2,
    label: 'Autopilot Active',
    sub: 'All systems running — no action needed',
  },
  yellow: {
    bar: 'bg-amber-50 border-amber-200',
    dot: 'bg-amber-500 animate-pulse',
    text: 'text-amber-700',
    subtext: 'text-amber-600',
    icon: Clock,
    label: 'Needs Attention',
    sub: null,
  },
  red: {
    bar: 'bg-red-50 border-red-200',
    dot: 'bg-red-500 animate-pulse',
    text: 'text-red-700',
    subtext: 'text-red-600',
    icon: AlertTriangle,
    label: 'Action Required',
    sub: 'Urgent item needs your attention',
  },
  off: {
    bar: 'bg-slate-50 border-slate-200',
    dot: 'bg-slate-300',
    text: 'text-slate-500',
    subtext: 'text-slate-400',
    icon: Bot,
    label: 'Autopilot Off',
    sub: 'Enable autopilot to automate routine tasks',
  },
};

function AutopilotStatusBar() {
  const autopilot = useAutopilot();
  const navigate = useNavigate();
  if (!autopilot?.loaded || autopilot.status === 'loading') return null;

  const cfg = STATUS_CONFIG[autopilot.status] || STATUS_CONFIG.off;
  const Icon = cfg.icon;
  const sub = autopilot.status === 'yellow'
    ? `${autopilot.escalatedCount} item${autopilot.escalatedCount !== 1 ? 's' : ''} need${autopilot.escalatedCount === 1 ? 's' : ''} your attention`
    : cfg.sub;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border mb-5 ${cfg.bar}`}>
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className="relative flex-shrink-0">
          <Icon size={17} className={cfg.text} />
          {autopilot.status === 'red' && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
          {autopilot.status === 'yellow' && (
            <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {autopilot.escalatedCount}
            </span>
          )}
          {sub && <span className={`text-sm ${cfg.subtext}`}>— {sub}</span>}
        </div>
      </div>

      {(autopilot.status === 'yellow' || autopilot.status === 'red') && (
        <button
          onClick={() => navigate('/agent')}
          className={`flex items-center gap-1.5 text-xs font-semibold flex-shrink-0 ${cfg.text} hover:underline`}
        >
          Review <ArrowRight size={12} />
        </button>
      )}
      {autopilot.status === 'off' && (
        <button
          onClick={autopilot.toggle}
          className="flex-shrink-0 text-xs font-semibold text-brand-600 hover:underline"
        >
          Turn On
        </button>
      )}
    </div>
  );
}

// ── Activity Feed ────────────────────────────────────────────────────────────

const ACTION_ICONS = {
  RENT_REMINDER: DollarSign,
  LATE_RENT_NOTICE: AlertTriangle,
  LATE_RENT_ESCALATION: AlertTriangle,
  MAINTENANCE_TRIAGE: Wrench,
  MAINTENANCE_BOOKING: Wrench,
  MESSAGE_RESPONSE: MessageSquare,
  LEASE_RENEWAL_DRAFT: FileText,
};

const ACTION_COLORS = {
  RENT_REMINDER: 'bg-emerald-50 text-emerald-600',
  LATE_RENT_NOTICE: 'bg-amber-50 text-amber-600',
  LATE_RENT_ESCALATION: 'bg-red-50 text-red-600',
  MAINTENANCE_TRIAGE: 'bg-violet-50 text-violet-600',
  MAINTENANCE_BOOKING: 'bg-blue-50 text-blue-600',
  MESSAGE_RESPONSE: 'bg-indigo-50 text-indigo-600',
  LEASE_RENEWAL_DRAFT: 'bg-slate-100 text-slate-600',
};

function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function ActivityFeedPanel() {
  const autopilot = useAutopilot();
  const navigate = useNavigate();
  const [undoing, setUndoing] = useState(null);
  const [undone, setUndone] = useState(new Set());

  if (!autopilot) return null;
  const logs = autopilot.recentLogs || [];

  const handleUndo = async (log) => {
    if (undone.has(log.id)) return;
    setUndoing(log.id);
    try {
      await undoLog(log.id);
      setUndone((prev) => new Set([...prev, log.id]));
      autopilot.removeLog(log.id);
    } catch {
      // action may already not be undoable — just mark locally
      setUndone((prev) => new Set([...prev, log.id]));
    } finally {
      setUndoing(null);
    }
  };

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-brand-500" />
          <h3 className="section-title">AI Activity</h3>
        </div>
        <button
          onClick={() => navigate('/agent')}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
        >
          View all <ChevronRight size={12} />
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <Bot size={32} className="text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">No activity yet</p>
          <p className="text-xs text-slate-400 mt-1">
            The agent will appear here as it works
          </p>
        </div>
      ) : (
        <div className="space-y-1 flex-1 overflow-y-auto -mx-1 px-1">
          {logs.slice(0, 8).map((log) => {
            const Icon = ACTION_ICONS[log.actionType] || Zap;
            const colorClass = ACTION_COLORS[log.actionType] || 'bg-slate-100 text-slate-500';
            const isEscalated = log.status === 'ESCALATED';
            const wasUndone = undone.has(log.id);

            return (
              <div
                key={log.id}
                className={`group flex items-start gap-3 p-2.5 rounded-xl transition-colors ${
                  isEscalated ? 'bg-amber-50 border border-amber-200' : 'hover:bg-slate-50'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${colorClass}`}>
                  <Icon size={13} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug text-slate-600">{log.summary}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-slate-400">{timeAgo(log.createdAt)}</span>
                    {isEscalated && (
                      <span className="text-[11px] font-semibold text-amber-600">Needs review</span>
                    )}
                  </div>
                </div>

                {log.status === 'EXECUTED' && !wasUndone && (
                  <button
                    onClick={() => handleUndo(log)}
                    disabled={undoing === log.id}
                    className="flex-shrink-0 flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                  >
                    <RotateCcw size={11} />
                    Undo
                  </button>
                )}
                {wasUndone && (
                  <span className="flex-shrink-0 text-[11px] text-slate-400 italic px-2 py-1">Undone</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const DashboardPage = () => {
  const navigate = useNavigate();
  const { data: summary, loading: loadingSummary } = useFetch(getDashboardSummary);
  const { data: activityData, loading: loadingActivity } = useFetch(getDashboardActivity);

  // First-run onboarding: a landlord with an empty account is sent straight to AI import.
  useEffect(() => {
    if (summary && summary.stats?.totalUnits === 0) {
      navigate('/import', { replace: true });
    }
  }, [summary, navigate]);

  if (loadingSummary) return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size="lg" />
    </div>
  );

  const stats = summary?.stats || {};
  const breakdown = summary?.rentBreakdown || {};
  const maintenance = summary?.recentMaintenance || [];
  const expiringLeases = summary?.expiringLeases || [];
  const activity = activityData?.activity || [];

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Autopilot status bar */}
        <AutopilotStatusBar />

        {/* Needs You — pending escalations */}
        <NeedsYouPanel />

        {/* Stats row */}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Collected"
            value={formatCurrency(stats.totalCollected || 0)}
            subtitle="This month"
            icon={DollarSign}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
          />
          <StatCard
            title="Pending Rent"
            value={formatCurrency(stats.totalPending || 0)}
            subtitle={`${stats.maintenanceOpen || 0} overdue`}
            icon={Clock}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
          <StatCard
            title="Occupied Units"
            value={`${stats.occupiedUnits || 0}/${stats.totalUnits || 0}`}
            subtitle={`${stats.occupancyRate || 0}% occupancy`}
            icon={Home}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
          />
          <StatCard
            title="Maintenance"
            value={stats.maintenanceOpen || 0}
            subtitle="Open requests"
            icon={Wrench}
            iconBg="bg-red-50"
            iconColor="text-red-500"
          />
        </div>

        {/* Chart + Activity Feed row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <RentCollectionChart breakdown={breakdown} stats={stats} />
          </div>

          {/* AI Activity Feed */}
          <div className="lg:col-span-2">
            <ActivityFeedPanel />
          </div>
        </div>

        {/* Recent maintenance + Expiring leases */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Maintenance requests */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Recent Requests</h3>
              <button onClick={() => navigate('/maintenance')} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                View all
              </button>
            </div>
            {maintenance.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No maintenance requests</p>
            ) : (
              <div className="space-y-3">
                {maintenance.map((req) => (
                  <div key={req.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800 truncate">{req.title}</p>
                        <PriorityBadge priority={req.priority} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {req.tenant?.firstName} {req.tenant?.lastName} · {req.unit?.name}
                      </p>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lease overview */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Lease Status</h3>
              <button onClick={() => navigate('/leases')} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                View all
              </button>
            </div>
            {expiringLeases.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No leases expiring soon</p>
            ) : (
              <div className="space-y-3">
                {expiringLeases.map((lease) => (
                  <div key={lease.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {lease.tenant?.firstName} {lease.tenant?.lastName}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{lease.unit?.name} · {formatDate(lease.endDate)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-amber-600">{daysUntilLabel(lease.endDate)}</p>
                      <StatusBadge status={lease.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="hidden xl:block">
        <RightPanel stats={stats} activity={activity} expiringLeases={expiringLeases} />
      </div>
    </div>
  );
};

export default DashboardPage;
