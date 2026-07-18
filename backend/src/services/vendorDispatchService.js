const prisma = require('../lib/prisma');
const workflowEngine = require('./workflowEngine');
const policyEngine = require('./policyEngine');
const escalationService = require('./escalationService');
const { getSmsProvider } = require('./sms/smsProvider');
const { TRANSITIONS } = require('./workflows/maintenanceWorkflow');

async function loadWorkflowContext(workflowId) {
  const workflow = await prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new Error(`MaintenanceWorkflow ${workflowId} not found`);
  const request = await prisma.maintenanceRequest.findUnique({
    where: { id: workflow.maintenanceRequestId },
    include: { tenant: true, unit: { include: { property: { include: { landlord: true } } } } },
  });
  return { workflow, request, landlordId: request.unit.property.landlord.id };
}

/**
 * Priority order: preferred vendors first, then fastest average response time,
 * excluding any vendor already contacted (accepted/declined/pending) for this workflow.
 */
async function selectEligibleVendor(landlordId, category, workflowId) {
  const alreadyAttempted = await prisma.vendorContactAttempt.findMany({
    where: { maintenanceWorkflowId: workflowId },
    select: { vendorId: true },
  });
  const excludeIds = alreadyAttempted.map((a) => a.vendorId);

  const candidates = await prisma.vendor.findMany({
    where: {
      landlordId,
      isActive: true,
      id: { notIn: excludeIds },
      specialty: { contains: category, mode: 'insensitive' },
    },
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
    const aResp = a.avgResponseMinutes ?? Infinity;
    const bResp = b.avgResponseMinutes ?? Infinity;
    return aResp - bResp;
  });

  return candidates[0];
}

/**
 * Selects the next eligible vendor and contacts them via SMS with a minimal,
 * tenant-privacy-respecting job summary (no tenant contact info shared).
 */
async function dispatchNextVendor(workflowId) {
  const { workflow, request, landlordId } = await loadWorkflowContext(workflowId);
  const category = workflow.category || 'GENERAL';
  const vendor = await selectEligibleVendor(landlordId, category, workflowId);

  if (!vendor) {
    await workflowEngine.transition({
      landlordId, workflowType: 'MAINTENANCE', workflowId,
      fromState: workflow.state, toState: 'ESCALATED_MANUAL', transitions: TRANSITIONS,
      actorType: 'SYSTEM', reason: 'No eligible vendor found for this category', persist: workflowEngine.maintenancePersist(workflowId),
    });
    await escalationService.createEscalation({
      landlordId,
      actionType: 'MAINTENANCE_ESCALATION',
      summary: `No vendor available for ${category.toLowerCase()} work at ${request.unit.name}, ${request.unit.property.name}`,
      details: { workflowId, category },
      entityType: 'maintenance',
      entityId: request.id,
    });
    return prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
  }

  if (workflow.state === 'APPROVED') {
    await workflowEngine.transition({
      landlordId, workflowType: 'MAINTENANCE', workflowId,
      fromState: 'APPROVED', toState: 'VENDOR_SELECTION', transitions: TRANSITIONS,
      actorType: 'AI', reason: `Selected vendor ${vendor.name}`, persist: workflowEngine.maintenancePersist(workflowId),
    });
  }

  const attemptNumber = (await prisma.vendorContactAttempt.count({ where: { maintenanceWorkflowId: workflowId } })) + 1;
  await prisma.vendorContactAttempt.create({
    data: { vendorId: vendor.id, maintenanceWorkflowId: workflowId, attemptNumber, status: 'SENT' },
  });

  const summary = `New job request: ${category.toLowerCase()} issue at ${request.unit.name}, ${request.unit.property.name}. `
    + `"${request.title}". Reply YES to accept or NO to decline.`;
  await getSmsProvider().sendSms({
    to: vendor.phone, body: summary, relatedWorkflowType: 'MAINTENANCE', relatedWorkflowId: workflowId,
  });

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: 'VENDOR_SELECTION', toState: 'VENDOR_CONTACT_ATTEMPTED', transitions: TRANSITIONS,
    actorType: 'AI', actorId: vendor.id, reason: `Contacted ${vendor.name} (attempt ${attemptNumber})`,
    persist: workflowEngine.maintenancePersist(workflowId),
  });

  return prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
}

/**
 * Records a vendor's SMS reply. Acceptance moves to VENDOR_CONFIRMED (appointment
 * scheduling picks up from there); decline retries the next eligible vendor.
 */
