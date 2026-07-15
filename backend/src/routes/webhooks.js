const router = require('express').Router();
const ctrl = require('../controllers/webhookController');

// No authenticate middleware — external provider (Twilio) calls this directly.
// Signature verification happens inside the controller before any DB write.
router.post('/sms', ctrl.handleInboundSms);

module.exports = router;
