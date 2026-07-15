const { createMockPrisma } = require('../helpers/mockPrisma');

const mockPrisma = createMockPrisma();
jest.mock('../../src/lib/prisma', () => mockPrisma);

const aiClient = require('../../src/services/ai/aiClient');
const agentService = require('../../src/services/agentService');

afterEach(() => {
  aiClient.clearMockHandler();
  jest.clearAllMocks();
});

describe('triageMaintenanceRequest', () => {
  const baseUnit = {
    id: 'unit-1',
    name: 'Unit 2B',
    property: { name: 'Maple Court', landlord: { id: 'landlord-1' } },
  };
  const request = { id: 'req-1', unitId: 'unit-1', title: 'Leaking sink', description: 'Water under the sink' };

  beforeEach(() => {
    mockPrisma.unit.findUnique.mockResolvedValue({ ...baseUnit, property: { ...baseUnit.property, id: 'prop-1' } });
    mockPrisma.agentConfig.findUnique.mockResolvedValue({ isEnabled: true, autoMaintenance: true });
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({ tenant: { firstName: 'Alice', lastName: 'Morgan' } });
    mockPrisma.vendor.findFirst.mockResolvedValue({ name: 'Bob Plumbing', phone: '555-1234', email: null });
    mockPrisma.landlordProfile.findUnique.mockResolvedValue({
      id: 'landlord-1', userId: 'user-1', user: { email: 'landlord@example.com' },
    });
    mockPrisma.notification.create.mockResolvedValue({});
    mockPrisma.agentLog.create.mockResolvedValue({ id: 'log-1' });
    // Default: policy engine resolves to OPERATE_WITHIN_POLICY (auto-act allowed), matching
    // the pre-policy-engine autoMaintenance=true default via the backfill mapping.
    mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue(null);
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'OPERATE_WITHIN_POLICY', settings: {} });
  });

  it('auto-books a HIGH confidence, low-cost, non-emergency request and logs EXECUTED', async () => {
    aiClient.setMockHandler(() => JSON.stringify({
      urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'MEDIUM',
      estimatedCostMin: 80, estimatedCostMax: 150, summary: 'Fix leaking sink', reasoning: 'minor leak',
    }));

    await agentService.triageMaintenanceRequest(request);

    expect(mockPrisma.maintenanceRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' }, data: { priority: 'MEDIUM' },
    });
    const triageLog = mockPrisma.agentLog.create.mock.calls.find((c) => c[0].data.actionType === 'MAINTENANCE_TRIAGE');
    expect(triageLog[0].data.status).toBe('EXECUTED');
    const bookingLog = mockPrisma.agentLog.create.mock.calls.find((c) => c[0].data.actionType === 'MAINTENANCE_BOOKING');
    expect(bookingLog).toBeTruthy();
  });

  it('escalates instead of auto-booking when estimated cost exceeds $500', async () => {
    aiClient.setMockHandler(() => JSON.stringify({
      urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'HIGH',
      estimatedCostMin: 400, estimatedCostMax: 900, summary: 'Repipe kitchen', reasoning: 'major repair',
    }));

    await agentService.triageMaintenanceRequest(request);

    expect(mockPrisma.agentLog.create).toHaveBeenCalledTimes(1);
    const [call] = mockPrisma.agentLog.create.mock.calls[0];
    expect(call.data.actionType).toBe('MAINTENANCE_ESCALATION');
    expect(call.data.status).toBe('ESCALATED');
    const bookingCalls = mockPrisma.agentLog.create.mock.calls.filter((c) => c[0].data.actionType === 'MAINTENANCE_BOOKING');
    expect(bookingCalls).toHaveLength(0);
  });

  it('escalates for manual review when the AI response fails schema validation, without throwing', async () => {
    aiClient.setMockHandler(() => 'this is not JSON');

    await expect(agentService.triageMaintenanceRequest(request)).resolves.toBeUndefined();

    const [call] = mockPrisma.agentLog.create.mock.calls[0];
    expect(call.data.actionType).toBe('MAINTENANCE_ESCALATION');
    expect(call.data.summary).toMatch(/manual review/i);
    expect(mockPrisma.maintenanceRequest.update).not.toHaveBeenCalled();
  });

  it('does nothing when Autopilot is disabled for the landlord', async () => {
    mockPrisma.agentConfig.findUnique.mockResolvedValue({ isEnabled: false, autoMaintenance: true });
    aiClient.setMockHandler(() => { throw new Error('should not be called'); });

    await agentService.triageMaintenanceRequest(request);

    expect(mockPrisma.agentLog.create).not.toHaveBeenCalled();
  });

  it('does nothing when the maintenance policy trust level is OBSERVE', async () => {
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'OBSERVE', settings: {} });
    aiClient.setMockHandler(() => { throw new Error('should not be called'); });

    await agentService.triageMaintenanceRequest(request);

    expect(mockPrisma.agentLog.create).not.toHaveBeenCalled();
  });

  it('never auto-acts under DRAFT trust level even with a HIGH-confidence, low-cost triage', async () => {
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'DRAFT', settings: {} });
    aiClient.setMockHandler(() => JSON.stringify({
      urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'MEDIUM',
      estimatedCostMin: 80, estimatedCostMax: 150, summary: 'Fix leaking sink', reasoning: 'minor leak',
    }));

    await agentService.triageMaintenanceRequest(request);

    const triageLog = mockPrisma.agentLog.create.mock.calls.find((c) => c[0].data.actionType === 'MAINTENANCE_TRIAGE');
    expect(triageLog[0].data.status).toBe('ESCALATED');
    const bookingCalls = mockPrisma.agentLog.create.mock.calls.filter((c) => c[0].data.actionType === 'MAINTENANCE_BOOKING');
    expect(bookingCalls).toHaveLength(0);
  });

  it('uses the policy-configured maxAutoSpend instead of the hardcoded $500 threshold', async () => {
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({
      trustLevel: 'OPERATE_WITHIN_POLICY', settings: { maxAutoSpend: 1000 },
    });
    aiClient.setMockHandler(() => JSON.stringify({
      urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'HIGH',
      estimatedCostMin: 400, estimatedCostMax: 900, summary: 'Repipe kitchen', reasoning: 'major repair',
    }));

    await agentService.triageMaintenanceRequest(request);

    // $900 is under the property's $1000 override, so this should auto-book, not escalate.
    const bookingLog = mockPrisma.agentLog.create.mock.calls.find((c) => c[0].data.actionType === 'MAINTENANCE_BOOKING');
    expect(bookingLog).toBeTruthy();
    const escalationCalls = mockPrisma.agentLog.create.mock.calls.filter((c) => c[0].data.actionType === 'MAINTENANCE_ESCALATION');
    expect(escalationCalls).toHaveLength(0);
  });
});
