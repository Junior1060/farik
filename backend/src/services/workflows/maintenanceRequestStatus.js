// The single mapping from MaintenanceWorkflow.state -> MaintenanceRequest.status.
//
// These are two views of one repair, and they used to drift: request.status was only
// ever written by the landlord's manual dropdown, so a workflow could reach RESOLVED
// while its request sat OPEN and kept inflating the dashboard's open count.
//
// This module deliberately has no imports. workflowEngine consumes it from inside
// maintenancePersist (the one code path every maintenance transition goes through),
// and maintenanceWorkflow already imports workflowEngine — so keeping the table here
// rather than alongside TRANSITIONS avoids a require cycle.

const OPEN = [
  // Nothing has been committed yet, or a human has the ball back.
  'INTAKE_RECEIVED',
  'DIAGNOSTIC_QUESTIONS_SENT',
  'DIAGNOSTIC_RESPONSE_RECEIVED',
  'TRIAGED',
  'AWAITING_LANDLORD_APPROVAL',
  // Both escalations mean Farik has stopped and is waiting on a person. They belong in
  // the landlord's "needs attention" count, not buried among jobs already under way.
  'EMERGENCY_ESCALATED',
  'ESCALATED_MANUAL',
];

const IN_PROGRESS = [
  // From approval onward the repair is genuinely being worked: a vendor is being found,
  // has been contacted, is scheduled, is on site, or has billed.
  'APPROVED',
  'VENDOR_SELECTION',
  'VENDOR_CONTACT_ATTEMPTED',
  'VENDOR_CONTACT_FAILED',
  'VENDOR_DECLINED',
  'VENDOR_CONFIRMED',
  'APPOINTMENT_PROPOSED',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_RESCHEDULED',
  'WORK_IN_PROGRESS',
  'WORK_COMPLETED_PENDING_INVOICE',
  'INVOICE_RECEIVED',
  'INVOICE_EXTRACTED',
  'INVOICE_APPROVED',
  'INVOICE_DISPUTED',
];

const WORKFLOW_STATE_TO_REQUEST_STATUS = Object.freeze({
  ...Object.fromEntries(OPEN.map((s) => [s, 'OPEN'])),
  ...Object.fromEntries(IN_PROGRESS.map((s) => [s, 'IN_PROGRESS'])),
  RESOLVED: 'RESOLVED',
  // A cancelled repair and a completed one are not the same outcome and must stay
  // distinguishable for the life of the record — CANCELLED is never folded into RESOLVED.
  CANCELLED: 'CANCELLED',
});

/** Returns the request status for a workflow state, or null for an unmapped state. */
function requestStatusForWorkflowState(state) {
  return WORKFLOW_STATE_TO_REQUEST_STATUS[state] || null;
}

module.exports = { WORKFLOW_STATE_TO_REQUEST_STATUS, requestStatusForWorkflowState };
