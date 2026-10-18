const router = require('express').Router();
const { getConversations, getThread, sendMessage } = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');
const { perUserCostLimiter } = require('../middleware/rateLimiter');

router.get('/', authenticate, getConversations);
router.get('/:conversationId', authenticate, getThread);
// A tenant message triggers an AI classification (and possibly an SMS reply), so it is
// capped per account rather than left open-ended.
router.post('/:conversationId', authenticate, perUserCostLimiter, sendMessage);

module.exports = router;
