const prisma = require('../lib/prisma');

/**
 * Validates and records a workflow state transition, and (via the caller-supplied
 * persist function) applies it to the domain's own table (e.g. MaintenanceWorkflow.state).
 * Every transition is timestamped, actor-attributed, and reason-recorded in WorkflowEvent —
 * this is the audit trail the Approval Centre / timeline (later phases) reads from.
 *
 * @param {object} params
 * @param {string} params.landlordId
 * @param {'MAINTENANCE'|'RENT'|'LEASE'} params.workflowType
 * @param {string} params.workflowId
 * @param {string|null} params.fromState
 * @param {string} params.toState
 * @param {Record<string, string[]>} params.transitions - adjacency map of allowed fromState -> [toState,...]
 * @param {'AI'|'LANDLORD'|'TENANT'|'VENDOR'|'SYSTEM'} params.actorType
 * @param {string} [params.actorId]
 * @param {string} [params.reason]
 * @param {object} [params.metadata]
 * @param {(toState: string) => Promise<any>} params.persist - applies toState to the domain table
 */
async function transition({
  landlordId, workflowType, workflowId, fromState, toState, transitions,
  actorType, actorId, reason, metadata, persist,
}) {
  const allowed = transitions[fromState] || [];
  if (fromState !== null && !allowed.includes(toState)) {
    throw new InvalidTransitionError(workflowType, fromState, toState);
  }

  const result = await persist(toState);

  await prisma.workflowEvent.create({
    data: {
      landlordId,
      workflowType,
      workflowId,
      fromState,
      toState,
      actorType,
      actorId: actorId || null,
      reason: reason || null,
      metadata: metadata || undefined,
    },
  });

  return result;
}

class InvalidTransitionError extends Error {
  constructor(workflowType, fromState, toState) {
    super(`Invalid ${workflowType} workflow transition: ${fromState} -> ${toState}`);
    this.name = 'InvalidTransitionError';
    this.fromState = fromState;
    this.toState = toState;
  }
}

async function getWorkflowHistory(workflowType, workflowId) {
  return prisma.workflowEvent.findMany({
    where: { workflowType, workflowId },
    orderBy: { createdAt: 'asc' },
  });
}

module.exports = { transition, getWorkflowHistory, InvalidTransitionError };
