const router = require('express').Router();
const { getAll, create, update } = require('../controllers/noticeController');
const { authenticate, requireLandlord } = require('../middleware/auth');

router.get('/', authenticate, getAll);
router.post('/', authenticate, requireLandlord, create);
router.put('/:id', authenticate, requireLandlord, update);

module.exports = router;
