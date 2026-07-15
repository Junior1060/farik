const mockPrisma = {
  maintenanceRequest: { findUnique: jest.fn(), update: jest.fn() },
  maintenanceWorkflow: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  workflowEvent: { create: jest.fn() },
  smsMessage: { create: jest.fn() },
  landlordProfile: { findUnique: jest.fn() },
  agentLog: { create: jest.fn() },
  notification: { create: jest.fn() },
  agentPolicyOverride: { findUnique: jest.fn() },
  agentPolicyDefault: { findUnique: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const aiClient = require('../../src/services/ai/aiClient');
const maintenanceWorkflow = require('../../src/services/workflows/maintenanceWorkflow');

const baseRequest = {
  id: 'req-1',
  title: 'Kitchen leak',
  description: 'Water is leaking under the sink',
  tenant: { id: 'tenant-1', firstName: 'Alice', lastName: 'Morgan', phone: '+15551234567', smsConsent: true },
  unit: { id: 'unit-1', name: 'Unit 2B', property: { id: 'prop-1', name: 'Maple Court', landlord: { id: 'landlord-1' } } },
  workflow: null,
};

function mockWorkflowRow(overrides = {}) {
  return { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'INTAKE_RECEIVED', category: 'PLUMBING_LEAK', diagnosticAnswers: null, ...overrides };
}

// Prisma's real findUnique/update reflect each other (a write is visible to the
// next read); a static mockResolvedValue doesn't, so recordTenantReply's internal
// re-fetch after its own transition would see stale state. This wires the mocks
// to a shared mutable row, like the real DB would behave.
function wireStatefulWorkflow(initial) {
  let row = { ...initial };
  mockPrisma.maintenanceWorkflow.findUnique.mockImplementation(() => Promise.resolve({ ...row }));
  mockPrisma.maintenanceWorkflow.update.mockImplementation(({ data }) => {
    row = { ...row, ...data };
    return Promise.resolve({ ...row });
  });
  return () => row;
}

beforeEach(() => {
  mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(baseRequest);
  mockPrisma.landlordProfile.findUnique.mockResolvedValue({ id: 'landlord-1', userId: 'user-1', user: { email: 'l@example.com' } });
  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.agentLog.create.mockResolvedValue({ id: 'log-1' });
  mockPrisma.smsMessage.create.mockResolvedValue({ id: 'sms-1' });
  mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue(null);
  mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'OPERATE_WITHIN_POLICY', settings: {} });
});

afterEach(() => {
  aiClient.clearMockHandler();
  jest.clearAllMocks();
});

describe('startWorkflow', () => {
  it('creates a MaintenanceWorkflow and sends diagnostic questions for a non-emergency report', async () => {
    const created = mockWorkflowRow();
    mockPrisma.maintenanceWorkflow.create.mockResolvedValue(created);
    mockPrisma.maintenanceWorkflow.findUnique.mockResolvedValue({ ...created, state: 'DIAGNOSTIC_QUESTIONS_SENT' });

    await maintenanceWorkflow.startWorkflow('req-1');

    expect(mockPrisma.maintenanceWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ category: 'PLUMBING_LEAK', isEmergency: false }) }),
    );
    expect(mockPrisma.smsMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'OUTBOUND' }) }),
    );
    expect(mockPrisma.agentLog.create).not.toHaveBeenCalled(); // no escalation for a routine report
  });

  it('escalates immediately and skips diagnostic questions for a deterministic emergency', async () => {
    const emergencyRequest = { ...baseRequest, title: 'Gas smell', description: 'I smell gas in the kitchen' };
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(emergencyRequest);
    const created = mockWorkflowRow({ isEmergency: true });
    mockPrisma.maintenanceWorkflow.create.mockResolvedValue(created);
    mockPrisma.maintenanceWorkflow.findUnique.mockResolvedValue({ ...created, state: 'EMERGENCY_ESCALATED' });

    await maintenanceWorkflow.startWorkflow('req-1');

    expect(mockPrisma.maintenanceWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isEmergency: true }) }),
    );
    // Safety SMS was sent, but it must not contain repair instructions.
    const smsBody = mockPrisma.smsMessage.create.mock.calls[0][0].data.body;
    expect(smsBody).toMatch(/move to a safe location/i);
    expect(smsBody).toMatch(/911/);
    // Landlord escalation was created.
    const escalationCall = mockPrisma.agentLog.create.mock.calls[0][0];
    expect(escalationCall.data.actionType).toBe('MAINTENANCE_ESCALATION');
    expect(escalationCall.data.status).toBe('ESCALATED');
  });
});

