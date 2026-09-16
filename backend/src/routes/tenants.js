const router = require('express').Router();
const { getAll, getOne, create, update, remove, lookupByEmail, attestSmsConsent } = require('../controllers/tenantController');
const { authenticate, requireLandlord } = require('../middleware/auth');

router.get('/lookup', authenticate, requireLandlord, lookupByEmail);
router.get('/', authenticate, requireLandlord, getAll);
router.post('/', authenticate, requireLandlord, create);
router.get('/:id', authenticate, requireLandlord, getOne);
router.put('/:id/sms-consent', authenticate, requireLandlord, attestSmsConsent);
router.put('/:id', authenticate, requireLandlord, update);
router.delete('/:id', authenticate, requireLandlord, remove);

module.exports = router;
