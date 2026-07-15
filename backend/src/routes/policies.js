const router = require('express').Router();
const { authenticate, requireLandlord } = require('../middleware/auth');
const ctrl = require('../controllers/policyController');

router.use(authenticate, requireLandlord);

router.get('/', ctrl.getOrgPolicies);
router.put('/:domain', ctrl.updateOrgPolicy);

router.get('/properties/:propertyId', ctrl.getPropertyPolicies);
router.put('/properties/:propertyId/:domain', ctrl.updatePropertyPolicy);
router.delete('/properties/:propertyId/:domain', ctrl.deletePropertyPolicy);

module.exports = router;
