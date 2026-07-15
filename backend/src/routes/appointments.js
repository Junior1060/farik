const router = require('express').Router();
const { authenticate, requireLandlord } = require('../middleware/auth');
const ctrl = require('../controllers/appointmentController');

router.use(authenticate, requireLandlord);

router.get('/maintenance-request/:maintenanceRequestId', ctrl.getForRequest);
router.post('/:id/confirm', ctrl.confirm);
router.post('/:id/complete', ctrl.complete);
router.post('/:id/no-show', ctrl.noShow);

module.exports = router;
