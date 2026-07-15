# Deployment (Autopilot additions)

This supplements the existing deployment notes in `farik-deployment-session.md`
and `STEPS.md` (frontend on Vercel, backend on Render, database on Neon). Only
what changed for Autopilot is documented here.

## Database migrations

The project now uses `prisma migrate` instead of `prisma db push`. **Render's
start/build command must run migrations before the server starts**:

```
npx prisma migrate deploy && npx prisma generate && node src/server.js
```

(Previously this was likely just `node src/server.js` or `npm start` — check
Render's dashboard build/start command settings and update it to include
`prisma migrate deploy`.) `db:push` still exists as an npm script for local
scratch work only — never run it against the shared Neon database, since it
has no migration history and can silently diverge from `schema.prisma`.

## New environment variables

Add to Render's environment variables (see `backend/.env.example` for the full
list with comments):

```
AI_PROVIDER=anthropic       # or "mock" to run Autopilot without an API key
AI_MODEL=claude-sonnet-4-6
AI_MAX_RETRIES=2
AI_TIMEOUT_MS=20000

SMS_PROVIDER=mock           # or "twilio" once you have real credentials
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

The app runs fully without any of the SMS/Twilio variables set — Autopilot's
maintenance workflow uses the mock SMS provider by default (logs instead of
sending, writes `SmsMessage` rows normally). Setting `SMS_PROVIDER=twilio`
activates real sending/receiving; you'll also need to configure Twilio's
webhook URL to point at `https://<your-backend-domain>/api/webhooks/sms`.

## One-time setup after first deploy of this change

```bash
# From the backend, against the production DATABASE_URL:
npx prisma migrate deploy
npm run backfill:policy-defaults   # idempotent, safe to re-run
```

The backfill converts existing landlords' `AgentConfig` booleans into
`AgentPolicyDefault` rows so their Autopilot behavior is unchanged.

## Local development

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL at minimum; AI/SMS vars can stay as mock
npm install
npx prisma migrate dev
npm run db:seed
npm run backfill:policy-defaults
npm test
npm run dev
```

```bash
cd frontend
npm install
npm test
npm run dev
```

## Known limitations carried into production

- Maintenance photos and invoices are stored on local disk
  (`backend/uploads/`), served unauthenticated. On Render this is
  ephemeral-ish storage — files can be lost on redeploy. This is a pre-existing
  limitation, not introduced by this work; migrating to S3/Supabase Storage
  with signed URLs is a reasonable follow-up but was out of scope for this pass.
- No horizontal scaling support for `node-cron` jobs — fine for the current
  single-instance deployment.
