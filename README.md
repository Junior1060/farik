# Farik – Property Management Platform

A production-style landlord property management MVP built with React, Node.js, PostgreSQL, and Prisma.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + Tailwind CSS + React Router |
| Backend | Node.js + Express |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| HTTP | Axios |
| Icons | Lucide React |

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL running locally (or a connection string)
- npm or yarn

---

### 1. Clone / Navigate to project

```bash
cd farik
```

---

### 2. Backend Setup

```bash
cd backend
npm install
```

Create your `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL connection:

```
DATABASE_URL="postgresql://postgres:password@localhost:5432/rentora"
JWT_SECRET="super-secret-key-change-in-production"
JWT_EXPIRES_IN="7d"
PORT=5000
```

Push schema to database and seed it:

```bash
npm run db:push
npm run db:seed
```

Start the backend server:

```bash
npm run dev
```

> API runs at http://localhost:5000

---

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

> Frontend runs at http://localhost:5173

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Landlord | demo@farik.ca | password123 |
| Tenant (Alice) | alice.morgan@email.com | password123 |
| Tenant (Sophia) | sophia.chen@email.com | password123 |
| Tenant (Priya) | priya.patel@email.com | password123 |

---

## Features

### Landlord Portal (`/dashboard` → `/maintenance`)

- **Dashboard** – Stats row (collected, pending, occupied units, open maintenance), donut chart, quick actions, recent maintenance, expiring leases, right panel with activity feed
- **Tenants** – Table with search, view/edit/delete, payment status badges
- **Leases** – Card view with status badges, days-until-expiry alerts, inline editing
- **Payments** – Full payment history, summary stats, mark-paid action, record new payment
- **Messages** – Conversation list + threaded message view, send messages to tenants
- **Notices** – Generate late notices for overdue tenants, preview, draft/send workflow
- **Maintenance** – Requests list with priority/status filters, inline status updates

### Tenant Portal (`/tenant`)

- Overview tab with rent status card, lease summary, quick actions
- Payment history tab
- Maintenance requests tab + submit new request form
- Messages tab (direct thread with landlord)
- Notices tab

---

## Project Structure

```
farik/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Full Prisma schema
│   │   └── seed.js                # Realistic seed data
│   ├── src/
│   │   ├── controllers/           # Auth, Dashboard, Tenants, Leases,
│   │   │                          # Payments, Messages, Notices, Maintenance
│   │   ├── routes/                # Express route files
│   │   ├── middleware/            # JWT auth + error handler
│   │   ├── lib/
│   │   │   └── prisma.js          # Prisma client singleton
│   │   └── server.js              # Express app entry point
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── layout/            # AppShell, Sidebar, TopNav
    │   │   ├── ui/                # StatCard, Modal, Badges, EmptyState, etc.
    │   │   └── dashboard/         # RentCollectionChart, ActivityFeed, RightPanel
    │   ├── context/
    │   │   └── AuthContext.jsx    # JWT auth state + login/logout
    │   ├── hooks/
    │   │   └── useFetch.js        # Generic data fetching hook
    │   ├── pages/                 # All route pages
    │   ├── services/              # Axios API service functions
    │   └── utils/
    │       └── formatters.js      # Date, currency, name formatters
    ├── index.html
    ├── vite.config.js             # Dev proxy to backend
    └── tailwind.config.js
```

---

## API Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/dashboard/summary
GET    /api/dashboard/activity

GET    /api/tenants
GET    /api/tenants/:id
PUT    /api/tenants/:id
DELETE /api/tenants/:id

GET    /api/leases
GET    /api/leases/:id
POST   /api/leases
PUT    /api/leases/:id
DELETE /api/leases/:id

GET    /api/payments            ?status=&tenantId=&month=
POST   /api/payments
PUT    /api/payments/:id
GET    /api/payments/my         (tenant)

GET    /api/messages
GET    /api/messages/:convId
POST   /api/messages/:convId

GET    /api/notices
POST   /api/notices
PUT    /api/notices/:id

GET    /api/maintenance
POST   /api/maintenance         (tenant)
PUT    /api/maintenance/:id     (landlord)

GET    /api/pilot-applications/config   (public — is booking configured?)
POST   /api/pilot-applications          (public — submit an application)
GET    /api/pilot-applications          (admin allowlist)
PATCH  /api/pilot-applications/:id      (admin allowlist)
```

---

## Founding Landlord Pilot

The pilot section at the bottom of `/` posts a real application to
`POST /api/pilot-applications`, stores it in the `pilot_applications` table,
emails the team and the applicant, and then offers the applicant a
"Book a 15-minute call" button.

**Every part of this degrades safely.** Missing email config or a missing
booking link never blocks a submission and never surfaces a configuration
message to the applicant — the server logs a warning instead.

### Configure email

Notifications reuse the existing Nodemailer/SMTP service
(`backend/src/services/emailService.js`) — the same transport the Autopilot
escalation emails use. There is no second email provider to set up.

```bash
# backend/.env
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM='"Farik" <noreply@farik.ca>'

PILOT_NOTIFICATION_EMAIL="founders@yourdomain.ca"   # where applications land
```

