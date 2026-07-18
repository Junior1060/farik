const prisma = require('../../lib/prisma');

// Shared choke point both SMS adapters check before sending — covers every existing
// call site (maintenanceWorkflow.js, vendorDispatchService.js, appointmentService.js)
// without needing to touch each one individually.
async function isOptedOut(tenantId) {
  if (!tenantId) return false;
  const tenant = await prisma.tenantProfile.findUnique({ where: { id: tenantId }, select: { smsOptOutAt: true } });
  return Boolean(tenant?.smsOptOutAt);
}

module.exports = { isOptedOut };
