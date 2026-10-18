const router = require('express').Router();
const { register, login, me, getInvite } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', authenticate, me);
// Public but rate-limited: the activation page asks who an invitation link is for.
router.get('/invite/:token', authLimiter, getInvite);

module.exports = router;
