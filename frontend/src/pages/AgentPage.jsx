import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, Zap, CheckCircle2, AlertTriangle, Clock, ChevronRight,
  Play, ToggleLeft, ToggleRight, Plus, Trash2, Pencil, X, Phone,
  Mail, Wrench, RefreshCw,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  getAgentConfig, updateAgentConfig, getAgentLogs, approveLog, rejectLog,
  getVendors, createVendor, updateVendor, deleteVendor, triggerAgentRun,
} from '../services/agentService';
import { getOrgPolicies, updateOrgPolicy } from '../services/policyApi';
import TrustLevelSelector from '../components/agent/TrustLevelSelector';
import PolicyOverrideTable from '../components/agent/PolicyOverrideTable';

const POLICY_DOMAINS = [
  { id: 'MAINTENANCE', label: 'Maintenance' },
  { id: 'RENT', label: 'Rent' },
  { id: 'LEASE', label: 'Lease' },
  { id: 'COMMUNICATION', label: 'Communication' },
];

const ACTION_LABELS = {
  RENT_REMINDER: 'Rent Reminder',
  LATE_RENT_NOTICE: 'Late Rent Notice',
  LATE_RENT_ESCALATION: 'Late Rent Escalation',
  MAINTENANCE_TRIAGE: 'Maintenance Triage',
  MAINTENANCE_BOOKING: 'Vendor Booking',
  MESSAGE_RESPONSE: 'Message Response',
  LEASE_RENEWAL_DRAFT: 'Lease Renewal',
};

const CONFIDENCE_STYLES = {
  HIGH: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-orange-100 text-orange-700',
};

const STATUS_STYLES = {
  EXECUTED: 'bg-blue-100 text-blue-700',
  ESCALATED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const SPECIALTIES = ['plumbing', 'electrical', 'hvac', 'structural', 'appliance', 'general'];

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 w-full py-3 px-4 rounded-xl hover:bg-slate-50 transition-colors text-left"
    >
      {checked
        ? <ToggleRight size={22} className="text-brand-500 flex-shrink-0" />
        : <ToggleLeft size={22} className="text-slate-400 flex-shrink-0" />}
      <span className={`text-sm font-medium ${checked ? 'text-slate-800' : 'text-slate-500'}`}>{label}</span>
    </button>
  );
}

