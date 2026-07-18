const prisma = require('../lib/prisma');

/**
 * Validates and records a workflow state transition, and (via the caller-supplied
 * persist function) applies it to the domain's own table (e.g. MaintenanceWorkflow.state).
 * Every transition is timestamped, actor-attributed, and reason-recorded in WorkflowEvent —
 * this is the audit trail the Approval Centre / timeline (later phases) reads from.
 *
 * The persist step + audit-log write happen atomically: if no `tx` is supplied, this
 * function opens its own `prisma.$transaction`; if a `tx` is supplied (e.g. a caller
 * that also needs to write a related row, like invoiceController approving an invoice
 * alongside the transition), that transaction is reused instead so both writes commit
 * or roll back together.
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
 * @param {(fromState: string|null, toState: string, tx: object) => Promise<any>} params.persist
 *   Applies toState to the domain table, guarded against concurrent modification
 *   (see `maintenancePersist` below), using the given Prisma transaction client.
 * @param {object} [params.tx] - an existing Prisma transaction client to reuse instead
 *   of opening a new one.
 */
async function transition({
  landlordId, workflowType, workflowId, fromState, toState, transitions,
  actorType, actorId, reason, metadata, persist, tx,
}) {
  const allowed = transitions[fromState] || [];
  if (fromState !== null && !allowed.includes(toState)) {
    throw new InvalidTransitionError(workflowType, fromState, toState);
  }

  const run = async (client) => {
    const result = await persist(fromState, toState, client);
    await client.workflowEvent.create({
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
  };

  if (tx) return run(tx);
  return prisma.$transaction((innerTx) => run(innerTx));
}

/**
 * Returns a `persist` function for MaintenanceWorkflow transitions with an optimistic-
 * concurrency guard: the UPDATE only applies `WHERE id = workflowId AND state = fromState`,
 * so if another process already moved the workflow off `fromState` (a race between, say,
 * a duplicate webhook delivery and the vendor-timeout cron), this throws instead of
 * silently overwriting a state neither caller actually observed.
 */
function maintenancePersist(workflowId) {
  return async (fromState, toState, client) => {
    const db = client || prisma;
    // fromState is null only for a workflow's very first transition, right after its
    // row was created in the same request — there's no prior state to guard against,
    // and since `state` is a required non-null column, `WHERE state = NULL` would
    // never match in SQL (NULL is never equal to NULL), so the guard is skipped here.
    const where = fromState === null ? { id: workflowId } : { id: workflowId, state: fromState };
    const result = await db.maintenanceWorkflow.updateMany({ where, data: { state: toState } });
    if (result.count === 0) {
      throw new ConcurrentModificationError('MaintenanceWorkflow', workflowId, fromState, toState);
    }
    return result;
  };
}

class InvalidTransitionError extends Error {
  constructor(workflowType, fromState, toState) {
    super(`Invalid ${workflowType} workflow transition: ${fromState} -> ${toState}`);
    this.name = 'InvalidTransitionError';
    this.fromState = fromState;
    this.toState = toState;
  }
}

class ConcurrentModificationError extends Error {
  constructor(model, id, fromState, toState) {
    super(`${model} ${id} was not in expected state "${fromState}" when transitioning to "${toState}" — likely a concurrent update`);
    this.name = 'ConcurrentModificationError';
    this.model = model;
    this.id = id;
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

module.exports = {
  transition,
  getWorkflowHistory,
  maintenancePersist,
  InvalidTransitionError,
  ConcurrentModificationError,
};
