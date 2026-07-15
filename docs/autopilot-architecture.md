# Autopilot Architecture

## Layers

Autopilot is not one prompt — it's a pipeline of small, independently testable
layers. Each layer is a real file, not a conceptual grouping:

| Layer | File | What it does |
|---|---|---|
| AI provider abstraction | `backend/src/services/ai/aiClient.js` | Single Anthropic client, retry/backoff, timeouts, mock mode for tests/dev |
| Output schemas | `backend/src/services/ai/schemas.js` | zod contracts for every AI JSON response |
| Validate + retry | `backend/src/services/ai/validate.js` | Parses AI output, validates against schema, retries once, throws `AiValidationError` on failure |
| Deterministic safety | `backend/src/services/maintenanceDiagnostics.js` | Emergency keyword rules + category classification — runs before any AI call |
| Policy evaluation | `backend/src/services/policyEngine.js` | Resolves `(landlordId, propertyId, domain)` → trust level + settings |
| Workflow engine | `backend/src/services/workflowEngine.js` | Validates state transitions, writes `WorkflowEvent` audit rows |
| Domain workflows | `backend/src/services/workflows/maintenanceWorkflow.js` | The actual state machine: intake → diagnostics → triage → approval → dispatch → resolution |
| Action execution | `vendorDispatchService.js`, `appointmentService.js`, existing controllers | Called *by* the workflow, never directly by AI output |
| Follow-up scheduling | `backend/src/services/schedulerService.js` | node-cron jobs (rent reminders, lease renewal, escalation reminders, vendor timeouts) |
| Audit | `AgentLog` (existing) + `WorkflowEvent` (new) | Immutable-style event log |
| Approval | `escalationService.createEscalation()` | Writes `AgentLog(ESCALATED)` + notification + email |

**Why this matters**: AI output only ever selects a validated action; it never
writes to the database or calls another service directly. A model that returns
malformed JSON, an unexpected enum value, or a wildly out-of-range number gets
caught by `callAndValidate` and routed to manual review — it can't skip a step
or execute silently.

## The maintenance workflow state machine

23 states (`MaintenanceWorkflowState` in `backend/prisma/schema.prisma`), full
adjacency map in `TRANSITIONS` at the top of `maintenanceWorkflow.js`. Every
transition goes through `workflowEngine.transition()`, which:

1. Checks the transition is legal for the workflow's current state (throws
   `InvalidTransitionError` otherwise — a real bug this pass's tests caught
   twice during development).
2. Calls the caller-supplied `persist()` function to update `MaintenanceWorkflow.state`.
3. Writes a `WorkflowEvent` row (landlord, workflow, from/to state, actor type
   and id, reason, metadata, timestamp).

```
INTAKE_RECEIVED → DIAGNOSTIC_QUESTIONS_SENT → DIAGNOSTIC_RESPONSE_RECEIVED → TRIAGED
                                                                                │
                              ┌─────────────────────────────────────────────────┤
                              ▼                                                 ▼
                    AWAITING_LANDLORD_APPROVAL                              APPROVED
                              │                                                 │
                              └──────────────────► APPROVED ◄───────────────────┘
                                                       │
                                              VENDOR_SELECTION → VENDOR_CONTACT_ATTEMPTED
                                                       │                    │
                                          (declined/timeout, retry) ◄───────┤
                                                                            ▼
                                                              VENDOR_CONFIRMED
                                                                            │
                                                          APPOINTMENT_PROPOSED → APPOINTMENT_CONFIRMED
                                                                                          │
                                                                              WORK_IN_PROGRESS
                                                                                          │
                                                                  WORK_COMPLETED_PENDING_INVOICE
                                                                                          │
                                                      INVOICE_RECEIVED → INVOICE_EXTRACTED → INVOICE_APPROVED → RESOLVED

Any state can also reach EMERGENCY_ESCALATED, ESCALATED_MANUAL, or CANCELLED.
```

Emergency detection re-runs on every tenant reply (`recordTenantReply`), not
just at intake — a follow-up message ("actually I smell gas now") can reveal
danger the original report didn't, and the deterministic check catches it
regardless of what the AI concludes.

## Reused patterns from the existing codebase

- `escalationService.createEscalation()` (pre-existing) is still the single
  factory for anything needing landlord attention — `AgentLog(ESCALATED)` +
  in-app `Notification` + email. New workflow code calls it directly rather
  than reinventing escalation.
- Multer disk-storage pattern for invoice uploads mirrors the existing
  maintenance-photo upload exactly (`backend/uploads/invoices/`, same
  size/type limits, same unauthenticated static serving — a known limitation
  carried forward, not solved this pass).
- The Stripe webhook's raw-body-before-`express.json()` pattern in
  `backend/src/server.js` was replicated for the Twilio SMS webhook.
