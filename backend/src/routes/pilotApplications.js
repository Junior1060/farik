const router = require('express').Router();
const ctrl = require('../controllers/pilotController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { publicFormLimiter } = require('../middleware/rateLimiter');

// Public — anyone may apply, nobody may read.
router.get('/config', ctrl.getConfig);
router.post('/', publicFormLimiter, ctrl.submit);

// Admin — reading and managing applications requires an authenticated user on
// the ADMIN_EMAILS allowlist.
router.get('/', authenticate, requireAdmin, ctrl.list);
router.patch('/:id', authenticate, requireAdmin, ctrl.update);

module.exports = router;
