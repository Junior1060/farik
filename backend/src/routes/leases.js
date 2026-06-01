const router = require('express').Router();
const { getAll, getOne, create, update, remove } = require('../controllers/leaseController');
const { authenticate, requireLandlord } = require('../middleware/auth');

router.get('/', authenticate, requireLandlord, getAll);
router.get('/:id', authenticate, requireLandlord, getOne);
router.post('/', authenticate, requireLandlord, create);
router.put('/:id', authenticate, requireLandlord, update);
router.delete('/:id', authenticate, requireLandlord, remove);

module.exports = router;