function ConfidenceBadge({ level }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONFIDENCE_STYLES[level] || 'bg-slate-100 text-slate-600'}`}>
      {level}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function LogRow({ log, onApprove, onReject, approving }) {
  const [expanded, setExpanded] = useState(false);
  const details = log.details || {};

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex items-start gap-3 p-4 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-0.5 flex-shrink-0">
          {log.status === 'EXECUTED' || log.status === 'APPROVED'
            ? <CheckCircle2 size={16} className="text-green-500" />
            : log.status === 'ESCALATED'
            ? <AlertTriangle size={16} className="text-amber-500" />
            : <X size={16} className="text-red-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-500">{ACTION_LABELS[log.actionType] || log.actionType}</span>
            <ConfidenceBadge level={log.confidence} />
            <StatusBadge status={log.status} />
          </div>
          <p className="text-sm text-slate-700 leading-snug">{log.summary}</p>
          <p className="text-xs text-slate-400 mt-1">{new Date(log.createdAt).toLocaleString()}</p>
        </div>
        <ChevronRight size={14} className={`flex-shrink-0 mt-1 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-50 bg-slate-50/50">
          {Object.keys(details).length > 0 && (
            <pre className="text-xs text-slate-600 mt-3 whitespace-pre-wrap font-mono bg-white rounded-lg p-3 border border-slate-100 overflow-auto max-h-48">
              {JSON.stringify(details, null, 2)}
            </pre>
          )}
          {log.status === 'ESCALATED' && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => onApprove(log.id)}
                disabled={approving === log.id}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {approving === log.id ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Approve
              </button>
              <button
                onClick={() => onReject(log.id)}
                disabled={approving === log.id}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-100 text-red-700 text-sm font-medium rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
              >
                <X size={13} /> Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const emptyVendor = { name: '', phone: '', email: '', specialty: 'general', notes: '' };

export default function AgentPage() {
  const [tab, setTab] = useState('overview');
  const [config, setConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [vendorModal, setVendorModal] = useState(null); // null | 'add' | vendor object
  const [vendorForm, setVendorForm] = useState(emptyVendor);
  const [vendorSaving, setVendorSaving] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [policies, setPolicies] = useState({});
  const [policyDomain, setPolicyDomain] = useState('MAINTENANCE');
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, logsData, vends] = await Promise.all([
        getAgentConfig(),
        getAgentLogs({ limit: 100 }),
        getVendors(),
      ]);
      setConfig(cfg);
      setLogs(logsData.logs);
      setLogsTotal(logsData.total);
      setVendors(vends);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    try {
      setPolicies(await getOrgPolicies());
    } catch (err) {
      console.error(err);
    } finally {
      setPoliciesLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === 'policies') loadPolicies(); }, [tab, loadPolicies]);

  const handleTrustLevelChange = async (domain, trustLevel) => {
    setPolicySaving(true);
    try {
      const updated = await updateOrgPolicy(domain, { trustLevel });
      setPolicies((prev) => ({ ...prev, [domain]: { ...prev[domain], trustLevel: updated.trustLevel, source: 'org_default' } }));
    } finally {
      setPolicySaving(false);
    }
  };

  const handleConfigToggle = async (key, value) => {
    const optimistic = { ...config, [key]: value };
    setConfig(optimistic);
    try {
      const updated = await updateAgentConfig({ [key]: value });
      setConfig(updated);
    } catch {
      setConfig(config);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerAgentRun();
      setTimeout(() => load(), 2000);
    } finally {
      setTriggering(false);
    }
  };

  const handleApprove = async (id) => {
    setApprovingId(id);
    try {
      const updated = await approveLog(id);
      setLogs((prev) => prev.map((l) => (l.id === id ? updated : l)));
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (id) => {
    setApprovingId(id);
    try {
      const updated = await rejectLog(id);
      setLogs((prev) => prev.map((l) => (l.id === id ? updated : l)));
    } finally {
      setApprovingId(null);
    }
  };

  const openAddVendor = () => { setVendorForm(emptyVendor); setVendorModal('add'); };
  const openEditVendor = (v) => { setVendorForm(v); setVendorModal(v); };

  const handleSaveVendor = async () => {
    setVendorSaving(true);
    try {
      if (vendorModal === 'add') {
        const v = await createVendor(vendorForm);
        setVendors((prev) => [v, ...prev]);
      } else {
        const v = await updateVendor(vendorModal.id, vendorForm);
        setVendors((prev) => prev.map((x) => (x.id === vendorModal.id ? v : x)));
      }
      setVendorModal(null);
    } finally {
      setVendorSaving(false);
    }
  };

  const handleDeleteVendor = async (id) => {
    if (!confirm('Remove this vendor?')) return;
    await deleteVendor(id);
    setVendors((prev) => prev.filter((v) => v.id !== id));
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const escalated = logs.filter((l) => l.status === 'ESCALATED');
  const executed = logs.filter((l) => l.status === 'EXECUTED');
  const filteredLogs = logFilter ? logs.filter((l) => l.status === logFilter) : logs;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'approvals', label: `Approvals${escalated.length ? ` (${escalated.length})` : ''}` },
    { id: 'logs', label: 'Activity Log' },
    { id: 'vendors', label: 'Vendors' },
    { id: 'policies', label: 'Policies' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="AI Property Manager"
        description="Autonomous agent handling rent, maintenance, messages, and lease renewals"
        action={
          <div className="flex items-center gap-3">
            <button
              onClick={handleTrigger}
              disabled={triggering}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
            >
              {triggering ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
              Run Now
            </button>
            <button
              onClick={() => handleConfigToggle('isEnabled', !config?.isEnabled)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors shadow-sm ${
                config?.isEnabled
                  ? 'bg-brand-500 text-white hover:bg-brand-600'
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >
              <Bot size={15} />
              {config?.isEnabled ? 'Agent On' : 'Agent Off'}
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {[
          { label: 'Total Actions', value: logsTotal, icon: Zap, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Auto-Executed', value: executed.length, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
          { label: 'Pending Approval', value: escalated.length, icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Vendors on File', value: vendors.length, icon: Wrench, color: 'text-purple-500', bg: 'bg-purple-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mt-6 bg-slate-100 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="mt-6 grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Autonomous Behaviors</h3>
            <p className="text-xs text-slate-400 mb-4">Toggle which tasks the agent handles automatically</p>
            <div className="divide-y divide-slate-50">
              <Toggle
                checked={config?.autoRentReminders}
                onChange={(v) => handleConfigToggle('autoRentReminders', v)}
                label="Rent reminders (3 days before, day of, day after)"
              />
              <Toggle
                checked={config?.autoMaintenance}
                onChange={(v) => handleConfigToggle('autoMaintenance', v)}
                label="Maintenance triage & vendor booking"
              />
              <Toggle
                checked={config?.autoMessages}
                onChange={(v) => handleConfigToggle('autoMessages', v)}
                label="AI replies to common tenant messages"
              />
              <Toggle
                checked={config?.autoLeaseRenewal}
                onChange={(v) => handleConfigToggle('autoLeaseRenewal', v)}
                label="Lease renewal drafts (90 days before expiry)"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Confidence Levels</h3>
            <p className="text-xs text-slate-400 mb-4">How the agent decides when to act vs. ask</p>
            <div className="space-y-3">
              {[
                { level: 'HIGH', color: 'bg-green-500', desc: 'Acts automatically, no notification needed' },
                { level: 'MEDIUM', color: 'bg-yellow-500', desc: 'Acts automatically and notifies you' },
                { level: 'LOW', color: 'bg-orange-500', desc: 'Pauses and waits for your approval' },
              ].map(({ level, color, desc }) => (
                <div key={level} className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 ${color} rounded-full mt-1.5 flex-shrink-0`} />
                  <div>
                    <span className="text-sm font-semibold text-slate-700">{level}</span>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Late rent at day 7</span> is always escalated to you regardless of confidence — legal sensitivity requires your judgment.
              </p>
            </div>
          </div>

          {/* Recent actions preview */}
          {logs.length > 0 && (
            <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700">Recent Agent Activity</h3>
                <button onClick={() => setTab('logs')} className="text-xs text-brand-500 hover:underline">View all</button>
              </div>
              <div className="space-y-2">
                {logs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                    {log.status === 'EXECUTED' || log.status === 'APPROVED'
                      ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                      : log.status === 'ESCALATED'
                      ? <Clock size={14} className="text-amber-500 flex-shrink-0" />
                      : <X size={14} className="text-red-400 flex-shrink-0" />}
                    <p className="text-sm text-slate-700 flex-1 min-w-0 truncate">{log.summary}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <ConfidenceBadge level={log.confidence} />
                      <span className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approvals Tab */}
      {tab === 'approvals' && (
        <div className="mt-6">
          {escalated.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
              <CheckCircle2 size={36} className="text-green-400 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No pending approvals</p>
              <p className="text-sm text-slate-400 mt-1">The agent is handling everything autonomously right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {escalated.map((log) => (
                <LogRow key={log.id} log={log} onApprove={handleApprove} onReject={handleReject} approving={approvingId} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {tab === 'logs' && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-slate-500">Filter:</span>
            {['', 'EXECUTED', 'ESCALATED', 'APPROVED', 'REJECTED'].map((f) => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  logFilter === f ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f || 'All'}
              </button>
            ))}
          </div>
          {filteredLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
              <Bot size={36} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No agent actions yet.</p>
              <p className="text-sm text-slate-400 mt-1">Actions appear here as the agent works.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => (
                <LogRow key={log.id} log={log} onApprove={handleApprove} onReject={handleReject} approving={approvingId} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vendors Tab */}
      {tab === 'vendors' && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">
              Vendors the agent can assign for maintenance requests. Match by specialty.
            </p>
            <button
              onClick={openAddVendor}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-colors"
            >
              <Plus size={15} /> Add Vendor
            </button>
          </div>

          {vendors.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
              <Wrench size={36} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No vendors yet</p>
              <p className="text-sm text-slate-400 mt-1">Add vendors so the agent can auto-assign maintenance jobs.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {vendors.map((v) => (
                <div key={v.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-slate-800">{v.name}</h4>
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full capitalize">{v.specialty}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEditVendor(v)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDeleteVendor(v.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone size={13} className="text-slate-400" /> {v.phone}
                    </div>
                    {v.email && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Mail size={13} className="text-slate-400" /> {v.email}
                      </div>
                    )}
                    {v.notes && <p className="text-xs text-slate-400 mt-2">{v.notes}</p>}
                  </div>
                  {!v.isActive && (
                    <div className="mt-3 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">Inactive — agent will skip this vendor</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Policies Tab */}
      {tab === 'policies' && (
        <div className="mt-6">
          <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
            {POLICY_DOMAINS.map((d) => (
              <button
                key={d.id}
                onClick={() => setPolicyDomain(d.id)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  policyDomain === d.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {policiesLoading ? (
            <p className="text-sm text-slate-400">Loading policies…</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Account-wide trust level</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Applies to every property unless overridden below.
                </p>
                <TrustLevelSelector
                  value={policies[policyDomain]?.trustLevel}
                  disabled={policySaving}
                  onChange={(level) => handleTrustLevelChange(policyDomain, level)}
                />
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Per-property overrides</h3>
                <p className="text-xs text-slate-400 mb-4">
                  A property override always wins over the account-wide default.
                </p>
                <PolicyOverrideTable domain={policyDomain} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vendor Modal */}
      {vendorModal && (
        <Modal
          open
          onClose={() => setVendorModal(null)}
          title={vendorModal === 'add' ? 'Add Vendor' : 'Edit Vendor'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Name *</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={vendorForm.name}
                onChange={(e) => setVendorForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ABC Plumbing"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Specialty *</label>
              <select
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white capitalize"
                value={vendorForm.specialty}
                onChange={(e) => setVendorForm((f) => ({ ...f, specialty: e.target.value }))}
              >
                {SPECIALTIES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone *</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={vendorForm.phone}
                onChange={(e) => setVendorForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={vendorForm.email || ''}
                onChange={(e) => setVendorForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="vendor@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
              <textarea
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                rows={2}
                value={vendorForm.notes || ''}
                onChange={(e) => setVendorForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Available 24/7, bilingual..."
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Toggle
                checked={vendorForm.isActive !== false}
                onChange={(v) => setVendorForm((f) => ({ ...f, isActive: v }))}
                label="Active (agent will assign this vendor)"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSaveVendor}
                disabled={vendorSaving || !vendorForm.name || !vendorForm.phone}
                className="flex-1 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {vendorSaving ? 'Saving...' : 'Save Vendor'}
              </button>
              <button
                onClick={() => setVendorModal(null)}
                className="px-4 py-2.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
