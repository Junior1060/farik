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

// The web portal shows the agent's reply in the conversation thread, but a tenant who
// texted in only ever sees SMS. These cover the reply leg back to that channel.
describe('handleTenantMessage — SMS reply leg', () => {
  const TENANT_PHONE = '+15551234567';

  function outboundSms() {
    return mockPrisma.smsMessage.create.mock.calls
      .map((c) => c[0].data)
      .filter((d) => d.direction === 'OUTBOUND');
  }

  beforeEach(() => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants: [{
        tenant: {
          id: 'tenant-1', firstName: 'Alice', lastName: 'Morgan',
          leases: [{
            status: 'ACTIVE',
            unit: {
              id: 'unit-1', name: 'Unit 2B',
              property: { id: 'prop-1', name: 'Maple Court', landlord: { id: 'landlord-1', userId: 'user-1', user: { email: 'll@example.com' } } },
            },
          }],
        },
      }],
    });
    mockPrisma.agentConfig.findUnique.mockResolvedValue({ isEnabled: true, autoMessages: true });
    mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue(null);
    mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'OPERATE_WITHIN_POLICY', settings: {} });
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
    mockPrisma.agentLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrisma.landlordProfile.findUnique.mockResolvedValue({ id: 'landlord-1', userId: 'user-1', user: { email: 'll@example.com' } });
    mockPrisma.notification.create.mockResolvedValue({});
    mockPrisma.smsMessage.create.mockResolvedValue({});
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ smsOptOutAt: null });
  });

  const message = { id: 'msg-1', body: 'When is my rent due?' };

  it('texts a high-confidence auto-response back to a tenant who reached us by SMS', async () => {
    aiClient.setMockHandler(() => JSON.stringify({
      category: 'PAYMENT_QUESTION', confidence: 'HIGH', requiresEscalation: false,
      autoResponse: 'Your rent is due on the 1st of each month.',
      escalationSummary: null, draftResponse: null, reason: 'routine question',
    }));

    await agentService.handleTenantMessage(message, 'conv-1', { smsReplyTo: TENANT_PHONE });

    const sent = outboundSms();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe('Your rent is due on the 1st of each month.');
    expect(sent[0].phoneNumber).toBe(TENANT_PHONE);
    // The conversation record is still written — SMS is an additional channel, not a swap.
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'Your rent is due on the 1st of each month.' }) }),
    );
  });

  it('sends a holding text when the message escalates, so the tenant is not left in silence', async () => {
    aiClient.setMockHandler(() => JSON.stringify({
      category: 'CHARGE_DISPUTE', confidence: 'HIGH', requiresEscalation: true,
      autoResponse: null, escalationSummary: 'Disputes a late fee',
      draftResponse: 'We will look into it.', reason: 'billing dispute',
    }));

    await agentService.handleTenantMessage(message, 'conv-1', { smsReplyTo: TENANT_PHONE });

    const sent = outboundSms();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatch(/passed this to your property manager/i);
    // The tenant is told someone will follow up — never given a made-up answer.
    expect(sent[0].body).not.toMatch(/late fee/i);
  });

  it('sends nothing over SMS for a web-portal message, which passes no reply channel', async () => {
    aiClient.setMockHandler(() => JSON.stringify({
      category: 'PAYMENT_QUESTION', confidence: 'HIGH', requiresEscalation: false,
      autoResponse: 'Your rent is due on the 1st of each month.',
      escalationSummary: null, draftResponse: null, reason: 'routine question',
    }));

    await agentService.handleTenantMessage(message, 'conv-1');

    expect(outboundSms()).toHaveLength(0);
    expect(mockPrisma.message.create).toHaveBeenCalled();
  });

  // The exact production failure this was found by: an invalid ANTHROPIC_API_KEY made the
  // agent throw, the error was logged, and the tenant who texted in got nothing back.
  it('answers when the agent itself fails, without claiming a handoff that never happened', async () => {
    aiClient.setMockHandler(() => { throw new Error('401 authentication_error: API key is invalid.'); });

    await agentService.handleTenantMessage(message, 'conv-1', { smsReplyTo: TENANT_PHONE });

    const sent = outboundSms();
    expect(sent).toHaveLength(1);
    // Nothing was recorded for the landlord on this path, so the handoff promise would be
    // a lie — the tenant is told the truth and asked to retry instead.
    expect(sent[0].body).toMatch(/could not process that just now/i);
    expect(sent[0].body).not.toMatch(/passed this to your property manager/i);
    expect(mockPrisma.escalation?.create).toBeUndefined();
  });

  it('asks a tenant to say more when the AI is merely unsure, instead of escalating', async () => {
    aiClient.setMockHandler(() => JSON.stringify({
      category: 'GENERAL_INQUIRY', confidence: 'LOW', requiresEscalation: false,
      autoResponse: null, escalationSummary: null, draftResponse: null, reason: 'unclear',
    }));

    await agentService.handleTenantMessage(message, 'conv-1', { smsReplyTo: TENANT_PHONE });

    const sent = outboundSms();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatch(/tell me what you need help with/i);
    expect(sent[0].body).not.toMatch(/passed this to your property manager/i);
  });

  it('stays silent on an agent failure for a web-portal message, which has no SMS channel', async () => {
    aiClient.setMockHandler(() => { throw new Error('401 authentication_error: API key is invalid.'); });

    await agentService.handleTenantMessage(message, 'conv-1');

    expect(outboundSms()).toHaveLength(0);
  });

  it('does not text a tenant who has opted out, even on the SMS path', async () => {
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ smsOptOutAt: new Date() });
    aiClient.setMockHandler(() => JSON.stringify({
      category: 'PAYMENT_QUESTION', confidence: 'HIGH', requiresEscalation: false,
      autoResponse: 'Your rent is due on the 1st of each month.',
      escalationSummary: null, draftResponse: null, reason: 'routine question',
    }));

    await agentService.handleTenantMessage(message, 'conv-1', { smsReplyTo: TENANT_PHONE });

    expect(outboundSms()).toHaveLength(0);
  });
});
