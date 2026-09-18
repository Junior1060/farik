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
   no tenant matched. Both sides go through `normalizePhone()` (see **Phone
   number formats** below) so formatting differences don't cause false negatives.
4. Write an `SmsMessage(direction: INBOUND)` row regardless of match, for audit.
5. Route:
   - **Vendor match** with a pending `VendorContactAttempt` → parse a yes/no
     reply and hand off to `vendorDispatchService.handleVendorResponse()`.
   - **Tenant match** with an open `MaintenanceWorkflow` in
     `DIAGNOSTIC_QUESTIONS_SENT` → `maintenanceWorkflow.recordTenantReply()`.
   - **Tenant match**, no open diagnostic workflow → falls back to the existing
     `Conversation`/`Message` flow and `agentService.handleTenantMessage()`
     (the same general-inquiry handling web-portal messages already use). The
     webhook passes `{ smsReplyTo }`, which is what makes the agent's answer go
     back over SMS as well as into the conversation thread — a tenant who texted
     in may never open the portal. A web-portal message passes no
     `smsReplyTo` and is unchanged. An escalated message gets a short holding
     text instead of an answer, and so does a message the agent could not handle
     at all (an AI outage or a bad `ANTHROPIC_API_KEY`), so the channel never
     just goes quiet; the `tenantId` on every such send keeps `optOutGuard` in
     force.
   - **No match** → a generic "contact your property manager" reply is sent.
     Property or tenant details are never exposed before verification.

## Phone number formats

Numbers are typed by hand in the app ("306-209-3660"), but Twilio speaks strict
E.164 in both directions — it delivers `From` as `+13062093660` and rejects a
`to` that isn't E.164 with error 21211. `backend/src/services/sms/phoneNumber.js`
is the only place that gap is bridged, with two deliberately non-interchangeable
helpers:

- **`normalizePhone(phone)`** — a *comparison key*: digits only, with a leading
  North American country code dropped, so a tenant stored as `3062093660`
  matches the `+13062093660` Twilio sends. Used by the webhook's sender lookup.
  Never dialled.
- **`toE164(phone)`** — a *dialling address*. Returns `null` when the input
  can't be made dialable (a 7-digit number has no area code; a leading `+` is
  trusted as already-international rather than guessed at). Never compared.

`toE164()` is applied inside both adapters' `sendSms()`, which is the same
shared-choke-point pattern as `optOutGuard` — every existing call site passes
`tenant.phone` or `vendor.phone` straight through and is covered without
being touched. An undialable number is skipped and returns
`status: 'FAILED'` rather than reaching the provider. Outbound `SmsMessage`
rows record the E.164 form actually dialled, so inbound and outbound rows for
the same person share a phone number value.

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
