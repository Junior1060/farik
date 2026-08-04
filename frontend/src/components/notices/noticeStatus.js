/**
 * The full notice status vocabulary.
 *
 * Only `reachable` statuses can be produced by this application today:
 *  - DRAFT             a notice you (or Farik) saved but have not approved
 *  - AWAITING_APPROVAL a Farik-prepared notice sitting in the Autopilot queue.
 *                      This is NOT a Notice row — it is an AgentLog with
 *                      status ESCALATED and draftContent {type:'notice'}. It is
 *                      merged into the list read-only.
 *  - SENT              you approved it; Farik recorded it and showed it to the
 *                      tenant in their portal. Farik does not transmit it.
 *
 * The rest are documented so the vocabulary is explicit, but they are never
 * rendered and the backend zod schema rejects them. Each needs a real
 * integration before it could mean anything:
 *  - SCHEDULED  needs a notice scheduler (nothing schedules notices today)
 *  - DELIVERED  needs delivery receipts from a mail/SMS provider
 *  - FAILED     needs an actual transmission that can fail
 */
export const NOTICE_STATUS = {
  DRAFT: {
    label: 'Draft',
    description: 'Not approved. Nothing has been recorded or shown to the tenant.',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    reachable: true,
  },
  AWAITING_APPROVAL: {
    label: 'Awaiting your approval',
    description: 'Farik prepared this and is waiting for your decision in Autopilot.',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    reachable: true,
  },
  SENT: {
    label: 'Recorded as sent',
    description: 'Recorded in Farik and visible to the tenant in their portal.',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    reachable: true,
  },
  SCHEDULED: {
    label: 'Scheduled',
    description: 'Requires a notice scheduler.',
    badge: 'bg-blue-50 text-blue-800 border-blue-200',
    reachable: false,
  },
  DELIVERED: {
    label: 'Delivered',
    description: 'Requires delivery confirmation from a mail or messaging provider.',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    reachable: false,
  },
  FAILED: {
    label: 'Failed',
    description: 'Requires an actual transmission that can fail.',
    badge: 'bg-red-50 text-red-700 border-red-200',
    reachable: false,
  },
};

export const noticeStatus = (status) =>
  NOTICE_STATUS[status] || {
    label: String(status || 'Unknown'),
    description: '',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    reachable: true,
  };

/** Notice categories. Drives the draft title prefix used to classify the list. */
// TODO: add a Notice.type column so classification stops depending on the title.
export const NOTICE_TYPES = [
  { id: 'LATE_RENT', label: 'Late rent', prefix: 'Late rent notice' },
  { id: 'LEASE_RENEWAL', label: 'Lease renewal', prefix: 'Lease renewal notice' },
  { id: 'ENTRY', label: 'Notice of entry', prefix: 'Notice of entry' },
  { id: 'GENERAL', label: 'General notice', prefix: 'Notice' },
];

export const noticeTypeFor = (id) => NOTICE_TYPES.find((t) => t.id === id) || NOTICE_TYPES[3];
