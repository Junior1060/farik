/**
 * The single source of truth mapping each Autopilot rule shown in the UI to the
 * backend field that stores it.
 *
 * `enforced` records whether workflow code actually reads the value today. Rules
 * that are stored but not yet acted on are rendered in a clearly-labelled
 * "not yet enforced" section rather than being hidden or implied to work.
 *
 * @typedef {'switch'|'select'|'currency'|'number'|'time'} ControlKind
 * @typedef {'MAINTENANCE'|'RENT'|'LEASE'|'COMMUNICATION'} PolicyDomain
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {ControlKind} control
 * @property {'policy'|'agentConfig'} target
 * @property {PolicyDomain|null} domain   - policy domain (null for agentConfig rules)
 * @property {string} key                 - settings key, or AgentConfig column
 * @property {boolean} enforced           - true when backend code reads this value
 * @property {Array<{value: any, label: string}>} [options]
 */

/** @type {Rule[]} */
export const RULES = [
  // ── Enforced ───────────────────────────────────────────────────────────────
  {
    id: 'autoRentReminders',
    label: 'Prepare and send rent reminders automatically',
    description: 'Farik works through the reminder schedule for upcoming and overdue rent.',
    control: 'switch',
    target: 'agentConfig',
    domain: 'RENT',
    key: 'autoRentReminders',
    enforced: true,
  },
  {
    id: 'autoLeaseRenewal',
    label: 'Draft lease renewal offers',
    description: 'Farik prepares a renewal draft ahead of expiry. You approve before anything is recorded.',
    control: 'switch',
    target: 'agentConfig',
    domain: 'LEASE',
    key: 'autoLeaseRenewal',
    enforced: true,
  },
  {
    id: 'maxAutoSpend',
    label: 'Book repairs without asking, up to',
    description: 'Anything above this amount is held for your approval before a vendor is contacted.',
    control: 'currency',
    target: 'policy',
    domain: 'MAINTENANCE',
    key: 'maxAutoSpend',
    enforced: true,
  },
  {
    id: 'maxVendorRetries',
    label: 'Vendor follow-up attempts',
    description: 'How many times Farik re-contacts a vendor that has not responded.',
    control: 'select',
    target: 'policy',
    domain: 'MAINTENANCE',
    key: 'maxVendorRetries',
    enforced: true,
    options: [
      { value: 1, label: '1 attempt' },
      { value: 2, label: '2 attempts' },
      { value: 3, label: '3 attempts' },
    ],
  },
  {
    id: 'followUpIntervalHours',
    label: 'Wait before following up with a vendor',
    description: 'How long Farik waits for a reply before trying again.',
    control: 'select',
    target: 'policy',
    domain: 'MAINTENANCE',
    key: 'followUpIntervalHours',
    enforced: true,
    options: [
      { value: 12, label: '12 hours' },
      { value: 24, label: '24 hours' },
      { value: 48, label: '48 hours' },
    ],
  },

  // ── Stored, not yet enforced ───────────────────────────────────────────────
  {
    id: 'gracePeriodDays',
    label: 'Grace period before rent counts as late',
    description: 'Days after the due date before Farik treats a payment as overdue.',
    control: 'number',
    target: 'policy',
    domain: 'RENT',
    key: 'gracePeriodDays',
    enforced: false,
  },
  {
    id: 'firstReminderOffsetDays',
    label: 'First rent reminder',
    description: 'When the first reminder goes out, relative to the due date.',
    control: 'select',
    target: 'policy',
    domain: 'RENT',
    key: 'firstReminderOffsetDays',
    enforced: false,
    options: [
      { value: -5, label: '5 days before due' },
      { value: -3, label: '3 days before due' },
      { value: -1, label: '1 day before due' },
    ],
  },
  {
    id: 'landlordEscalationOffsetDays',
    label: 'Escalate overdue rent to me after',
    description: 'How long an unpaid balance runs before Farik brings it to you.',
    control: 'select',
    target: 'policy',
    domain: 'RENT',
    key: 'landlordEscalationOffsetDays',
    enforced: false,
    options: [
      { value: -3, label: '3 days late' },
      { value: -5, label: '5 days late' },
      { value: -7, label: '7 days late' },
    ],
  },
  {
    id: 'allowAutoScheduling',
    label: 'Let Farik propose vendor appointment times',
    description: 'Farik offers time slots to the tenant and the vendor without asking first.',
    control: 'switch',
    target: 'policy',
    domain: 'MAINTENANCE',
    key: 'allowAutoScheduling',
    enforced: false,
  },
  {
    id: 'requireTenantEntryPermission',
    label: 'Require tenant permission before entry',
    description: 'No visit is scheduled until the tenant has agreed to the entry.',
    control: 'switch',
    target: 'policy',
    domain: 'MAINTENANCE',
    key: 'requireTenantEntryPermission',
    enforced: false,
  },
  {
    id: 'requireApprovalForRenewalOffer',
    label: 'Renewal offers always need my approval',
    description: 'A renewal offer is never shared with a tenant until you approve it.',
    control: 'switch',
    target: 'policy',
    domain: 'LEASE',
    key: 'requireApprovalForRenewalOffer',
    enforced: false,
  },
  {
    id: 'smsEnabled',
    label: 'Send tenant messages by text',
    description: 'Requires a messaging number to be configured for this deployment.',
    control: 'switch',
    target: 'policy',
    domain: 'COMMUNICATION',
    key: 'smsEnabled',
    enforced: false,
  },
  {
    id: 'quietHoursStart',
    label: 'Quiet hours start',
    description: 'Farik holds non-urgent messages until quiet hours end.',
    control: 'time',
    target: 'policy',
    domain: 'COMMUNICATION',
    key: 'quietHoursStart',
    enforced: false,
  },
  {
    id: 'quietHoursEnd',
    label: 'Quiet hours end',
    description: 'When Farik may resume sending non-urgent messages.',
    control: 'time',
    target: 'policy',
    domain: 'COMMUNICATION',
    key: 'quietHoursEnd',
    enforced: false,
  },
];

