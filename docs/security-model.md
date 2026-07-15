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

## Carried-forward limitations (not addressed this pass)

- File uploads (maintenance photos, invoices) remain on local disk, served
  unauthenticated via `express.static('/uploads')` — same as the pre-existing
  maintenance-photo pattern. Anyone with a stored filename can view the file.
  This is a known gap in the existing app, not introduced by this work; a
  proper fix (signed URLs / private cloud storage) is out of scope per the
  agreed plan.
- No rate limiting has been added yet to the new `/api/webhooks/sms`,
  `/api/invoices`, or `/api/appointments` routes. Planned for Phase 5
  (`backend/src/middleware/rateLimiter.js`, not yet built) — until then, these
  routes have the same exposure as every other unthrottled route in the app.
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
