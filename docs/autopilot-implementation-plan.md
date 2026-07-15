# Farik Autopilot — Implementation Plan

## Context

Farik's Autopilot began as a per-landlord on/off switch (`AgentConfig`) driving three
Claude-powered behaviors in `backend/src/services/agentService.js`: tenant message
triage, maintenance triage, and cron-driven rent/lease reminders. This plan turns
that into a policy-governed AI operations agent: tenants text, Farik gathers
information, triages safely with deterministic rules, and only pulls in the
landlord when money, legal, danger, or low-confidence thresholds are hit.

The full target scope (5 trust levels, a complete policy engine, SMS-based
maintenance workflow with vendor/appointment/invoice coordination, rent/lease
autopilot, AI-Manager tool-calling, a command-centre UI, full audit/observability,
demo tooling, and a complete doc set) is genuinely multi-week work. **This
implementation pass built Phases 0–2 to full production depth with test
coverage.** Phases 3–6 are designed below and sequenced as the next work.

## What was built (Phases 0–2)

### Phase 0 — Foundation
- **Migration tooling**: switched from `prisma db push` to `prisma migrate`. A
  baseline migration (`backend/prisma/migrations/0_baseline/`) captures the schema
  as it existed before this work, applied via `prisma migrate resolve --applied`
  with no data loss. Every schema change since is a reviewable `.sql` file.
- **AI provider abstraction**: `backend/src/services/ai/aiClient.js` is now the
  single Anthropic client instantiation (previously duplicated in
  `agentService.js` and `onboardingAiService.js`), with retry/backoff and a
  pluggable mock mode (`AI_PROVIDER=mock`) for tests/offline dev.
  `backend/src/services/ai/schemas.js` holds zod schemas for every AI JSON
  contract; `backend/src/services/ai/validate.js` (`callAndValidate`) parses,
  validates, retries once on failure, and throws a distinguishable
  `AiValidationError` so callers can fall back to manual review instead of
  executing unvalidated output.
- **Test harness**: Jest + Supertest added to the backend (`backend/jest.config.js`,
  `backend/tests/`); Vitest + Testing Library added to the frontend
  (`frontend/vitest.config.js`, `frontend/src/test/`). Neither existed before.

### Phase 1 — Policy engine + 5 trust levels
- New models `AgentPolicyDefault` (org-level) and `AgentPolicyOverride`
  (property-level, wins over the default) store a `TrustLevel`
  (`OBSERVE | DRAFT | EXECUTE_WITH_APPROVAL | OPERATE_WITHIN_POLICY | EMERGENCY_ESCALATION`)
  and a JSON `settings` blob per `PolicyDomain` (`MAINTENANCE | RENT | LEASE | COMMUNICATION`).
- `backend/src/services/policyEngine.js` resolves the effective policy:
  property override → org default → hardcoded fallback
  (`backend/src/config/policyDefaults.js`).
- `backend/scripts/backfillPolicyDefaults.js` converts every landlord's legacy
  `AgentConfig` booleans into equivalent `AgentPolicyDefault` rows
  (`true → OPERATE_WITHIN_POLICY`, `false → OBSERVE`), so existing landlords see
  **zero behavior change** until they touch a new policy setting. Already run
  against the live database.
- `agentService.js`'s message and maintenance triage now gate auto-action through
  `policyEngine.canActWithoutApproval(trustLevel)` instead of raw booleans; the
  legacy `AgentConfig.isEnabled` flag remains the global kill switch.
- Frontend: a new "Policies" tab in `AgentPage.jsx`
  (`TrustLevelSelector.jsx`, `PolicyOverrideTable.jsx`) lets a landlord set the
  account-wide trust level per domain and override it per property.

### Phase 2 — Maintenance workflow, SMS intake, vendor dispatch, invoices
This is the "tenants text, Farik handles the rest" slice, end to end:
- **SMS provider abstraction** (`backend/src/services/sms/`): a `smsProvider.js`
  factory picks `mockSmsProvider.js` (default — logs to console, writes `SmsMessage`
  rows, no credentials needed) or `twilioSmsProvider.js` (`SMS_PROVIDER=twilio`,
  real send/receive with signature-verified webhooks) based on `SMS_PROVIDER`.
- **Deterministic safety** (`backend/src/services/maintenanceDiagnostics.js`):
  keyword-based category classification and a hardcoded emergency-rule table
  (fire, gas smell, active flooding, exposed wiring, sewage flooding, CO alarm,
  broken exterior door, structural collapse, immediate danger). This runs
  **before any AI call** — emergency detection never depends on the model.
- **Workflow engine** (`backend/src/services/workflowEngine.js`): validates state
  transitions against an adjacency map and writes every transition to
  `WorkflowEvent` (actor, reason, timestamp) — the audit trail a future
  Approval Centre / timeline will read from.
- **Maintenance workflow** (`backend/src/services/workflows/maintenanceWorkflow.js`):
  a 23-state machine (`MaintenanceWorkflowState`) wiring intake → diagnostic
  questions → AI triage → policy-gated auto-approve or landlord approval →
  vendor dispatch → appointment → completion → invoice → resolution. Emergency
  detection re-runs on every tenant reply, since a follow-up message can reveal
  danger the original report didn't.
- **Vendor dispatch** (`backend/src/services/vendorDispatchService.js`):
  priority-ordered vendor selection (preferred vendors first, then fastest
  average response time), SMS contact with a minimal, tenant-privacy-respecting
  job summary, retry-next-vendor on decline/timeout up to a policy-configured
  limit, then escalation.