describe('recordTenantReply -> triageAndProceed', () => {
  it('auto-approves a routine, low-cost, HIGH-confidence triage under OPERATE_WITHIN_POLICY', async () => {
    wireStatefulWorkflow(mockWorkflowRow({ state: 'DIAGNOSTIC_QUESTIONS_SENT' }));
    aiClient.setMockHandler(() => JSON.stringify({
      urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'MEDIUM',
      estimatedCostMin: 80, estimatedCostMax: 150, summary: 'Fix leak', reasoning: 'minor leak',
    }));

    await maintenanceWorkflow.recordTenantReply('wf-1', 'Yes it is actively leaking, I can send a photo');

    const approvedTransition = mockPrisma.workflowEvent.create.mock.calls.find((c) => c[0].data.toState === 'APPROVED');
    expect(approvedTransition).toBeTruthy();
    expect(mockPrisma.agentLog.create).not.toHaveBeenCalled(); // no escalation needed
  });

  it('routes to landlord approval when the estimated cost exceeds the policy spend limit', async () => {
    wireStatefulWorkflow(mockWorkflowRow({ state: 'DIAGNOSTIC_QUESTIONS_SENT' }));
    aiClient.setMockHandler(() => JSON.stringify({
      urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'HIGH',
      estimatedCostMin: 600, estimatedCostMax: 900, summary: 'Repipe', reasoning: 'major repair',
    }));

    await maintenanceWorkflow.recordTenantReply('wf-1', 'It is a big leak');

    const approvalTransition = mockPrisma.workflowEvent.create.mock.calls.find((c) => c[0].data.toState === 'AWAITING_LANDLORD_APPROVAL');
    expect(approvalTransition).toBeTruthy();
    const escalation = mockPrisma.agentLog.create.mock.calls.find((c) => c[0].data.actionType === 'MAINTENANCE_ESCALATION');
    expect(escalation).toBeTruthy();
  });

  it('never auto-approves under DRAFT trust level regardless of confidence/cost', async () => {
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'DRAFT', settings: {} });
    wireStatefulWorkflow(mockWorkflowRow({ state: 'DIAGNOSTIC_QUESTIONS_SENT' }));
    aiClient.setMockHandler(() => JSON.stringify({
      urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'LOW',
      estimatedCostMin: 50, estimatedCostMax: 100, summary: 'Fix leak', reasoning: 'minor',
    }));

    await maintenanceWorkflow.recordTenantReply('wf-1', 'Small leak');

    const approvedTransition = mockPrisma.workflowEvent.create.mock.calls.find((c) => c[0].data.toState === 'APPROVED');
    expect(approvedTransition).toBeFalsy();
    const approvalTransition = mockPrisma.workflowEvent.create.mock.calls.find((c) => c[0].data.toState === 'AWAITING_LANDLORD_APPROVAL');
    expect(approvalTransition).toBeTruthy();
  });

  it('escalates to EMERGENCY_ESCALATED when a tenant reply reveals a previously-missed emergency', async () => {
    const workflow = mockWorkflowRow({ state: 'DIAGNOSTIC_QUESTIONS_SENT' });
    mockPrisma.maintenanceWorkflow.findUnique.mockResolvedValue(workflow);
    mockPrisma.maintenanceWorkflow.update.mockResolvedValue(workflow);
    aiClient.setMockHandler(() => { throw new Error('AI should never be called for an emergency'); });

    await maintenanceWorkflow.recordTenantReply('wf-1', 'Actually I smell gas now too');

    const emergencyTransition = mockPrisma.workflowEvent.create.mock.calls.find((c) => c[0].data.toState === 'EMERGENCY_ESCALATED');
    expect(emergencyTransition).toBeTruthy();
  });

  it('escalates for manual review when the AI triage response fails schema validation', async () => {
    wireStatefulWorkflow(mockWorkflowRow({ state: 'DIAGNOSTIC_QUESTIONS_SENT' }));
    aiClient.setMockHandler(() => 'not valid json');

    await maintenanceWorkflow.recordTenantReply('wf-1', 'It is still leaking');

    const manualTransition = mockPrisma.workflowEvent.create.mock.calls.find((c) => c[0].data.toState === 'ESCALATED_MANUAL');
    expect(manualTransition).toBeTruthy();
  });
});