With `SMTP_HOST`/`SMTP_USER` blank, emails are logged to the console instead of
sent — useful locally. With `PILOT_NOTIFICATION_EMAIL` blank, the applicant still
gets their confirmation and the team notification is skipped with a warning.

### Configure the scheduling link

```bash
# backend/.env
BOOKING_URL="https://cal.com/farik/15min"    # or a Calendly link
```

The backend serves this to the browser from `GET /api/pilot-applications/config`,
so there is a single source of truth and no risk of the frontend and the
confirmation email disagreeing. Applicant details (`name`, `email`, `phone`,
`city`, `units`, `pilot_ref`) are appended as query parameters — both Cal.com and
Calendly prefill from those.

`frontend/.env` may set `VITE_BOOKING_URL` as a fallback, but only for a frontend
deployed before the API is reachable.

### Configure admin access

There is no admin role in the schema. Access to submitted applications is an
explicit email allowlist checked against the authenticated user's own account:

```bash
# backend/.env
ADMIN_EMAILS="you@yourdomain.ca,cofounder@yourdomain.ca"
```

Then sign in as that user and open `/admin/pilot-applications`. An empty
allowlist means nobody can read applications — it fails closed.

### Run the migration

```bash
cd backend
npx prisma migrate deploy     # production / CI
npx prisma migrate dev        # local, also regenerates the client
npx prisma generate           # if you only pulled new schema changes
```

The migration is `prisma/migrations/20260804090000_pilot_applications`. It adds
the `pilot_applications` table plus the `PilotApplicationStatus` and
`PreferredContactMethod` enums. It is additive — no existing table is touched.

### Test the form locally

```bash
cd backend  && npm run dev     # :5000
cd frontend && npm run dev     # :5173, proxies /api
```

Open `http://localhost:5173/#pilot`, fill the form, submit. Then:

- **Verify the submission** — `npx prisma studio` in `backend/` and open the
  `PilotApplication` model, or:
  ```bash
  psql "$DATABASE_URL" -c 'select id, "fullName", email, city, "unitsManaged", status, "createdAt" from pilot_applications order by "createdAt" desc limit 5;'
  ```
- **Verify the emails** — with SMTP unset, both appear in the backend console as
  `[Email] (No SMTP configured) → …`. The submission log line reads
  `[pilot] Application <id> stored. team_email=… applicant_email=… booking=…`
  and deliberately contains no applicant PII.
- **Verify booking prefill** — the success panel's button href should carry
  `?name=…&email=…&pilot_ref=…`.

### Test the booking fallback

Clear `BOOKING_URL` in `backend/.env`, restart the API, and submit again. The
success panel should read *"The Farik team will contact you within one business
day"* with no booking button, the confirmation email should omit the button, and
the server log should carry the `[pilot] BOOKING_URL is not configured` warning.
Nothing about the configuration is shown to the applicant.

### Spam and abuse controls

An off-screen honeypot field (`website`), a 10-per-hour-per-IP rate limit on the
public endpoint, server-side zod validation independent of the client, a 10-minute
idempotency window per email address, and salted-hash-only IP storage.

---

## Database Models

- `User` – Auth user with LANDLORD or TENANT role
- `LandlordProfile` / `TenantProfile` – Role-specific profile data
- `Property` – Belongs to landlord
- `Unit` – Belongs to property, tracks occupancy
- `Lease` – Links tenant to unit with date range and rent amount
- `Payment` – Tracks monthly rent with status (PAID/PENDING/OVERDUE/PARTIAL)
- `Conversation` + `ConversationParticipant` + `Message` – Threaded messaging
- `Notice` – Late notices (DRAFT/SENT)
- `MaintenanceRequest` – Issues with status and priority
- `ActivityLog` – Dashboard activity feed

---

## Seed Data Summary

After running `npm run db:seed` you get:

- 1 landlord (Marcus Reynolds, Reynolds Property Group)
- 7 tenants with realistic names, emails, phones
- 2 properties in Saskatchewan (Maple Court Apartments, Saskatoon · Sunset Ridge Complex, Regina)
- 9 units (Apt 1A, Apt 2B, Apt 3C, Unit 5, Unit 6, Suite 12, etc.)
- Active and expired leases — no two active leases share a unit
- Payment history with mixed statuses (paid, pending, overdue, partial)
- 3 message conversations with threads
- 6 maintenance requests across priorities and statuses
- 3 notices (2 recorded as sent, 1 draft)
- 7 activity log entries

The fixture lives in `backend/prisma/seedData.js` as a pure `buildSeedData(now)`
function — no Prisma, no env, no I/O — so every date derives from the current
date rather than being frozen into the file, and the dataset can be asserted on
without a database (`backend/tests/unit/seedData.test.js`). `prisma/seed.js` is
the only thing that turns it into rows.

---

## Potential Next Steps

- [ ] Email notifications for overdue rent and maintenance updates
- [ ] File uploads for lease documents and maintenance photos
- [ ] Stripe integration for online rent payments
- [ ] AI-powered message suggestions (placeholder UI already in place)
- [ ] Tenant onboarding invite flow
- [ ] Multi-landlord support with sub-accounts
- [ ] Mobile app (React Native)
- [ ] Export reports (PDF/CSV)
