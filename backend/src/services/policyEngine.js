const prisma = require('../lib/prisma');
const { FALLBACK_POLICY, HARD_SAFETY_RULES } = require('../config/policyDefaults');

/**
 * Resolves the effective trust level + settings for a landlord+domain,
 * optionally narrowed to a specific property.
 * Lookup order: property override -> org default -> hardcoded fallback.
 *
 * @param {string} landlordId
 * @param {string|null} propertyId
 * @param {'MAINTENANCE'|'RENT'|'LEASE'|'COMMUNICATION'} domain
 */
async function getEffectivePolicy(landlordId, propertyId, domain) {
  if (propertyId) {
    const override = await prisma.agentPolicyOverride.findUnique({
      where: { landlordId_propertyId_domain: { landlordId, propertyId, domain } },
    });
    if (override) {
      return {
        source: 'property_override',
        domain,
        trustLevel: override.trustLevel,
        settings: { ...FALLBACK_POLICY[domain].settings, ...override.settings },
      };
    }
  }

  const orgDefault = await prisma.agentPolicyDefault.findUnique({
    where: { landlordId_domain: { landlordId, domain } },
  });
  if (orgDefault) {
    return {
      source: 'org_default',
      domain,
      trustLevel: orgDefault.trustLevel,
      settings: { ...FALLBACK_POLICY[domain].settings, ...orgDefault.settings },
    };
  }

  const fallback = FALLBACK_POLICY[domain];
  return { source: 'hardcoded_fallback', domain, trustLevel: fallback.trustLevel, settings: fallback.settings };
}

async function setOrgPolicy(landlordId, domain, { trustLevel, settings }) {
  return prisma.agentPolicyDefault.upsert({
    where: { landlordId_domain: { landlordId, domain } },
    update: { ...(trustLevel && { trustLevel }), ...(settings && { settings }) },
    create: { landlordId, domain, trustLevel: trustLevel || FALLBACK_POLICY[domain].trustLevel, settings: settings || {} },
  });
}

async function setPropertyOverride(landlordId, propertyId, domain, { trustLevel, settings }) {
  return prisma.agentPolicyOverride.upsert({
    where: { landlordId_propertyId_domain: { landlordId, propertyId, domain } },
    update: { ...(trustLevel && { trustLevel }), ...(settings && { settings }) },
    create: { landlordId, propertyId, domain, trustLevel: trustLevel || FALLBACK_POLICY[domain].trustLevel, settings: settings || {} },
  });
}

async function clearPropertyOverride(landlordId, propertyId, domain) {
  return prisma.agentPolicyOverride.deleteMany({ where: { landlordId, propertyId, domain } });
}

// Trust levels that permit the agent to act without a per-item landlord approval.
const AUTO_ACT_LEVELS = new Set(['OPERATE_WITHIN_POLICY', 'EMERGENCY_ESCALATION']);

function canActWithoutApproval(trustLevel) {
  return AUTO_ACT_LEVELS.has(trustLevel);
}

module.exports = {
  getEffectivePolicy,
  setOrgPolicy,
  setPropertyOverride,
  clearPropertyOverride,
  canActWithoutApproval,
  HARD_SAFETY_RULES,
};
