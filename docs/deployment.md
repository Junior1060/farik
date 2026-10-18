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

UPLOADS_DIR=/var/data/uploads   # a mounted persistent disk — see below
```

**Production boot guard.** With `NODE_ENV=production` the server refuses to start
unless `JWT_SECRET` is set, is not a known placeholder, and is at least 32
characters, and `FRONTEND_URL` is set (`backend/src/config/env.js`). Generate the
secret with `openssl rand -base64 48`. A failed boot prints every problem at once.

**Uploads need a persistent disk.** Render's default filesystem is discarded on
every deploy, so photos, invoices and lease documents vanish at the next release.
Add a Disk to the backend service (Render dashboard → service → Disks), mount it
at a path such as `/var/data/uploads`, and set `UPLOADS_DIR` to that path. Files
are only served to signed-in owners (`backend/src/routes/uploads.js`).

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

- Maintenance photos, invoices and lease documents are stored on local disk
  under `UPLOADS_DIR` and served only to signed-in owners. Durability depends on
  that directory being a mounted persistent disk (above); object storage
  (S3/R2) remains a reasonable later step but is no longer required for safety.
- No horizontal scaling support for `node-cron` jobs — fine for the current
  single-instance deployment.
