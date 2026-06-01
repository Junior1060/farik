const router = require('express').Router();
const { getAll, create, update } = require('../controllers/maintenanceController');
const { authenticate, requireLandlord, requireTenant } = require('../middleware/auth');

router.get('/', authenticate, getAll);
router.post('/', authenticate, requireTenant, create);
router.put('/:id', authenticate, requireLandlord, update);

module.exports = router;
