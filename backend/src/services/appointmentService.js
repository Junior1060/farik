const prisma = require('../lib/prisma');
const workflowEngine = require('./workflowEngine');
const escalationService = require('./escalationService');
const { getSmsProvider } = require('./sms/smsProvider');
const { TRANSITIONS } = require('./workflows/maintenanceWorkflow');

async function persistState(workflowId) {
  return (toState) => prisma.maintenanceWorkflow.update({ where: { id: workflowId }, data: { state: toState } });
}

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
 * Creates a proposed appointment and asks the tenant to confirm a time + entry permission.
 */
async function proposeAppointment(workflowId, vendorId, proposedTimes) {
  const { workflow, request, landlordId } = await loadContext(workflowId);

  const appointment = await prisma.appointment.create({
    data: { maintenanceRequestId: workflow.maintenanceRequestId, vendorId, proposedTimes, status: 'PROPOSED' },
  });

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'APPOINTMENT_PROPOSED', transitions: TRANSITIONS,
    actorType: 'AI', reason: 'Proposed appointment times to tenant', persist: await persistState(workflowId),
  });

  if (request.tenant.phone && request.tenant.smsConsent) {
    const times = (proposedTimes || []).join(', ');
    await getSmsProvider().sendSms({
      to: request.tenant.phone,
      body: `A vendor is available: ${times}. Reply with your preferred time, and let us know if it's OK for them to enter if you're not home.`,
      tenantId: request.tenant.id, relatedWorkflowType: 'MAINTENANCE', relatedWorkflowId: workflowId,
    });
  }

  return appointment;
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
    actorType: 'TENANT', reason: 'Tenant confirmed appointment time', persist: await persistState(workflow.id),
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
    actorType: 'VENDOR', reason: 'Vendor began work', persist: await persistState(workflowId),
  });
}

async function markCompleted(workflowId, appointmentId) {
  const { workflow, landlordId } = await loadContext(workflowId);
  await prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } });
  return workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'WORK_COMPLETED_PENDING_INVOICE', transitions: TRANSITIONS,
    actorType: 'VENDOR', reason: 'Vendor marked work complete', persist: await persistState(workflowId),
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
    actorType: 'SYSTEM', reason: 'Appointment no-show', persist: await persistState(workflowId),
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
