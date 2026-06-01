# Rentora Deployment Guide

## Prerequisites
- GitHub account
- Vercel account (vercel.com) — free
- Railway account (railway.app) — free tier
- Stripe account with Connect enabled

---

## Step 1: Push Code to GitHub

1. Go to github.com → New repository → name it `rentora` → Create
2. In your terminal:

```bash
cd ~/Desktop/Rentora
git add .
git commit -m "Rentora MVP ready for deployment"
git remote add origin https://github.com/YOUR_USERNAME/rentora.git
git push -u origin main
```

---

## Step 2: Deploy Backend on Railway

1. Go to **railway.app** → Login with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `rentora` repo
4. Set the **root directory** to `backend`
5. Railway will auto-detect Node.js

### Add Environment Variables on Railway
Go to your service → **Variables** tab → add each one:

```
DATABASE_URL=postgresql://postgres.rucsuyucndpzdycveolq:...@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.rucsuyucndpzdycveolq:...@aws-1-ca-central-1.pooler.supabase.com:5432/postgres
JWT_SECRET=generate-a-long-random-string-here
JWT_EXPIRES_IN=7d
PORT=5000
NODE_ENV=production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_... (set this after Step 4)
FRONTEND_URL=https://your-app.vercel.app (set this after Step 3)
```

6. After deploy, Railway gives you a URL like:
   `https://rentora-backend-production.up.railway.app`
   → Save this URL, you need it for Step 3

---

## Step 3: Deploy Frontend on Vercel

1. Go to **vercel.com** → Login with GitHub
2. Click **Add New Project** → Import your `rentora` repo
3. Set **Root Directory** to `frontend`
4. Under **Environment Variables** add:

```
VITE_API_URL=https://your-railway-url.up.railway.app/api
```

5. Click **Deploy**
6. Vercel gives you a URL like:
   `https://rentora.vercel.app`
   → Save this URL

7. Go back to Railway → update `FRONTEND_URL` to your Vercel URL
8. Redeploy the backend on Railway

---

## Step 4: Set Up Stripe Webhook for Production

1. Go to **dashboard.stripe.com → Developers → Webhooks**
2. Click **Add endpoint**
3. Enter URL: `https://your-railway-url.up.railway.app/api/stripe/webhook`
4. Select event: `checkout.session.completed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Go to Railway → update `STRIPE_WEBHOOK_SECRET` with this value
8. Redeploy backend

---

## Step 5: Switch Stripe to Live Mode

1. In Stripe dashboard → toggle from **Test** to **Live** mode
2. Go to **Developers → API keys** → copy the **Secret key** (`sk_live_...`)
3. Update `STRIPE_SECRET_KEY` on Railway with the live key
4. Repeat Step 4 for a live mode webhook
5. Enable Stripe Connect in live mode at **dashboard.stripe.com/connect**

---

## Step 6: Run Database Migrations on Production

In your local terminal (runs against your Supabase DB):

```bash
cd ~/Desktop/Rentora/backend
npm run db:push
```

This is already done — Supabase is your production database.

---

## Step 7: Final Checks

- [ ] Frontend loads at Vercel URL
- [ ] Login works (landlord@rentora.com / password123)
- [ ] Landlord can connect Stripe account
- [ ] Tenant can click Pay Now and reach Stripe Checkout
- [ ] Payment success redirects back to portal
- [ ] Webhook marks payment as PAID in database
- [ ] Stripe dashboard shows the transaction

---

## Test Credentials (remove before going fully public)

| Role     | Email                     | Password    |
|----------|---------------------------|-------------|
| Landlord | landlord@rentora.com      | password123 |
| Tenant   | alice.morgan@email.com    | password123 |

---

## Stripe Test Card

| Field   | Value                |
|---------|----------------------|
| Number  | 4242 4242 4242 4242  |
| Expiry  | 12/34                |
| CVC     | 123                  |
| Country | Canada               |

---

## Tech Stack Summary

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React + Vite + Tailwind CSS       |
| Backend  | Node.js + Express + Prisma        |
| Database | PostgreSQL (Supabase)             |
| Payments | Stripe Connect (Express accounts) |
| Auth     | JWT                               |
| Hosting  | Vercel (frontend) + Railway (backend) |