- **Appointments** (`backend/src/services/appointmentService.js`): propose,
  confirm, mark in-progress/complete, and no-show handling (escalates for manual
  rescheduling rather than silently retrying).
- **Invoices** (`backend/src/services/invoiceExtractionService.js` +
  `backend/src/controllers/invoiceController.js`): upload (PDF/image, local disk
  storage matching the existing maintenance-photo pattern), best-effort AI field
  extraction (vendor, invoice #, date, line items, total), a flag when the
  extracted total exceeds the approved estimate, and **mandatory landlord
  approval before an invoice affects the workflow** — Farik never auto-pays a
  vendor at any trust level.
- **Inbound SMS webhook** (`backend/src/routes/webhooks.js` +
  `backend/src/controllers/webhookController.js`): signature-verified (Twilio
  HMAC) before any DB write, routes a tenant reply into an open diagnostic
  workflow, a vendor reply into vendor-response handling, or falls back to the
  existing Conversation/Message flow for general inquiries. Unmatched phone
  numbers get a generic "contact your property manager" reply — never property
  or tenant details.
- **Maintenance intake branching** (`backend/src/controllers/maintenanceController.js`):
  a new maintenance request routes into the full SMS workflow only when the
  tenant has a phone number, has given SMS consent, and the property's policy
  trust level isn't `OBSERVE`; otherwise the existing direct-triage path is
  untouched.
- **Frontend**: `MaintenanceDetailPage.jsx` (linked from each row in
  `MaintenancePage.jsx`) shows the workflow state, a human-readable
  `WorkflowTimeline`, `VendorContactPanel`, and `InvoiceApprovalCard`, plus
  approve/cancel actions for workflows awaiting landlord approval.

### Test coverage added this pass
88 backend Jest tests (unit + integration) and 2 frontend Vitest smoke tests, all
passing. Priority order followed the plan: pure-function unit tests first
(`maintenanceDiagnostics`, `policyEngine`, `workflowEngine` — no DB), then
mocked-Prisma unit tests (`agentService`, `maintenanceWorkflow`,
`vendorDispatchService`, `invoiceExtractionService`), then a Supertest
integration test for the SMS webhook (signature rejection, tenant routing,
vendor routing, unmatched-number handling).

## Phases 3–6 — designed, not yet built

**Phase 3 — Rent + lease autopilot upgrade**: `PaymentPromise`, `LeaseWorkflow`,
`MoveChecklistItem` models; `rentWorkflow.js` (policy-driven reminder offsets
seeded to match today's -3/0/+1/+3/+7 days, tenant-reply classification
including payment promises and disputes, a hardcoded "never auto-issue legal
notices" gate) and `leaseWorkflow.js` (120/90/60/30-day reminders, renewal/rent-
change approval gate, move-in/out checklists). `agentService.runRentReminderCheck`
/ `runLeaseRenewalCheck` would delegate to these, reusing `workflowEngine.js`.

**Phase 4 — AI Manager tool-calling + Command Centre + Approval Centre**:
`aiTools.js` (whitelisted tool definitions + per-tool zod arg schemas — the AI
never free-texts a DB mutation), `aiManagerService.js` (intent → tool selection
→ validated execution → audit row), `approvalService.js` (a query layer over
`AgentLog`, not a new persisted approval object — keeps one canonical audit
trail). Frontend: `ApprovalCentrePage.jsx`, `AutopilotCommandCentre.jsx`
(replacing `AutopilotTimelinePage.jsx`), `AiManagerChat.jsx`.

**Phase 5 — Demo mode, security hardening, entitlements**: an env-gated
`simulationService.js` (simulate SMS/vendor reply/tenant reply/appointment
completion/invoice upload/payment event/time advancement) built on the mock SMS
provider's existing hooks; `seedAutopilotDemo.js` covering the 8 scripted demo
workflows from the spec; `rateLimiter.js` on auth/webhook/AI-command routes;
`entitlements.js` + `LandlordProfile.planTier` (default = full access, no
billing regression); an IDOR/XSS checklist pass across controllers.

**Phase 6 — Audit/observability/docs hardening**: `timelineService.js` producing
the human-readable "10:04 — Tenant reported a leak..." style timeline; a
structured logger replacing scattered `console.log`; the remaining docs
(`demo-workflows.md`) once Phase 5's demo scenarios exist to document.

**Explicitly deferred, with reasons**: a voice channel (no channel exists yet to
extend — SMS alone covers the core ask), full multi-language i18n (no i18n
framework exists app-wide), a dedicated cost/observability dashboard beyond
structured logs, billing UI (the spec itself scopes this to an entitlement
layer only), open-ended AI-Manager free-form NLU beyond a whitelisted tool set,
a visual state-diagram widget (the chronological timeline is cheaper and
equally informative), S3/cloud upload migration (explicitly out of scope; local
disk matches the existing pattern and limitation), a full ROI/analytics
dashboard, and a broad Playwright e2e suite (unit/integration coverage of the
state machine and policy logic catches the correctness risks that matter most
here).

## Running this work

```bash
cd backend
npm install
npx prisma migrate deploy   # applies all migrations, including this pass's
npm run backfill:policy-defaults   # idempotent — safe to re-run
npm test                    # 88 tests
```

```bash
cd frontend
npm install
npm test                    # Vitest
npm run build
```

See `docs/sms-integration.md`, `docs/autopilot-policies.md`,
`docs/security-model.md`, `docs/background-jobs.md`, and `docs/deployment.md`
for the rest of the operational detail.
