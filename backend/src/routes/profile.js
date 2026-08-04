const router = require('express').Router();
const { getProfile, updateProfile, changePassword, getMessagingConfig } = require('../controllers/profileController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, getProfile);
router.get('/messaging', authenticate, getMessagingConfig);
router.put('/', authenticate, updateProfile);
router.put('/password', authenticate, changePassword);

module.exports = router;
