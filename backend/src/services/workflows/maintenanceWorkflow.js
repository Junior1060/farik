const prisma = require('../../lib/prisma');
const workflowEngine = require('../workflowEngine');
const policyEngine = require('../policyEngine');
const escalationService = require('../escalationService');
const diagnostics = require('../maintenanceDiagnostics');
const { getSmsProvider } = require('../sms/smsProvider');
const { callAndValidate, AiValidationError } = require('../ai/validate');
const { maintenanceTriageSchema } = require('../ai/schemas');

// Adjacency map of allowed transitions. Not every reachable state is wired to a
// service function yet (appointment reschedule/no-show land in a later phase),
// but the graph is complete so workflowEngine can validate any future transition.
const TRANSITIONS = {
  INTAKE_RECEIVED: ['DIAGNOSTIC_QUESTIONS_SENT', 'EMERGENCY_ESCALATED'],
  DIAGNOSTIC_QUESTIONS_SENT: ['DIAGNOSTIC_RESPONSE_RECEIVED', 'EMERGENCY_ESCALATED', 'CANCELLED'],
  DIAGNOSTIC_RESPONSE_RECEIVED: ['TRIAGED', 'EMERGENCY_ESCALATED', 'ESCALATED_MANUAL'],
  TRIAGED: ['AWAITING_LANDLORD_APPROVAL', 'APPROVED', 'ESCALATED_MANUAL'],
  EMERGENCY_ESCALATED: ['ESCALATED_MANUAL', 'RESOLVED', 'CANCELLED'],
  AWAITING_LANDLORD_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['VENDOR_SELECTION', 'CANCELLED', 'ESCALATED_MANUAL'],
  VENDOR_SELECTION: ['VENDOR_CONTACT_ATTEMPTED', 'ESCALATED_MANUAL'],
  VENDOR_CONTACT_ATTEMPTED: ['VENDOR_CONFIRMED', 'VENDOR_DECLINED', 'VENDOR_CONTACT_FAILED'],
  VENDOR_CONTACT_FAILED: ['VENDOR_SELECTION', 'ESCALATED_MANUAL'],
  VENDOR_DECLINED: ['VENDOR_SELECTION', 'ESCALATED_MANUAL'],
  VENDOR_CONFIRMED: ['APPOINTMENT_PROPOSED'],
  APPOINTMENT_PROPOSED: ['APPOINTMENT_CONFIRMED', 'APPOINTMENT_RESCHEDULED', 'ESCALATED_MANUAL'],
  APPOINTMENT_CONFIRMED: ['WORK_IN_PROGRESS', 'APPOINTMENT_RESCHEDULED', 'ESCALATED_MANUAL'],
  APPOINTMENT_RESCHEDULED: ['APPOINTMENT_CONFIRMED', 'ESCALATED_MANUAL'],
  WORK_IN_PROGRESS: ['WORK_COMPLETED_PENDING_INVOICE', 'ESCALATED_MANUAL'],
  WORK_COMPLETED_PENDING_INVOICE: ['INVOICE_RECEIVED', 'RESOLVED'],
  INVOICE_RECEIVED: ['INVOICE_EXTRACTED'],
  INVOICE_EXTRACTED: ['INVOICE_APPROVED', 'INVOICE_DISPUTED'],
  INVOICE_APPROVED: ['RESOLVED'],
  INVOICE_DISPUTED: ['ESCALATED_MANUAL', 'INVOICE_APPROVED'],
  RESOLVED: [],
  CANCELLED: [],
  ESCALATED_MANUAL: ['RESOLVED', 'CANCELLED'],
};

async function persistState(workflowId) {
  return (toState) => prisma.maintenanceWorkflow.update({ where: { id: workflowId }, data: { state: toState } });
}

