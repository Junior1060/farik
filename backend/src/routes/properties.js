const router = require('express').Router();
const { getAll, create, update, remove, createUnit, updateUnit, removeUnit } = require('../controllers/propertyController');
const { authenticate, requireLandlord } = require('../middleware/auth');

router.get('/', authenticate, requireLandlord, getAll);
router.post('/', authenticate, requireLandlord, create);
router.put('/:id', authenticate, requireLandlord, update);
router.delete('/:id', authenticate, requireLandlord, remove);

router.post('/:propertyId/units', authenticate, requireLandlord, createUnit);
router.put('/:propertyId/units/:unitId', authenticate, requireLandlord, updateUnit);
router.delete('/:propertyId/units/:unitId', authenticate, requireLandlord, removeUnit);

module.exports = router;
