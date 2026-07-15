const mockPrisma = {
  agentPolicyOverride: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  agentPolicyDefault: { findUnique: jest.fn(), upsert: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const policyEngine = require('../../src/services/policyEngine');

afterEach(() => jest.clearAllMocks());

describe('getEffectivePolicy resolution order', () => {
  it('uses the property override when one exists', async () => {
    mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue({
      trustLevel: 'OPERATE_WITHIN_POLICY', settings: { maxAutoSpend: 1000 },
    });

    const policy = await policyEngine.getEffectivePolicy('landlord-1', 'prop-1', 'MAINTENANCE');

    expect(policy.source).toBe('property_override');
    expect(policy.trustLevel).toBe('OPERATE_WITHIN_POLICY');
    expect(policy.settings.maxAutoSpend).toBe(1000);
    expect(mockPrisma.agentPolicyDefault.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to the org default when no property override exists', async () => {
    mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue(null);
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({
      trustLevel: 'DRAFT', settings: { maxAutoSpend: 200 },
    });

    const policy = await policyEngine.getEffectivePolicy('landlord-1', 'prop-1', 'MAINTENANCE');

    expect(policy.source).toBe('org_default');
    expect(policy.trustLevel).toBe('DRAFT');
    expect(policy.settings.maxAutoSpend).toBe(200);
  });

  it('falls back to the hardcoded default when neither override nor org default exists', async () => {
    mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue(null);
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue(null);

    const policy = await policyEngine.getEffectivePolicy('landlord-1', 'prop-1', 'MAINTENANCE');

    expect(policy.source).toBe('hardcoded_fallback');
    expect(policy.trustLevel).toBe('OPERATE_WITHIN_POLICY');
    expect(policy.settings.maxAutoSpend).toBe(500);
  });

  it('skips the override lookup entirely when no propertyId is given (org-level query)', async () => {
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'OBSERVE', settings: {} });

    const policy = await policyEngine.getEffectivePolicy('landlord-1', null, 'RENT');

    expect(policy.source).toBe('org_default');
    expect(mockPrisma.agentPolicyOverride.findUnique).not.toHaveBeenCalled();
  });

  it('merges override settings on top of fallback defaults rather than replacing them', async () => {
    mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue({
      trustLevel: 'OPERATE_WITHIN_POLICY', settings: { maxAutoSpend: 1200 },
    });

    const policy = await policyEngine.getEffectivePolicy('landlord-1', 'prop-1', 'MAINTENANCE');

    expect(policy.settings.maxAutoSpend).toBe(1200);
    expect(policy.settings.maxVendorRetries).toBe(2); // untouched fallback field preserved
  });
});

describe('canActWithoutApproval', () => {
  it('permits auto-action for OPERATE_WITHIN_POLICY and EMERGENCY_ESCALATION', () => {
    expect(policyEngine.canActWithoutApproval('OPERATE_WITHIN_POLICY')).toBe(true);
    expect(policyEngine.canActWithoutApproval('EMERGENCY_ESCALATION')).toBe(true);
  });

  it('denies auto-action for OBSERVE, DRAFT, and EXECUTE_WITH_APPROVAL', () => {
    expect(policyEngine.canActWithoutApproval('OBSERVE')).toBe(false);
    expect(policyEngine.canActWithoutApproval('DRAFT')).toBe(false);
    expect(policyEngine.canActWithoutApproval('EXECUTE_WITH_APPROVAL')).toBe(false);
  });
});

describe('setOrgPolicy / setPropertyOverride', () => {
  it('upserts an org default keyed by landlordId+domain', async () => {
    await policyEngine.setOrgPolicy('landlord-1', 'MAINTENANCE', { trustLevel: 'DRAFT', settings: { a: 1 } });
    expect(mockPrisma.agentPolicyDefault.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { landlordId_domain: { landlordId: 'landlord-1', domain: 'MAINTENANCE' } } }),
    );
  });

  it('upserts a property override keyed by landlordId+propertyId+domain', async () => {
    await policyEngine.setPropertyOverride('landlord-1', 'prop-1', 'MAINTENANCE', { trustLevel: 'DRAFT' });
    expect(mockPrisma.agentPolicyOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { landlordId_propertyId_domain: { landlordId: 'landlord-1', propertyId: 'prop-1', domain: 'MAINTENANCE' } },
      }),
    );
  });
});
