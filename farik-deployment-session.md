# Deploying Farik: Migrating off a maxed-out Supabase plan and shipping to production

**A Claude Code session — full-stack deployment + live debugging**

A property-management app (React + Express + Prisma/Postgres) needed to go live, but the
database provider's free plan was maxed out on projects. This session covers the full
migration and deployment — **Neon → Render → Vercel** — including a real production bug
that got diagnosed and fixed end-to-end.

> Secrets (API keys, DB passwords, connection strings) have been redacted as `***REDACTED***`.

---

## 1. The problem

> **User:** My Supabase has run out of projects to deploy on — I'll beat the max (2-project limit on the free plan). Where else can I host the backend? I'm planning to host the frontend on Vercel.

**Diagnosis — two separate concerns:**
- **Database** (Postgres — what Supabase actually provides) → hit the project cap
- **Backend API** (long-running Express server with cron jobs + file uploads)

The backend uses `node-cron` and a local `uploads/` folder, so it needs a *real server host*,
not a serverless platform (Vercel/Netlify would break the cron jobs and wipe uploads).

**Recommended stack:**

| Layer | Host | Why |
|---|---|---|
| Frontend (React + Vite) | **Vercel** | Perfect for static SPA, free |
| Backend API (Express) | **Render** | Handles long-running Node + cron, free tier |
| Database (Postgres) | **Neon** | Free serverless Postgres, Prisma just needs a new `DATABASE_URL` |

Because the app uses Prisma, moving the database is a one-line change — Prisma works with any
Postgres provider.

---

## 2. A production-safety fix found before deploying

The frontend called the API via a hardcoded base URL that only worked through the Vite dev proxy:

```js
// frontend/src/services/api.js — BEFORE
baseURL: '/api',
```

In production there is no dev proxy, so `/api` would hit Vercel instead of the backend and
every call would 404. Fixed to read an environment variable, with the dev path as fallback:

```js
// AFTER
baseURL: import.meta.env.VITE_API_URL || '/api',
```

This keeps local development working **and** points production at the real backend.

---

## 3. Step 1 — Neon (database)

Neon's connect dialog exposes two connection strings via a single toggle:

- **Pooled** (host contains `-pooler`) → `DATABASE_URL`
- **Direct** (no `-pooler`) → `DIRECT_URL`

Prisma needs both (pooled for queries, direct for migrations). Dropped them into `backend/.env`:

```
DATABASE_URL="postgresql://***REDACTED***-pooler.../neondb?sslmode=require"
DIRECT_URL="postgresql://***REDACTED***.../neondb?sslmode=require"
```

Then pushed the schema to create all tables in the fresh Neon database:

```bash
cd backend
npm run db:push
```

```
Datasource "db": PostgreSQL database "neondb" at "***REDACTED***.neon.tech"
Your database is now in sync with your Prisma schema. Done in 8.49s
✔ Generated Prisma Client
```

✅ **Database live.**

---

## 4. Step 2 — Render (backend API)

First, a safety check — confirm the `.env` full of secrets is **not** tracked by git before
pushing the repo public:

```bash
cat backend/.gitignore        # → node_modules/, .env, dist/
git ls-files backend/.env     # → (empty = good, .env is NOT tracked)
```

Render web-service settings:

| Field | Value |
|---|---|
| Root Directory | `backend` |
| Language | Node |
| Build Command | `npm install && npx prisma generate` |
| Start Command | `npm start` |
| Instance | Free |

Environment variables were pasted in via **"Add from .env"**, with two critical adjustments:
- **Removed `PORT`** — Render assigns its own port; the code already reads `process.env.PORT`.
- **Changed `NODE_ENV` → `production`**.

After deploy, verified the backend was actually alive:

```bash
curl -s https://farik-api.onrender.com/health
```

```json
{"status":"ok","app":"Farik API"}
```

✅ **Backend live** — Render + Neon + Express all talking.

---

## 5. Step 3 — Vercel (frontend)

**Gotcha caught before deploying:** Vercel auto-detected *both* the `frontend` and `backend`
folders and tried to deploy them as a multi-service project (generating a `vercel.json` to run
the Express backend as a Vercel service too).

That's wrong — the backend already lives on Render, and Express (`app.listen` + cron +
local uploads) doesn't work on Vercel's serverless model. Fix:

- **Application Preset:** switched from *Services* → **Vite**
- **Root Directory:** set to **`frontend`** (not the repo root)
- **Env var:** `VITE_API_URL = https://farik-api.onrender.com/api`

Deployed → landing page rendered perfectly at `farik-livid.vercel.app`.

✅ **Frontend live.**

---

## 6. The bug: demo login silently fails

> **User:** Why aren't the demo email/password working? I'm clicking "Landlord Demo" to
> autofill the credentials and access the seeded data, and nothing happens.

Rather than guess, ruled it out layer by layer.

**Hypothesis 1 — database wasn't seeded after the migration?**

```bash
node -e "...prisma.user.count()..."
# → Users in Neon DB: 8
```

Nope — 8 users exist (1 landlord + 7 tenants). Data is fine.

**Hypothesis 2 — credentials wrong / backend broken?** Test login directly against Render:

```bash
curl -X POST https://farik-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"landlord@rentora.com","password":"password123"}'
```

```json
{"token":"***REDACTED***","user":{"email":"landlord@rentora.com","role":"LANDLORD", ... }}
HTTP 200
```

Backend logs people in perfectly. So the failure is in the **browser → backend** hop — which
points at **CORS**. Inspect the actual header the backend sends for the Vercel origin:

```bash
curl -i -X POST https://farik-api.onrender.com/api/auth/login \
  -H "Origin: https://farik-livid.vercel.app" ...
```

```
access-control-allow-origin: farik-livid.vercel.app    ← ❌ missing https://
```

**There it is.** The browser's origin is `https://farik-livid.vercel.app`, but the backend
was returning the bare host `farik-livid.vercel.app` because the `FRONTEND_URL` env var in
Render was entered **without the `https://` scheme**. The backend passes that value straight
into its CORS config, so the origins didn't match → browser blocked every response → login
"silently" failed even though the API itself was healthy.

---

## 7. The fix

In Render, changed `FRONTEND_URL`:

```
farik-livid.vercel.app          →   https://farik-livid.vercel.app
```

After the redeploy, re-checked the header:

```
access-control-allow-origin: https://farik-livid.vercel.app    ← ✅
```

Demo login works. **Fully live, end to end.**

---

## 8. Final state

| Layer | Where | Status |
|---|---|---|
| Frontend | Vercel → `farik-livid.vercel.app` | ✅ Live |
| Backend API | Render → `farik-api.onrender.com` | ✅ Live |
| Database | Neon (Postgres) | ✅ Seeded (8 users) |
| CORS | `FRONTEND_URL` fixed | ✅ Connected |

Migrated off a capped Supabase plan onto a clean **Neon + Render + Vercel** setup — all on
free tiers — with two production pitfalls caught before they shipped (the dev-proxy API URL,
the accidental multi-service Vercel config) and one live CORS bug diagnosed by narrowing
from "which layer is broken?" down to a single missing `https://`.

**Known trade-offs documented for later:** Render's free tier sleeps after ~15 min idle
(slow first request), and uploaded files on Render's ephemeral disk get wiped on redeploy —
flagged for a future move to object storage (S3/Cloudinary).

---

*The lesson worth keeping: when something "silently fails," don't guess — test each layer in
isolation (`curl` the DB count, the login endpoint, then the CORS header) until the real
cause is the only thing left standing.*
