require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');
const { startScheduler } = require('./services/schedulerService');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Stripe webhook needs raw body BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

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
app.use('/api/import', require('./routes/import'));

// Serve uploaded documents (read-only)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Farik API running on http://localhost:${PORT}`);
  startScheduler();
});

module.exports = app;