async function loadContext(maintenanceRequestId) {
  const request = await prisma.maintenanceRequest.findUnique({
    where: { id: maintenanceRequestId },
    include: { tenant: true, unit: { include: { property: { include: { landlord: true } } } }, workflow: true },
  });
  if (!request) throw new Error(`MaintenanceRequest ${maintenanceRequestId} not found`);
  return request;
}

/**
 * Called on intake (SMS or portal). Runs deterministic classification + emergency
 * detection BEFORE anything else. Emergencies are escalated immediately and never
 * routed through diagnostic Q&A or AI triage.
 */
async function startWorkflow(maintenanceRequestId) {
  const request = await loadContext(maintenanceRequestId);
  const landlordId = request.unit.property.landlord.id;
  const category = diagnostics.classifyCategory(request.title, request.description);
  const { isEmergency, matchedRules } = diagnostics.detectEmergency({ title: request.title, description: request.description });

  const workflow = await prisma.maintenanceWorkflow.create({
    data: { maintenanceRequestId, state: 'INTAKE_RECEIVED', category, isEmergency },
  });

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId: workflow.id,
    fromState: null, toState: 'INTAKE_RECEIVED', transitions: TRANSITIONS,
    actorType: 'SYSTEM', reason: 'Maintenance request received', persist: async () => workflow,
  });

  if (isEmergency) {
    await escalateEmergency(workflow.id, landlordId, request, matchedRules);
    return prisma.maintenanceWorkflow.findUnique({ where: { id: workflow.id } });
  }

  await sendDiagnosticQuestions(workflow.id, landlordId, request, category);
  return prisma.maintenanceWorkflow.findUnique({ where: { id: workflow.id } });
}

async function escalateEmergency(workflowId, landlordId, request, matchedRules) {
  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: 'INTAKE_RECEIVED', toState: 'EMERGENCY_ESCALATED', transitions: TRANSITIONS,
    actorType: 'SYSTEM', reason: `Deterministic emergency rule(s) matched: ${matchedRules.join(', ')}`,
    metadata: { matchedRules }, persist: await persistState(workflowId),
  });

  const safetyMessage = 'This sounds like it could be dangerous. Please move to a safe location now. '
    + 'If you or anyone is in immediate danger, call 911 or your local emergency number right away. '
    + 'We have alerted your landlord immediately.';

  if (request.tenant.phone && request.tenant.smsConsent) {
    await getSmsProvider().sendSms({
      to: request.tenant.phone, body: safetyMessage, tenantId: request.tenant.id,
      relatedWorkflowType: 'MAINTENANCE', relatedWorkflowId: workflowId,
    });
  }

  await escalationService.createEscalation({
    landlordId,
    actionType: 'MAINTENANCE_ESCALATION',
    summary: `EMERGENCY reported by ${request.tenant.firstName} ${request.tenant.lastName}: "${request.title}"`,
    details: {
      matchedRules,
      title: request.title,
      description: request.description,
      tenantName: `${request.tenant.firstName} ${request.tenant.lastName}`,
      workflowId,
    },
    entityType: 'maintenance',
    entityId: request.id,
  });
}

async function sendDiagnosticQuestions(workflowId, landlordId, request, category) {
  const questions = diagnostics.getDiagnosticQuestions(category).slice(0, 3);

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: 'INTAKE_RECEIVED', toState: 'DIAGNOSTIC_QUESTIONS_SENT', transitions: TRANSITIONS,
    actorType: 'AI', reason: `Sent ${questions.length} diagnostic question(s) for category ${category}`,
    metadata: { questions: questions.map((q) => q.key) }, persist: await persistState(workflowId),
  });

  if (request.tenant.phone && request.tenant.smsConsent) {
    const body = `Thanks for reporting this. A couple quick questions so we can help fast:\n`
      + questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
    await getSmsProvider().sendSms({
      to: request.tenant.phone, body, tenantId: request.tenant.id,
      relatedWorkflowType: 'MAINTENANCE', relatedWorkflowId: workflowId,
    });
  }
}

