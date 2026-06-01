const router = require('express').Router();
const { getAll, create, update, getMyPayments } = require('../controllers/paymentController');
const { authenticate, requireLandlord, requireTenant } = require('../middleware/auth');

router.get('/my', authenticate, requireTenant, getMyPayments);
router.get('/', authenticate, requireLandlord, getAll);
router.post('/', authenticate, requireLandlord, create);
router.put('/:id', authenticate, requireLandlord, update);

module.exports = router;
