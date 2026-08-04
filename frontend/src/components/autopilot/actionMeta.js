import {
  DollarSign, AlertTriangle, Wrench, MessageSquare, FileText, Scale, UserX, Receipt,
} from 'lucide-react';

/** Display metadata for every AgentActionType the backend can emit. */
export const ACTION_META = {
  RENT_REMINDER:         { label: 'Rent reminder',           icon: DollarSign,    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  LATE_RENT_NOTICE:      { label: 'Late rent notice',        icon: AlertTriangle, chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  LATE_RENT_ESCALATION:  { label: 'Rent escalation',         icon: AlertTriangle, chip: 'bg-red-50 text-red-700 border-red-200' },
  MAINTENANCE_TRIAGE:    { label: 'Maintenance triage',      icon: Wrench,        chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  MAINTENANCE_BOOKING:   { label: 'Vendor booking',          icon: Wrench,        chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  MAINTENANCE_ESCALATION:{ label: 'Maintenance escalation',  icon: Wrench,        chip: 'bg-red-50 text-red-700 border-red-200' },
  MESSAGE_RESPONSE:      { label: 'Message reply',           icon: MessageSquare, chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  LEASE_RENEWAL_DRAFT:   { label: 'Lease renewal draft',     icon: FileText,      chip: 'bg-slate-100 text-slate-700 border-slate-200' },
  CHARGE_DISPUTE:        { label: 'Charge dispute',          icon: Receipt,       chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  LEASE_BREAK_REQUEST:   { label: 'Lease break request',     icon: UserX,         chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  LEGAL_ESCALATION:      { label: 'Legal escalation',        icon: Scale,         chip: 'bg-red-50 text-red-700 border-red-200' },
  TENANT_COMPLAINT:      { label: 'Tenant complaint',        icon: MessageSquare, chip: 'bg-blue-50 text-blue-700 border-blue-200' },
};

export const actionMeta = (type) =>
  ACTION_META[type] || { label: String(type || 'Action').replace(/_/g, ' ').toLowerCase(), icon: FileText, chip: 'bg-slate-100 text-slate-700 border-slate-200' };

/**
 * Landlord-facing status vocabulary. The backend AgentLogStatus enum is
 * EXECUTED | ESCALATED | APPROVED | REJECTED | SCHEDULED | CANCELLED; the
 * timeline endpoint maps EXECUTED to COMPLETED. Both spellings are handled.
 */
export const STATUS_META = {
  COMPLETED: { label: 'Completed',           badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  EXECUTED:  { label: 'Completed',           badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  APPROVED:  { label: 'Approved by you',     badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  ESCALATED: { label: 'Waiting for approval',badge: 'bg-amber-50 text-amber-800 border-amber-200',       dot: 'bg-amber-500' },
  SCHEDULED: { label: 'In progress',         badge: 'bg-blue-50 text-blue-800 border-blue-200',          dot: 'bg-blue-500' },
  REJECTED:  { label: 'Rejected by you',     badge: 'bg-slate-100 text-slate-700 border-slate-200',      dot: 'bg-slate-400' },
  CANCELLED: { label: 'Cancelled',           badge: 'bg-slate-100 text-slate-600 border-slate-200',      dot: 'bg-slate-300' },
  FAILED:    { label: 'Failed',              badge: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500' },
};

export const statusMeta = (status) =>
  STATUS_META[status] || { label: String(status || 'Unknown'), badge: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' };

/** Where a log's related record lives in the app, when we can tell. */
export function entityLink(entityType, entityId) {
  if (!entityId) return null;
  switch (entityType) {
    case 'payment': return { to: '/payments', label: 'View payments' };
    case 'lease': return { to: '/leases', label: 'View leases' };
    case 'conversation': return { to: '/messages', label: 'View conversation' };
    case 'maintenance':
    case 'maintenanceRequest': return { to: `/maintenance/${entityId}`, label: 'View request' };
    case 'notice': return { to: '/notices', label: 'View notices' };
    default: return null;
  }
}

/** Why Farik acted — falls back to the confidence rationale when no reason is stored. */
const CONFIDENCE_REASON = {
  HIGH: 'Routine action inside your Autopilot rules, so Farik completed it.',
  MEDIUM: 'Inside your rules, but Farik flagged it so you can see it happened.',
  LOW: 'Outside what Farik may decide on its own, so it was sent to you for approval.',
};

export function explainWhy(log) {
  const details = log?.details || {};
  return details.reason || details.rationale || CONFIDENCE_REASON[log?.confidence] || 'No reason recorded.';
}
