const router = require('express').Router();
const { getConversations, getThread, sendMessage } = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, getConversations);
router.get('/:conversationId', authenticate, getThread);
router.post('/:conversationId', authenticate, sendMessage);

module.exports = router;
