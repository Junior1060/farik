const prisma = require('../../lib/prisma');

// Shared choke point both SMS adapters check before sending — covers every existing
// call site (maintenanceWorkflow.js, vendorDispatchService.js, appointmentService.js)
// without needing to touch each one individually.
async function isOptedOut(tenantId) {
  if (!tenantId) return false;
  const tenant = await prisma.tenantProfile.findUnique({ where: { id: tenantId }, select: { smsOptOutAt: true } });
  return Boolean(tenant?.smsOptOutAt);
}

/**
 * Pure predicate over an already-loaded TenantProfile: can we hold a two-way SMS
 * conversation with this tenant right now?
 *
 * `isOptedOut` above stops an individual send; this answers the earlier *routing*
 * question — whether a workflow may depend on the tenant replying at all. A tenant
 * with no number, no consent, or an active opt-out can never answer diagnostic
 * questions, so the workflow must not park itself waiting for one.
 */
function canReceiveSms(tenant) {
  return Boolean(tenant?.phone && tenant.smsConsent && !tenant.smsOptOutAt);
}

module.exports = { isOptedOut, canReceiveSms };
