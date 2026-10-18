const router = require('express').Router();
const { authenticate, requireLandlord } = require('../middleware/auth');
const { perUserCostLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/agentController');

router.use(authenticate, requireLandlord);

router.get('/config', ctrl.getConfig);
router.put('/config', ctrl.updateConfig);

router.get('/logs', ctrl.getLogs);
router.post('/logs/:id/approve', ctrl.approveLog);
router.post('/logs/:id/reject', ctrl.rejectLog);
router.post('/logs/:id/dismiss', ctrl.dismissLog);
router.post('/logs/:id/undo', ctrl.undoLog);

router.get('/escalations', ctrl.getEscalations);

router.get('/notifications', ctrl.getNotifications);
router.post('/notifications/read-all', ctrl.markNotificationsRead);

router.get('/vendors', ctrl.getVendors);
router.post('/vendors', ctrl.createVendor);
router.put('/vendors/:id', ctrl.updateVendor);
router.delete('/vendors/:id', ctrl.deleteVendor);

router.get('/timeline', ctrl.getTimeline);
router.post('/timeline/cancel', ctrl.cancelScheduled);

// Runs every scheduled check immediately (notices, emails). Capped so one account
// cannot hammer it.
router.post('/trigger', perUserCostLimiter, ctrl.triggerAgentRun);

module.exports = router;
