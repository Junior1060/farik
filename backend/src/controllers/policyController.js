const { z } = require('zod');
const prisma = require('../lib/prisma');
const policyEngine = require('../services/policyEngine');

const DOMAINS = ['MAINTENANCE', 'RENT', 'LEASE', 'COMMUNICATION'];
const TRUST_LEVELS = ['OBSERVE', 'DRAFT', 'EXECUTE_WITH_APPROVAL', 'OPERATE_WITHIN_POLICY', 'EMERGENCY_ESCALATION'];

const policyUpdateSchema = z.object({
  trustLevel: z.enum(TRUST_LEVELS).optional(),
  settings: z.record(z.any()).optional(),
});

// GET /api/policies — every domain's effective org-level policy for this landlord.
const getOrgPolicies = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const policies = {};
    for (const domain of DOMAINS) {
      policies[domain] = await policyEngine.getEffectivePolicy(landlordId, null, domain);
    }
    res.json({ policies });
  } catch (err) {
    next(err);
  }
};

// PUT /api/policies/:domain — set/update the org-level default for one domain.
const updateOrgPolicy = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const { domain } = req.params;
    if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'Invalid policy domain' });

    const data = policyUpdateSchema.parse(req.body);
    const updated = await policyEngine.setOrgPolicy(landlordId, domain, data);
    res.json({ policy: updated });
  } catch (err) {
    next(err);
  }
};

// GET /api/policies/properties/:propertyId — effective policy per domain for one property
// (shows whether each domain is inherited from the org default or overridden).
const getPropertyPolicies = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const { propertyId } = req.params;
    const property = await prisma.property.findFirst({ where: { id: propertyId, landlordId } });
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const policies = {};
    for (const domain of DOMAINS) {
      policies[domain] = await policyEngine.getEffectivePolicy(landlordId, propertyId, domain);
    }
    res.json({ policies });
  } catch (err) {
    next(err);
  }
};

// PUT /api/policies/properties/:propertyId/:domain — set a property-level override.
const updatePropertyPolicy = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const { propertyId, domain } = req.params;
    if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'Invalid policy domain' });

    const property = await prisma.property.findFirst({ where: { id: propertyId, landlordId } });
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const data = policyUpdateSchema.parse(req.body);
    const updated = await policyEngine.setPropertyOverride(landlordId, propertyId, domain, data);
    res.json({ policy: updated });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/policies/properties/:propertyId/:domain — clear the override (revert to org default).
const deletePropertyPolicy = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const { propertyId, domain } = req.params;
    if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'Invalid policy domain' });

    await policyEngine.clearPropertyOverride(landlordId, propertyId, domain);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  DOMAINS,
  TRUST_LEVELS,
  getOrgPolicies,
  updateOrgPolicy,
  getPropertyPolicies,
  updatePropertyPolicy,
  deletePropertyPolicy,
};
