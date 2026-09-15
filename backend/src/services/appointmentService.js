const prisma = require('../lib/prisma');
const workflowEngine = require('./workflowEngine');
const escalationService = require('./escalationService');
const { getSmsProvider } = require('./sms/smsProvider');
const { canReceiveSms } = require('./sms/optOutGuard');
const { TRANSITIONS } = require('./workflows/maintenanceWorkflow');

async function loadContext(workflowId) {
  const workflow = await prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new Error(`MaintenanceWorkflow ${workflowId} not found`);
  const request = await prisma.maintenanceRequest.findUnique({
    where: { id: workflow.maintenanceRequestId },
    include: { tenant: true, unit: { include: { property: { include: { landlord: true } } } } },
  });
  return { workflow, request, landlordId: request.unit.property.landlord.id };
}

/**
 * Opens scheduling for a job a vendor has just accepted.
 *
 * The Appointment row is real either way — the vendor has genuinely committed to this
 * job — but the times may not be known yet:
 *
 *  - `proposedTimes` supplied: offer them to the tenant to pick from (the eventual
 *    steady state, once vendor availability is collected and parsed).
 *  - `proposedTimes` omitted: ask the vendor for two windows and tell the tenant a
 *    vendor is confirmed while we arrange a time. Nothing is invented — the row simply
 *    carries no times yet.
 */
async function proposeAppointment(workflowId, vendorId, proposedTimes = null) {
  const { workflow, request, landlordId } = await loadContext(workflowId);

  const appointment = await prisma.appointment.create({
    data: { maintenanceRequestId: workflow.maintenanceRequestId, vendorId, proposedTimes, status: 'PROPOSED' },
  });

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'APPOINTMENT_PROPOSED', transitions: TRANSITIONS,
    actorType: 'AI',
    reason: proposedTimes?.length
      ? 'Proposed appointment times to tenant'
      : 'Vendor accepted — requesting availability',
    persist: workflowEngine.maintenancePersist(workflowId),
  });

  await notifyAboutProposal({ request, workflowId, vendorId, proposedTimes });

  return appointment;
}

/**
 * Sends the SMS side of a proposal. Split out so the transition above stays the single
 * source of truth for state, and a messaging failure can never leave the workflow
 * claiming a proposal that was never transitioned.
 */
async function notifyAboutProposal({ request, workflowId, vendorId, proposedTimes }) {
  const provider = getSmsProvider();
  const hasTimes = Array.isArray(proposedTimes) && proposedTimes.length > 0;

  if (hasTimes) {
    if (canReceiveSms(request.tenant)) {
      const times = proposedTimes.map((t, i) => `${i + 1}. ${t}`).join('\n');
      await provider.sendSms({
        to: request.tenant.phone,
        body: `A vendor is available for "${request.title}":\n${times}\nReply with the number that works, and let us know if it's OK for them to enter if you're not home.`,
        tenantId: request.tenant.id, relatedWorkflowType: 'MAINTENANCE', relatedWorkflowId: workflowId,
      });
    }
    return;
  }

  // No times yet: ask the vendor for availability, and keep the tenant informed.
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (vendor?.phone) {
    await provider.sendSms({
      to: vendor.phone,
      body: `Thanks for accepting "${request.title}" at ${request.unit.name}, ${request.unit.property.name}. Reply with two time windows that would work for you.`,
      relatedWorkflowType: 'MAINTENANCE', relatedWorkflowId: workflowId,
    });
  }
  if (canReceiveSms(request.tenant)) {
    await provider.sendSms({
      to: request.tenant.phone,
      body: 'Good news — a contractor has accepted your repair. We are arranging a time now and will text you options shortly.',
      tenantId: request.tenant.id, relatedWorkflowType: 'MAINTENANCE', relatedWorkflowId: workflowId,
    });
  }
}

async function confirmAppointment(appointmentId, { scheduledStart, scheduledEnd, entryPermissionGranted }) {
  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'CONFIRMED', scheduledStart, scheduledEnd,
      notes: entryPermissionGranted != null ? `Entry permission: ${entryPermissionGranted ? 'granted' : 'NOT granted — tenant must be present'}` : undefined,
    },
  });

  const { workflow, landlordId } = await loadContext(await workflowIdForAppointment(appointment));
  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId: workflow.id,
    fromState: workflow.state, toState: 'APPOINTMENT_CONFIRMED', transitions: TRANSITIONS,
    actorType: 'TENANT', reason: 'Tenant confirmed appointment time', persist: workflowEngine.maintenancePersist(workflow.id),
  });

  return appointment;
}

async function workflowIdForAppointment(appointment) {
  const workflow = await prisma.maintenanceWorkflow.findUnique({ where: { maintenanceRequestId: appointment.maintenanceRequestId } });
  return workflow.id;
}

async function markInProgress(workflowId) {
  const { workflow, landlordId } = await loadContext(workflowId);
  return workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'WORK_IN_PROGRESS', transitions: TRANSITIONS,
    actorType: 'VENDOR', reason: 'Vendor began work', persist: workflowEngine.maintenancePersist(workflowId),
  });
}

async function markCompleted(workflowId, appointmentId) {
  const { workflow, landlordId } = await loadContext(workflowId);
  await prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } });
  return workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'WORK_COMPLETED_PENDING_INVOICE', transitions: TRANSITIONS,
    actorType: 'VENDOR', reason: 'Vendor marked work complete', persist: workflowEngine.maintenancePersist(workflowId),
  });
}

/**
 * No-show detected (vendor or tenant didn't show). Escalates for manual
 * rescheduling rather than silently retrying — a missed appointment needs
 * a human to re-coordinate availability.
 */
async function markNoShow(workflowId, appointmentId) {
  const { workflow, request, landlordId } = await loadContext(workflowId);
  await prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'NO_SHOW' } });

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'ESCALATED_MANUAL', transitions: TRANSITIONS,
    actorType: 'SYSTEM', reason: 'Appointment no-show', persist: workflowEngine.maintenancePersist(workflowId),
  });

  await escalationService.createEscalation({
    landlordId,
    actionType: 'MAINTENANCE_ESCALATION',
    summary: `Missed appointment for "${request.title}" — needs rescheduling`,
    details: { workflowId, appointmentId },
    entityType: 'maintenance',
    entityId: request.id,
  });
}

module.exports = { proposeAppointment, confirmAppointment, markInProgress, markCompleted, markNoShow };
