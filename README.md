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
| Landlord | landlord@rentora.com | password123 |
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
- 2 properties in Austin, TX
- 8 units (Apt 1A, Apt 2B, Apt 3C, Unit 5, Unit 6, Suite 12, etc.)
- Active and expired leases
- Payment history with mixed statuses (paid, pending, overdue, partial)
- 3 message conversations with threads
- 6 maintenance requests across priorities and statuses
- 3 notices (2 sent, 1 draft)
- 7 activity log entries

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
