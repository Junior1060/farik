# Security Model (Autopilot additions)

## What changed this pass

- **Webhook signature verification**: `POST /api/webhooks/sms` verifies the
  Twilio HMAC signature (`twilio.validateRequest`) before any database write.
  Requests with a missing or invalid signature get `403` immediately
  (`backend/src/services/sms/twilioSmsProvider.js#verifyWebhookSignature`,
  covered by a Supertest integration test).
- **Ownership checks on every new controller**: invoice and appointment
  controllers (`invoiceController.js`, `appointmentController.js`) scope every
  query by `landlordId` derived from the authenticated user
  (`req.user.landlordProfile.id`), joined through
  `maintenanceRequest.unit.property.landlordId` — a landlord can never read or
  act on another landlord's maintenance request, appointment, or invoice by
  guessing an ID. This is the same per-controller manual-scoping pattern the
  rest of the app already uses (there's still no centralized Prisma
  middleware/RLS layer enforcing this automatically — a pre-existing
  architectural note, not something this pass introduced or fixed).
- **Minimal vendor data exposure**: the SMS sent to a vendor during dispatch
  (`vendorDispatchService.js#dispatchNextVendor`) contains only the issue
  category, unit/property name, and title — never the tenant's name, phone, or
  email. Covered by a unit test asserting the vendor message body never
  contains the tenant's phone number.
- **Unverified-sender handling**: an inbound SMS from a phone number that
  matches no `TenantProfile` or `Vendor` gets a generic "contact your property
  manager" reply — no property, tenant, or account details are ever included
  before the sender is verified (`webhookController.js`).
- **AI output never executes directly**: every AI response used for a
  decision is validated against a zod schema (`ai/schemas.js`) via
  `ai/validate.js#callAndValidate` before any field of it is used. A response
  that fails validation is retried once, then routed to manual review — it is
  never used to construct a database write or a message body directly. This is
  the primary defense against a malicious/malformed AI response (or, by
  extension, a prompt-injection attempt via tenant-supplied text that flows
  into a prompt) causing an unintended action: the *shape* of what the AI can
  affect is fixed by the schema, not by whatever text it returns.
- **Emergency safety guidance is hardcoded, not AI-generated**: the tenant
  safety message sent on a deterministic emergency match
  (`maintenanceWorkflow.js#escalateEmergency`) is a fixed string instructing
  the tenant to move to safety and call emergency services — never generated
  by the model, so it can't be manipulated into saying something unsafe or
  claiming Farik contacted emergency services (which it never does).

## Production-readiness pass (October 2026)

- **Tenant activation requires an invitation token.** `POST /api/auth/register`
  with `role: TENANT` only activates the INVITED account a signed, 14-day
  `inviteToken` was issued for, and only with that account's email. Previously
  anyone who knew a tenant's email could claim the account at `/signup/tenant`,
  or pre-register the email so a later lease linked to them. Tenants can no
  longer self-register at all (`tenantInviteService.js`, `authController.js`).
  `authenticate` also refuses any token carrying a `purpose` claim, so an
  invitation can never be presented as a session.
- **Uploads are no longer public.** `/uploads/:folder/:file` requires a session
  and an ownership match scoped like the owning controller (tenant on the
  request, or landlord on the property; invoices/documents landlord-only), 404
  on every refusal, and rejects path traversal before any lookup
  (`routes/uploads.js`, integration-tested).
- **Stripe webhook is idempotent and checks settlement.** A redelivered
  `checkout.session.completed` is acknowledged without a second ledger row;
  `payment_status !== 'paid'` is ignored; a second settled session for an
  already-PAID payment is recorded but logged at error level and marked
  `duplicateOfSession` in the ledger. Checkout reuses a payment's still-open
  session rather than minting another, and returns 409 while a completed one
  awaits its webhook.
- **Boot guard.** Production refuses to start with a missing, placeholder, or
  short `JWT_SECRET`, or without `FRONTEND_URL` (`config/env.js`).
- **Per-account cost limiter** on tenant message send, maintenance request
  creation and the agent trigger (`perUserCostLimiter`, keyed by user id).
- `GET /api/tenants/lookup` now returns only `id`, `firstName`, `lastName`.
  Password change enforces the same 8-character floor as signup. The import
  wizard refuses to turn a landlord login into a tenant profile.

## Carried-forward limitations

- Upload durability still depends on `UPLOADS_DIR` being a persistent disk on
  Render; object storage with signed URLs remains the longer-term option.
- `/api/invoices` and `/api/appointments` are authenticated but not separately
  rate-limited; `/api/webhooks/sms` uses `costSensitiveLimiter`.
- No password reset flow exists yet; a locked-out landlord has no self-service
  recovery. This needs SMTP configured and is the top auth follow-up.
- Invitation links are stateless: minting a new one does not revoke an earlier
  one until the account is activated.
- No centralized query-scoping/RLS layer exists; every controller (old and
  new) must remember to filter by `landlordId`/`tenantId` itself. This pass
  followed the existing convention rather than introducing a new one, but it
  remains a standing risk for future features that forget the filter.

## Testing

Security-relevant behavior covered by automated tests:
- Invalid Twilio webhook signature → `403`, no DB write
  (`tests/integration/smsWebhook.test.js`).
- Unmatched phone number → generic reply, no account details leaked (same file).
- Vendor SMS body never contains tenant contact info
  (`tests/unit/vendorDispatchService.test.js`).
- AI schema-validation failure always routes to manual review, never executes
  (`tests/unit/agentService.test.js`, `tests/unit/maintenanceWorkflow.test.js`,
  `tests/unit/invoiceExtractionService.test.js`).