/**
 * Records a tenant's reply to diagnostic questions (from SMS or portal), re-runs
 * the deterministic emergency check against the combined text (a reply can reveal
 * an emergency the original report didn't), then proceeds to AI triage.
 */
async function recordTenantReply(workflowId, replyText) {
  const workflow = await prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new Error(`MaintenanceWorkflow ${workflowId} not found`);
  const request = await loadContext(workflow.maintenanceRequestId);
  const landlordId = request.unit.property.landlord.id;

  const priorReplies = workflow.diagnosticAnswers?.rawReplies || [];
  const combinedText = `${request.description} ${[...priorReplies, replyText].join(' ')}`;
  const { isEmergency, matchedRules } = diagnostics.detectEmergency({ title: request.title, description: combinedText });

  await prisma.maintenanceWorkflow.update({
    where: { id: workflowId },
    data: { diagnosticAnswers: { rawReplies: [...priorReplies, replyText] } },
  });

  if (isEmergency && workflow.state !== 'EMERGENCY_ESCALATED') {
    await workflowEngine.transition({
      landlordId, workflowType: 'MAINTENANCE', workflowId,
      fromState: workflow.state, toState: 'EMERGENCY_ESCALATED', transitions: TRANSITIONS,
      actorType: 'SYSTEM', reason: `Tenant reply revealed emergency indicator(s): ${matchedRules.join(', ')}`,
      metadata: { matchedRules }, persist: await persistState(workflowId),
    });
    await escalateEmergency(workflowId, landlordId, request, matchedRules);
    return prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
  }

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'DIAGNOSTIC_RESPONSE_RECEIVED', transitions: TRANSITIONS,
    actorType: 'TENANT', reason: 'Tenant answered diagnostic questions', persist: await persistState(workflowId),
  });

  return triageAndProceed(workflowId);
}

async function triageWithAi(request, workflow) {
  const answers = (workflow.diagnosticAnswers?.rawReplies || []).join(' ');
  return callAndValidate(
    {
      system: 'You are Farik AI, a property maintenance triage assistant. Always respond with valid JSON only.',
      maxTokens: 512,
      messages: [{
        role: 'user',
        content: `Triage this maintenance request.

Title: "${request.title}"
Description: "${request.description}"
Tenant follow-up answers: "${answers}"
Category (pre-classified): ${workflow.category}

Return JSON:
{
  "urgency": "EMERGENCY" | "HIGH" | "ROUTINE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "category": "plumbing" | "electrical" | "hvac" | "structural" | "appliance" | "general",
  "priority": "HIGH" | "MEDIUM" | "LOW",
  "estimatedCostMin": number or null,
  "estimatedCostMax": number or null,
  "summary": "one-line summary of what needs to be done",
  "reasoning": "why this urgency level"
}`,
      }],
    },
    maintenanceTriageSchema,
  );
}

/**
 * Runs AI triage, applies the landlord's maintenance policy, and either auto-approves
 * (policy allows + confident + within spend limit) or routes to landlord approval.
 */