/**
 * Rules that can never be relaxed by a setting. These mirror HARD_SAFETY_RULES
 * in backend/src/config/policyDefaults.js and are rendered read-only.
 */
export const LOCKED_RULES = [
  {
    id: 'neverAutoIssueLegalNotice',
    label: 'Never issue a legal or eviction notice automatically',
    description: 'Formal notices are always prepared as drafts for your review.',
  },
  {
    id: 'neverAutoApplyRentIncrease',
    label: 'Never apply a rent increase automatically',
    description: 'Rent changes require your explicit approval.',
  },
  {
    id: 'neverAutoPayVendor',
    label: 'Never pay a vendor automatically',
    description: 'Vendor invoices are queued for your approval before anything is settled.',
  },
];

/** Trust level per domain — how far Farik may go in that area of the business. */
export const TRUST_DOMAINS = [
  { id: 'MAINTENANCE', label: 'Maintenance', enforced: true },
  { id: 'COMMUNICATION', label: 'Tenant messages', enforced: true },
  { id: 'RENT', label: 'Rent', enforced: false },
  { id: 'LEASE', label: 'Leases', enforced: false },
];

export const ENFORCED_RULES = RULES.filter((r) => r.enforced);
export const STORED_ONLY_RULES = RULES.filter((r) => !r.enforced);

/** Coerce a control's DOM value back to the type the backend expects. */
export function coerceRuleValue(rule, raw) {
  if (rule.control === 'switch') return !!raw;
  if (rule.control === 'currency' || rule.control === 'number' || rule.control === 'select') {
    if (rule.control === 'select' && typeof rule.options?.[0]?.value === 'string') return String(raw);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw;
}
