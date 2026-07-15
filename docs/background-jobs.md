# Background Jobs

## Infrastructure

Farik's backend runs as an always-on Node process (deployed to Render, not
serverless), so `node-cron` continues to be the right tool — no new queue
infrastructure (Redis, BullMQ, etc.) was introduced. All jobs are registered in
`backend/src/services/schedulerService.js#startScheduler()`, called once at
process boot from `backend/src/server.js`.

**Important**: `startScheduler()` (and `app.listen()`) are now gated behind
`if (require.main === module)` in `server.js`, so requiring the app module from
tests (Supertest) never starts real cron jobs or opens a real port — this was
a necessary change to make integration testing possible without side effects.

## Jobs

| Schedule | Function | Purpose |
|---|---|---|
| Daily 8:00 AM | `agentService.runRentReminderCheck()` | Rent reminder/overdue notices (pre-existing) |
| Daily 9:00 AM | `agentService.runLeaseRenewalCheck()` | Lease renewal draft escalations (pre-existing) |
| Hourly | `escalationService.checkEscalationReminders()` | 24h reminder / 48h urgent escalation (pre-existing) |
| Every 30 minutes | `vendorDispatchService.checkVendorTimeouts()` | Retries or escalates vendor contact attempts that have gone unanswered past the policy's `followUpIntervalHours` (new this pass) |

## Idempotency and safety

- `checkVendorTimeouts()` only acts on `VendorContactAttempt` rows still in
  `SENT` status — once retried or escalated, the attempt moves to
  `NO_RESPONSE`/`ACCEPTED`/`DECLINED` and is never reprocessed.
- Workflow transitions are validated by `workflowEngine.transition()` before
  being applied — a job that fires twice for the same workflow will have its
  second attempt rejected as an `InvalidTransitionError` rather than silently
  double-applying a state change.
- Rent reminder and lease renewal jobs (pre-existing) already check for
  same-day duplicate `Notice` rows and landlord cancellations before acting.

## Known limitations (unchanged from before this pass)

- No dead-letter queue or retry-with-backoff at the job level — a thrown error
  inside a scheduled function is caught and logged (`.catch(console.error)`)
  but not retried until the next scheduled run.
- No distributed-lock protection if the process were ever scaled to multiple
  instances (fine for the current single-instance Render deployment; would
  need addressing before horizontal scaling).