async function triageAndProceed(workflowId) {
  const workflow = await prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
  const request = await loadContext(workflow.maintenanceRequestId);
  const landlordId = request.unit.property.landlord.id;
  const propertyId = request.unit.property.id;

  let result;
  try {
    result = await triageWithAi(request, workflow);
  } catch (err) {
    if (err instanceof AiValidationError) {
      await workflowEngine.transition({
        landlordId, workflowType: 'MAINTENANCE', workflowId,
        fromState: workflow.state, toState: 'ESCALATED_MANUAL', transitions: TRANSITIONS,
        actorType: 'SYSTEM', reason: 'AI triage failed schema validation; needs manual review',
        metadata: { aiIssues: err.issues }, persist: await persistState(workflowId),
      });
      await escalationService.createEscalation({
        landlordId,
        actionType: 'MAINTENANCE_ESCALATION',
        summary: `Maintenance request needs manual review (AI could not triage it reliably): "${request.title}"`,
        details: { title: request.title, aiIssues: err.issues, workflowId },
        entityType: 'maintenance',
        entityId: request.id,
      });
      return prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
    }
    throw err;
  }

  const policy = await policyEngine.getEffectivePolicy(landlordId, propertyId, 'MAINTENANCE');
  const autoAllowed = policyEngine.canActWithoutApproval(policy.trustLevel);
  const maxAutoSpend = policy.settings.maxAutoSpend ?? 500;
  const estimatedMax = result.estimatedCostMax || 0;
  const withinBudget = estimatedMax <= maxAutoSpend;
  const confidentEnough = result.confidence === 'HIGH' || result.urgency === 'EMERGENCY';
  const canAutoApprove = autoAllowed && confidentEnough && withinBudget;

  await prisma.maintenanceWorkflow.update({
    where: { id: workflowId },
    data: { urgency: result.urgency, policySnapshot: policy },
  });
  await prisma.maintenanceRequest.update({ where: { id: request.id }, data: { priority: result.priority } });

  await workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'TRIAGED', transitions: TRANSITIONS,
    actorType: 'AI', reason: result.reasoning, metadata: { result }, persist: await persistState(workflowId),
  });

  if (canAutoApprove) {
    await workflowEngine.transition({
      landlordId, workflowType: 'MAINTENANCE', workflowId,
      fromState: 'TRIAGED', toState: 'APPROVED', transitions: TRANSITIONS,
      actorType: 'AI', reason: `Within policy: ${policy.trustLevel}, confidence ${result.confidence}, est. $${estimatedMax} <= limit $${maxAutoSpend}`,
      persist: await persistState(workflowId),
    });
  } else {
    await workflowEngine.transition({
      landlordId, workflowType: 'MAINTENANCE', workflowId,
      fromState: 'TRIAGED', toState: 'AWAITING_LANDLORD_APPROVAL', transitions: TRANSITIONS,
      actorType: 'AI', reason: withinBudget ? 'Policy requires landlord approval' : `Estimated cost $${estimatedMax} exceeds auto-approve limit $${maxAutoSpend}`,
      persist: await persistState(workflowId),
    });
    await escalationService.createEscalation({
      landlordId,
      actionType: 'MAINTENANCE_ESCALATION',
      summary: `Approval needed: ${result.summary} (est. $${result.estimatedCostMin}–$${result.estimatedCostMax})`,
      details: {
        workflowId, category: result.category, urgency: result.urgency,
        estimatedCostMin: result.estimatedCostMin, estimatedCostMax: result.estimatedCostMax,
        tenantName: `${request.tenant.firstName} ${request.tenant.lastName}`,
      },
      entityType: 'maintenance',
      entityId: request.id,
    });
  }

  return prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
}

/**
 * Landlord approves a workflow sitting in AWAITING_LANDLORD_APPROVAL.
 * Hands off to vendor dispatch (built separately) once approved.
 */
async function approveByLandlord(workflowId, userId) {
  const workflow = await prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
  const request = await loadContext(workflow.maintenanceRequestId);
  const landlordId = request.unit.property.landlord.id;

  return workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'APPROVED', transitions: TRANSITIONS,
    actorType: 'LANDLORD', actorId: userId, reason: 'Landlord approved', persist: await persistState(workflowId),
  });
}

async function cancel(workflowId, { actorType, actorId, reason }) {
  const workflow = await prisma.maintenanceWorkflow.findUnique({ where: { id: workflowId } });
  const request = await loadContext(workflow.maintenanceRequestId);
  const landlordId = request.unit.property.landlord.id;

  return workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId,
    fromState: workflow.state, toState: 'CANCELLED', transitions: TRANSITIONS,
    actorType, actorId, reason, persist: await persistState(workflowId),
  });
}

module.exports = {
  TRANSITIONS,
  startWorkflow,
  recordTenantReply,
  triageAndProceed,
  approveByLandlord,
  cancel,
};