async function handleVendorResponse(workflowId, vendorId, accepted) {
  const { workflow, landlordId } = await loadWorkflowContext(workflowId);

  const attempt = await prisma.vendorContactAttempt.findFirst({
    where: { maintenanceWorkflowId: workflowId, vendorId, status: 'SENT' },
    orderBy: { attemptNumber: 'desc' },
  });
  if (attempt) {
    await prisma.vendorContactAttempt.update({
      where: { id: attempt.id },
      data: { status: accepted ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
    });
  }

  if (accepted) {
    return workflowEngine.transition({
      landlordId, workflowType: 'MAINTENANCE', workflowId,
      fromState: workflow.state, toState: 'VENDOR_CONFIRMED', transitions: TRANSITIONS,
      actorType: 'VENDOR', actorId: vendorId, reason: 'Vendor accepted the job', persist: workflowEngine.maintenancePersist(workflowId),
    });
  }

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'VENDOR_DECLINED', transitions: TRANSITIONS,
    actorType: 'VENDOR', actorId: vendorId, reason: 'Vendor declined the job', persist: workflowEngine.maintenancePersist(workflowId),
  });

  return retryOrEscalate(workflowId);
}

async function retryOrEscalate(workflowId) {
  const { workflow, request, landlordId } = await loadWorkflowContext(workflowId);
  const policy = await policyEngine.getEffectivePolicy(landlordId, request.unit.property.id, 'MAINTENANCE');
  const maxRetries = policy.settings.maxVendorRetries ?? 2;
  const attemptCount = await prisma.vendorContactAttempt.count({ where: { maintenanceWorkflowId: workflowId } });

  if (attemptCount > maxRetries) {
    await workflowEngine.transition({
      landlordId, workflowType: 'MAINTENANCE', workflowId,
      fromState: workflow.state, toState: 'ESCALATED_MANUAL', transitions: TRANSITIONS,
      actorType: 'SYSTEM', reason: `Exceeded max vendor retries (${maxRetries})`, persist: workflowEngine.maintenancePersist(workflowId),
    });
    await escalationService.createEscalation({
      landlordId,
      actionType: 'MAINTENANCE_ESCALATION',
      summary: `No vendor accepted after ${attemptCount} attempts — needs manual coordination`,
      details: { workflowId },
      entityType: 'maintenance',
      entityId: request.id,
    });
    return prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
  }

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'VENDOR_SELECTION', transitions: TRANSITIONS,
    actorType: 'SYSTEM', reason: 'Retrying with next eligible vendor', persist: workflowEngine.maintenancePersist(workflowId),
  });

  return dispatchNextVendor(workflowId);
}

/**
 * Cron hook: finds vendor contact attempts that have gone unanswered past the
 * landlord's configured follow-up interval and retries/escalates.
 */
async function checkVendorTimeouts() {
  const staleAttempts = await prisma.vendorContactAttempt.findMany({
    where: { status: 'SENT' },
    orderBy: { sentAt: 'asc' },
  });

  for (const attempt of staleAttempts) {
    const { workflow, request, landlordId } = await loadWorkflowContext(attempt.maintenanceWorkflowId).catch(() => ({}));
    if (!workflow) continue;
    const policy = await policyEngine.getEffectivePolicy(landlordId, request.unit.property.id, 'MAINTENANCE');
    const followUpHours = policy.settings.followUpIntervalHours ?? 24;
    const hoursSinceSent = (Date.now() - new Date(attempt.sentAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceSent < followUpHours) continue;

    await prisma.vendorContactAttempt.update({ where: { id: attempt.id }, data: { status: 'NO_RESPONSE' } });
    if (workflow.state === 'VENDOR_CONTACT_ATTEMPTED') {
      await workflowEngine.transition({
        landlordId, workflowType: 'MAINTENANCE', workflowId: attempt.maintenanceWorkflowId,
        fromState: 'VENDOR_CONTACT_ATTEMPTED', toState: 'VENDOR_CONTACT_FAILED', transitions: TRANSITIONS,
        actorType: 'SYSTEM', reason: `No vendor response after ${followUpHours}h`,
        persist: workflowEngine.maintenancePersist(attempt.maintenanceWorkflowId),
      });
      await retryOrEscalate(attempt.maintenanceWorkflowId);
    }
  }
}

module.exports = { selectEligibleVendor, dispatchNextVendor, handleVendorResponse, retryOrEscalate, checkVendorTimeouts };
