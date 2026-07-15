# SMS Integration

## Provider abstraction

`backend/src/services/sms/smsProvider.js` exports `getSmsProvider()`, which
returns one of two adapters based on the `SMS_PROVIDER` env var:

- **`mockSmsProvider.js`** (default — `SMS_PROVIDER` unset or anything other
  than `"twilio"`). Writes an `SmsMessage` row and logs to the console instead
  of calling a real API. `verifyWebhookSignature()` always returns `true`
  (there's no real external caller to authenticate in mock mode).
  `simulateInboundSms()` is a hook reserved for a future dev/demo simulation
  tool (Phase 5, not yet built).
- **`twilioSmsProvider.js`** (`SMS_PROVIDER=twilio`). Real adapter using the
  `twilio` npm package. `sendSms()` calls the Twilio API and records an
  `SmsMessage` row exactly like the mock adapter. `verifyWebhookSignature()`
  uses `twilio.validateRequest()` against `TWILIO_AUTH_TOKEN` — this is checked
  **before any database write** in the webhook controller.

Both adapters implement the same contract: `sendSms({to, body})`,
`verifyWebhookSignature(req)`, `parseInboundWebhook(req)`. Nothing else in the
codebase branches on which provider is active — swapping `SMS_PROVIDER` is the
only integration point.

## Required environment variables (only for real SMS)

```
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
```

Without these, the app runs entirely on the mock provider — no SMS feature is
blocked, no error is thrown, nothing is sent externally.

## Inbound webhook

`POST /api/webhooks/sms` (`backend/src/routes/webhooks.js` →
`backend/src/controllers/webhookController.js`). No `authenticate` middleware —
this is an external caller. The body is form-encoded (Twilio's format), parsed
via a dedicated `express.urlencoded()` middleware mounted before the global
`express.json()` in `server.js`, exactly mirroring the existing Stripe
raw-body pattern.

Request handling order:
1. `provider.verifyWebhookSignature(req)` — reject with `403` on failure,
   before any DB write.
2. `provider.parseInboundWebhook(req)` — extract `from`, `body`,
   `providerMessageId`.
3. Look up the sender by phone number: `TenantProfile` first, then `Vendor` if
   no tenant matched. Phone comparison normalizes both sides to digits-only
   (`normalizePhone()`) so formatting differences (`+1`, dashes, spaces) don't
   cause false negatives.
4. Write an `SmsMessage(direction: INBOUND)` row regardless of match, for audit.
5. Route:
   - **Vendor match** with a pending `VendorContactAttempt` → parse a yes/no
     reply and hand off to `vendorDispatchService.handleVendorResponse()`.
   - **Tenant match** with an open `MaintenanceWorkflow` in
     `DIAGNOSTIC_QUESTIONS_SENT` → `maintenanceWorkflow.recordTenantReply()`.
   - **Tenant match**, no open diagnostic workflow → falls back to the existing
     `Conversation`/`Message` flow and `agentService.handleTenantMessage()`
     (the same general-inquiry handling web-portal messages already use).
   - **No match** → a generic "contact your property manager" reply is sent.
     Property or tenant details are never exposed before verification.

## Known limitation

Starting a *brand-new* maintenance request purely from an inbound SMS with no
existing `MaintenanceRequest` (i.e., a tenant texting in cold, with nothing
in-flight) is not implemented this pass — it would require guessing which
unit/lease the message concerns from phone number alone plus creating the
`MaintenanceRequest` itself. Today's flow requires the request to exist first
(web portal, or an existing open workflow); SMS handles the diagnostic
follow-up and vendor coordination for that request. Extending intake to
handle a cold "my sink is leaking" text with no prior request is a reasonable
next increment.
