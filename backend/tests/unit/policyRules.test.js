const mockPrisma = {
  agentPolicyDefault: { findUnique: jest.fn(), upsert: jest.fn() },
  agentPolicyOverride: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  property: { findFirst: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const policyController = require('../../src/controllers/policyController');
const policyEngine = require('../../src/services/policyEngine');
const { FALLBACK_POLICY, HARD_SAFETY_RULES } = require('../../src/config/policyDefaults');

// Every settings key the Autopilot Rules tab writes. Kept in lockstep with
// frontend/src/components/autopilot/ruleMap.js — if a rule there gains a key
// that the backend does not accept, this test fails.
const RULE_KEYS = {
  MAINTENANCE: ['maxAutoSpend', 'maxVendorRetries', 'followUpIntervalHours', 'allowAutoScheduling', 'requireTenantEntryPermission'],
  RENT: ['gracePeriodDays', 'firstReminderOffsetDays', 'landlordEscalationOffsetDays'],
  LEASE: ['requireApprovalForRenewalOffer'],
  COMMUNICATION: ['smsEnabled', 'quietHoursStart', 'quietHoursEnd'],
};

function mockReqRes({ params = {}, body = {}, landlordId = 'landlord-1' } = {}) {
  const req = { params, body, user: { landlordProfile: { id: landlordId } } };
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
  return { req, res, next: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('updateOrgPolicy — the Rules tab contract', () => {
  it('persists a settings change to the named domain', async () => {
    mockPrisma.agentPolicyDefault.upsert.mockResolvedValue({ id: 'p1' });
    const { req, res, next } = mockReqRes({
      params: { domain: 'MAINTENANCE' },
      body: { settings: { maxAutoSpend: 750 } },
    });

    await policyController.updateOrgPolicy(req, res, next);

    const call = mockPrisma.agentPolicyDefault.upsert.mock.calls[0][0];
    expect(call.where.landlordId_domain).toEqual({ landlordId: 'landlord-1', domain: 'MAINTENANCE' });
    expect(call.update.settings).toEqual({ maxAutoSpend: 750 });
    expect(next).not.toHaveBeenCalled();
  });

  it('persists a trust level change', async () => {
    mockPrisma.agentPolicyDefault.upsert.mockResolvedValue({ id: 'p1' });
    const { req, res, next } = mockReqRes({
      params: { domain: 'COMMUNICATION' },
      body: { trustLevel: 'OBSERVE' },
    });

    await policyController.updateOrgPolicy(req, res, next);

    expect(mockPrisma.agentPolicyDefault.upsert.mock.calls[0][0].update.trustLevel).toBe('OBSERVE');
  });

  it('rejects an unknown domain without touching the database', async () => {
    const { req, res, next } = mockReqRes({ params: { domain: 'BILLING' }, body: { trustLevel: 'OBSERVE' } });

    await policyController.updateOrgPolicy(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(mockPrisma.agentPolicyDefault.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown trust level', async () => {
    const { req, res, next } = mockReqRes({ params: { domain: 'RENT' }, body: { trustLevel: 'FULL_AUTONOMY' } });

    await policyController.updateOrgPolicy(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockPrisma.agentPolicyDefault.upsert).not.toHaveBeenCalled();
  });

  it.each(Object.entries(RULE_KEYS).flatMap(([domain, keys]) => keys.map((key) => [domain, key])))(
    'accepts %s.%s from the Rules tab',
    async (domain, key) => {
      mockPrisma.agentPolicyDefault.upsert.mockResolvedValue({ id: 'p1' });
      const value = typeof FALLBACK_POLICY[domain].settings[key];
      const sample = value === 'boolean' ? true : value === 'number' ? 1 : 'x';
      const { req, res, next } = mockReqRes({ params: { domain }, body: { settings: { [key]: sample } } });

      await policyController.updateOrgPolicy(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(mockPrisma.agentPolicyDefault.upsert.mock.calls[0][0].update.settings).toEqual({ [key]: sample });
    },
  );

  it('every rule key exists in the shipped policy defaults', () => {
    const missing = Object.entries(RULE_KEYS).flatMap(([domain, keys]) =>
      keys.filter((key) => !(key in FALLBACK_POLICY[domain].settings)).map((key) => `${domain}.${key}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('per-property overrides stay scoped to the owning landlord', () => {
  it('404s when the property belongs to someone else', async () => {
    mockPrisma.property.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({
      params: { propertyId: 'other-property', domain: 'RENT' },
      body: { trustLevel: 'OBSERVE' },
    });

    await policyController.updatePropertyPolicy(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.agentPolicyOverride.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.property.findFirst.mock.calls[0][0].where.landlordId).toBe('landlord-1');
  });
});

describe('policyEngine resolution order', () => {
  it('a property override wins over the org default', async () => {
    mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue({ trustLevel: 'OBSERVE', settings: { maxAutoSpend: 100 } });
    const policy = await policyEngine.getEffectivePolicy('landlord-1', 'prop-1', 'MAINTENANCE');

    expect(policy.source).toBe('property_override');
    expect(policy.trustLevel).toBe('OBSERVE');
    expect(policy.settings.maxAutoSpend).toBe(100);
    // partial overrides still inherit the untouched defaults
    expect(policy.settings.maxVendorRetries).toBe(FALLBACK_POLICY.MAINTENANCE.settings.maxVendorRetries);
    expect(mockPrisma.agentPolicyDefault.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to the shipped defaults for a brand-new account', async () => {
    mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue(null);
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue(null);
    const policy = await policyEngine.getEffectivePolicy('landlord-1', null, 'RENT');

    expect(policy.source).toBe('hardcoded_fallback');
    expect(policy.trustLevel).toBe(FALLBACK_POLICY.RENT.trustLevel);
  });
});

describe('approval gate', () => {
  it('only the two operating levels may act without a per-item approval', () => {
    expect(policyEngine.canActWithoutApproval('OPERATE_WITHIN_POLICY')).toBe(true);
    expect(policyEngine.canActWithoutApproval('EMERGENCY_ESCALATION')).toBe(true);
    for (const level of ['OBSERVE', 'DRAFT', 'EXECUTE_WITH_APPROVAL', undefined, null, 'anything']) {
      expect(policyEngine.canActWithoutApproval(level)).toBe(false);
    }
  });

  it('the hard safety rules cannot be mutated by settings', () => {
    expect(Object.isFrozen(HARD_SAFETY_RULES)).toBe(true);
    expect(HARD_SAFETY_RULES).toEqual({
      neverAutoIssueLegalNotice: true,
      neverAutoApplyRentIncrease: true,
      neverAutoPayVendor: true,
    });
  });
});
