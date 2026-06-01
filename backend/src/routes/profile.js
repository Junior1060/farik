const router = require('express').Router();
const { getProfile, updateProfile, changePassword } = require('../controllers/profileController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, getProfile);
router.put('/', authenticate, updateProfile);
router.put('/password', authenticate, changePassword);

module.exports = router;
