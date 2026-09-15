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

```

---

## Self-serve signup and onboarding

Farik is self-serve: anyone can create a landlord account from the homepage and
start managing rentals immediately. There is no application, waitlist, or
approval step.

- `/signup` — landlord signup (full name, email, password, optional company).
  Posts to `POST /api/auth/register`, stores the JWT the same way login does,
  and redirects into `/onboarding`.
- `/signup/tenant` — tenant signup. If a landlord already added the tenant
  (which creates a placeholder account with `invitePending = true`), signing up
  with the same email claims that account instead of failing as a duplicate.
- `/onboarding` — welcome → import existing data (the real `/import` wizard) or
  set up a first property manually → add a first tenant → dashboard. Every step
  can be skipped; the same actions are reachable later from the app.
- `POST /api/properties` accepts optional `propertyType` and `unitCount`
  (creates placeholder units `Unit 1..N` with no rent set).
- `POST /api/tenants` lets a landlord add a tenant and their first lease in one
  call (tenants only appear for a landlord once they hold a lease on one of that
  landlord's units).

Emails are normalised to lower case on registration; login falls back to a
case-insensitive match so older mixed-case accounts still work.

### Demo credentials on /login

The seeded demo shortcut buttons on the login page are **off by default**. Set
`VITE_ENABLE_DEMO_LOGIN=true` in `frontend/.env` only on a seeded demo
environment.

### Migrations

```bash
cd backend
npx prisma migrate deploy     # production / CI (also runs on npm start)
npx prisma migrate dev        # local, also regenerates the client
```

`20260915000000_self_serve_onboarding` adds `properties.propertyType` and
`users.invitePending` (both additive). `20260915000001_remove_pilot_applications`
drops the retired `pilot_applications` table and its enums — export that table
first if you still want the leads.

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
