// Hardcoded fallback used only when a landlord has neither an org-level default
// nor a property-level override for a domain (e.g. brand-new landlord accounts).
// Chosen to match Farik's pre-policy-engine behavior: agent acts automatically
// within reasonable bounds, but nothing legal/high-cost ever bypasses approval.
const FALLBACK_POLICY = {
  MAINTENANCE: {
    trustLevel: 'OPERATE_WITHIN_POLICY',
    settings: {
      maxAutoSpend: 500,
      requireTenantEntryPermission: true,
      allowAutoScheduling: true,
      maxVendorRetries: 2,
      followUpIntervalHours: 24,
    },
  },
  RENT: {
    trustLevel: 'OPERATE_WITHIN_POLICY',
    settings: {
      gracePeriodDays: 0,
      firstReminderOffsetDays: -3,
      secondReminderOffsetDays: -1,
      finalReminderOffsetDays: -3,
      landlordEscalationOffsetDays: -7,
      allowAutomaticReminders: true,
      allowPartialPayments: true,
    },
  },
  LEASE: {
    trustLevel: 'DRAFT',
    settings: {
      renewalWindowStartDays: 90,
      renewalWindowEndDays: 85,
      requireApprovalForRenewalOffer: true,
      requireApprovalForRentChange: true,
    },
  },
  COMMUNICATION: {
    trustLevel: 'DRAFT',
    settings: {
      smsEnabled: false,
      emailEnabled: true,
      portalMessagingEnabled: true,
      quietHoursStart: '21:00',
      quietHoursEnd: '08:00',
      tone: 'professional',
    },
  },
};

// Legal/eviction and rent-increase actions are NEVER auto-executable at any trust
// level — enforced in code (workflow modules), not something settings can weaken.
const HARD_SAFETY_RULES = Object.freeze({
  neverAutoIssueLegalNotice: true,
  neverAutoApplyRentIncrease: true,
  neverAutoPayVendor: true,
});

module.exports = { FALLBACK_POLICY, HARD_SAFETY_RULES };
