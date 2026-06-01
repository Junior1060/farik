const router = require('express').Router();
const { getSummary, getActivity } = require('../controllers/dashboardController');
const { authenticate, requireLandlord } = require('../middleware/auth');

router.get('/summary', authenticate, requireLandlord, getSummary);
router.get('/activity', authenticate, requireLandlord, getActivity);

module.exports = router;
