const router = require('express').Router();
const { getProfile, updateProfile, changePassword, getMessagingConfig, setSmsConsent } = require('../controllers/profileController');
const { authenticate, requireTenant } = require('../middleware/auth');

router.get('/', authenticate, getProfile);
router.get('/messaging', authenticate, getMessagingConfig);
router.put('/', authenticate, updateProfile);
router.put('/password', authenticate, changePassword);
router.put('/sms-consent', authenticate, requireTenant, setSmsConsent);

module.exports = router;
