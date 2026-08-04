require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');
const { startScheduler } = require('./services/schedulerService');

const app = express();

// Behind Render/Railway/Vercel there is exactly one proxy hop. Without this,
// req.ip is the proxy's address and every rate limiter would bucket the whole
// internet together. Override with TRUST_PROXY_HOPS if your topology differs.
app.set(
  'trust proxy',
  process.env.TRUST_PROXY_HOPS
    ? Number(process.env.TRUST_PROXY_HOPS)
    : process.env.NODE_ENV === 'production' ? 1 : false,
);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Stripe webhook needs raw body BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Twilio posts form-encoded bodies — parse BEFORE express.json() for this path only.
app.use('/api/webhooks/sms', express.urlencoded({ extended: false }));

app.use(express.json());
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', app: 'Farik API' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/stripe', require('./routes/stripe'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/leases', require('./routes/leases'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/notices', require('./routes/notices'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/policies', require('./routes/policies'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/import', require('./routes/import'));
app.use('/api/pilot-applications', require('./routes/pilotApplications'));

// Serve uploaded documents (read-only)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use(errorHandler);

// Only auto-start when run directly (`node src/server.js`) — requiring this module
// from tests (supertest) must not open a real port or start cron jobs.
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Farik API running on http://localhost:${PORT}`);
    startScheduler();
  });
}

module.exports = app;
