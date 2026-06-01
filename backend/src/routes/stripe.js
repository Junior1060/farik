const router = require('express').Router();
const {
  connectAccount,
  getConnectStatus,
  getDashboardLink,
  createCheckoutSession,
  handleWebhook,
} = require('../controllers/stripeController');
const { authenticate, requireLandlord, requireTenant } = require('../middleware/auth');

// Webhook must use raw body — registered in server.js before this router
router.post('/webhook', handleWebhook);

// Landlord routes
router.get('/connect/status', authenticate, requireLandlord, getConnectStatus);
router.post('/connect/account', authenticate, requireLandlord, connectAccount);
router.get('/connect/dashboard', authenticate, requireLandlord, getDashboardLink);

// Tenant routes
router.post('/checkout', authenticate, requireTenant, createCheckoutSession);

module.exports = router;
