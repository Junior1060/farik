// Integration coverage for the seams Milestone 1 reconnected. Individual modules were
// already well unit-tested; what was broken was the wiring *between* them, so these
// tests exercise real services against a stateful Prisma mock and assert on the
// observable effects (rows written, SMS sent, states reached) rather than on internals.

const mockPrisma = {
  maintenanceRequest: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  maintenanceWorkflow: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  tenantProfile: { findUnique: jest.fn() },
  vendor: { findMany: jest.fn(), findUnique: jest.fn() },
  vendorContactAttempt: { findMany: jest.fn(), create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  appointment: { create: jest.fn(), update: jest.fn() },
  workflowEvent: { create: jest.fn() },
  smsMessage: { create: jest.fn() },
  landlordProfile: { findUnique: jest.fn() },
  agentLog: { create: jest.fn() },
  notification: { create: jest.fn() },
  agentPolicyOverride: { findUnique: jest.fn() },
  agentPolicyDefault: { findUnique: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const aiClient = require('../../src/services/ai/aiClient');
const maintenanceWorkflow = require('../../src/services/workflows/maintenanceWorkflow');
const vendorDispatchService = require('../../src/services/vendorDispatchService');
const workflowEngine = require('../../src/services/workflowEngine');
const { toE164 } = require('../../src/services/sms/phoneNumber');

const TENANT_PHONE = '+15551234567';
const VENDOR_PHONE = '306-555-9999';

function buildRequest(tenantOverrides = {}) {
  return {
    id: 'req-1',
    title: 'Kitchen leak',
    description: 'Water is leaking under the sink',
    tenant: { id: 'tenant-1', firstName: 'Alice', lastName: 'Morgan', phone: TENANT_PHONE, smsConsent: true, smsOptOutAt: null, ...tenantOverrides },
    unit: { id: 'unit-1', name: 'Unit 2B', property: { id: 'prop-1', name: 'Maple Court', landlord: { id: 'landlord-1' } } },
    workflow: null,
  };
}

/**
 * Mirrors real Prisma semantics closely enough that a write is visible to the next
 * read — including the MaintenanceRequest.status projection, which is the whole point
 * of the lifecycle-sync tests below.
 */
function wireState({ workflow, request }) {
  let wfRow = { ...workflow };
  let reqRow = { ...request, status: request.status || 'OPEN', resolvedAt: null };

  mockPrisma.maintenanceWorkflow.findUnique.mockImplementation(() => Promise.resolve({ ...wfRow }));
  mockPrisma.maintenanceWorkflow.create.mockImplementation(({ data }) => {
    wfRow = { id: 'wf-1', ...data };
    return Promise.resolve({ ...wfRow });
  });
  mockPrisma.maintenanceWorkflow.update.mockImplementation(({ data }) => {
    wfRow = { ...wfRow, ...data };
    return Promise.resolve({ ...wfRow });
  });
  mockPrisma.maintenanceWorkflow.updateMany.mockImplementation(({ where, data }) => {
    if (where.state !== undefined && wfRow.state !== where.state) return Promise.resolve({ count: 0 });
    wfRow = { ...wfRow, ...data };
    return Promise.resolve({ count: 1 });
  });

  mockPrisma.maintenanceRequest.findUnique.mockImplementation(() => Promise.resolve({ ...reqRow }));
  mockPrisma.maintenanceRequest.update.mockImplementation(({ data }) => {
    reqRow = { ...reqRow, ...data };
    return Promise.resolve({ ...reqRow });
  });
  mockPrisma.maintenanceRequest.updateMany.mockImplementation(({ data }) => {
    reqRow = { ...reqRow, ...data };
    return Promise.resolve({ count: 1 });
  });

  return { workflow: () => wfRow, request: () => reqRow };
}

function outboundTo(phone) {
  // Providers record the E.164 form they dialled, so compare canonically rather than
  // forcing every fixture in this file to be written as +1XXXXXXXXXX.
  const target = toE164(phone);
  return mockPrisma.smsMessage.create.mock.calls
    .map((c) => c[0].data)
    .filter((m) => m.direction === 'OUTBOUND' && m.phoneNumber === target);
}

function allOutbound() {
  return mockPrisma.smsMessage.create.mock.calls.map((c) => c[0].data).filter((m) => m.direction === 'OUTBOUND');
}

function transitionStates() {
  return mockPrisma.workflowEvent.create.mock.calls.map((c) => c[0].data.toState);
}

const ROUTINE_TRIAGE = JSON.stringify({
  urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'MEDIUM',
  estimatedCostMin: 80, estimatedCostMax: 150, summary: 'Fix the leak', reasoning: 'minor leak',
});

beforeEach(() => {
  mockPrisma.landlordProfile.findUnique.mockResolvedValue({ id: 'landlord-1', userId: 'user-1', user: { email: 'l@example.com' } });
  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.agentLog.create.mockResolvedValue({ id: 'log-1' });
  mockPrisma.smsMessage.create.mockResolvedValue({ id: 'sms-1' });
  mockPrisma.tenantProfile.findUnique.mockResolvedValue({ smsOptOutAt: null });
  mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue(null);
  mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'OPERATE_WITHIN_POLICY', settings: {} });
  mockPrisma.vendor.findMany.mockResolvedValue([
    { id: 'v1', name: 'Bob Plumbing', phone: VENDOR_PHONE, isPreferred: true, avgResponseMinutes: 10 },
  ]);
  mockPrisma.vendor.findUnique.mockResolvedValue({ id: 'v1', name: 'Bob Plumbing', phone: VENDOR_PHONE });
  mockPrisma.vendorContactAttempt.findMany.mockResolvedValue([]);
  mockPrisma.vendorContactAttempt.count.mockResolvedValue(0);
  mockPrisma.vendorContactAttempt.create.mockResolvedValue({ id: 'attempt-1' });
  mockPrisma.vendorContactAttempt.findFirst.mockResolvedValue({ id: 'attempt-1' });
  mockPrisma.appointment.create.mockResolvedValue({ id: 'appt-1' });
});

afterEach(() => {
  aiClient.clearMockHandler();
  jest.clearAllMocks();
});

// ── Workflow reachability (1A) ────────────────────────────────────────────────
describe('workflow reachability without SMS consent', () => {
  it('still creates a workflow for an unreachable tenant, triages, and sends them nothing', async () => {
    const state = wireState({
      request: buildRequest({ phone: null, smsConsent: false }),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'INTAKE_RECEIVED', category: 'PLUMBING_LEAK' },
    });
    aiClient.setMockHandler(() => ROUTINE_TRIAGE);

    await maintenanceWorkflow.startWorkflow('req-1');

    // The workflow exists and progressed past intake rather than parking in
    // DIAGNOSTIC_QUESTIONS_SENT waiting for a reply that could never arrive.
    expect(mockPrisma.maintenanceWorkflow.create).toHaveBeenCalled();
    expect(transitionStates()).toContain('TRIAGED');
    expect(transitionStates()).not.toContain('DIAGNOSTIC_QUESTIONS_SENT');
    // Nothing was texted to a tenant who never consented.
    expect(outboundTo(TENANT_PHONE)).toHaveLength(0);
  });

  it('sends diagnostic questions when the tenant has consented', async () => {
    wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'INTAKE_RECEIVED', category: 'PLUMBING_LEAK' },
    });

    await maintenanceWorkflow.startWorkflow('req-1');

    expect(transitionStates()).toContain('DIAGNOSTIC_QUESTIONS_SENT');
    expect(outboundTo(TENANT_PHONE)).toHaveLength(1);
  });

  it('treats an opted-out tenant as unreachable even though consent was once granted', async () => {
    wireState({
      request: buildRequest({ smsConsent: true, smsOptOutAt: new Date() }),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'INTAKE_RECEIVED', category: 'PLUMBING_LEAK' },
    });
    aiClient.setMockHandler(() => ROUTINE_TRIAGE);

    await maintenanceWorkflow.startWorkflow('req-1');

    expect(transitionStates()).not.toContain('DIAGNOSTIC_QUESTIONS_SENT');
    expect(outboundTo(TENANT_PHONE)).toHaveLength(0);
  });
});

// ── Emergency safety (Scenario C) ─────────────────────────────────────────────
describe('emergency handling', () => {
  it('escalates deterministically without ever calling the AI, and cannot be downgraded', async () => {
    const request = buildRequest();
    request.title = 'Gas smell';
    request.description = 'I smell gas in the kitchen';
    wireState({ request, workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'INTAKE_RECEIVED', category: 'GAS_SMELL' } });
    aiClient.setMockHandler(() => { throw new Error('AI must never be consulted for a deterministic emergency'); });

    await maintenanceWorkflow.startWorkflow('req-1');

    expect(transitionStates()).toContain('EMERGENCY_ESCALATED');
    expect(transitionStates()).not.toContain('DIAGNOSTIC_QUESTIONS_SENT');
    expect(outboundTo(TENANT_PHONE)[0].body).toMatch(/911/);
    expect(mockPrisma.agentLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actionType: 'MAINTENANCE_ESCALATION', status: 'ESCALATED' }) }),
    );
  });
});

// ── Auto-approval reaches a vendor (Scenario B, 1B) ───────────────────────────
describe('auto-approved repair', () => {
  it('runs intake -> triage -> approval -> a real vendor contact attempt with no dead end', async () => {
    const state = wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'DIAGNOSTIC_QUESTIONS_SENT', category: 'PLUMBING_LEAK' },
    });
    aiClient.setMockHandler(() => ROUTINE_TRIAGE);

    await maintenanceWorkflow.recordTenantReply('wf-1', 'Yes, water is dripping from the pipe underneath');

    expect(transitionStates()).toEqual([
      'DIAGNOSTIC_RESPONSE_RECEIVED', 'TRIAGED', 'APPROVED', 'VENDOR_SELECTION', 'VENDOR_CONTACT_ATTEMPTED',
    ]);
    expect(mockPrisma.vendorContactAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vendorId: 'v1', status: 'SENT' }) }),
    );
    expect(outboundTo(VENDOR_PHONE)).toHaveLength(1);
    // Approval is not the resting state, and the request now reads as work under way.
    expect(state.workflow().state).toBe('VENDOR_CONTACT_ATTEMPTED');
    expect(state.request().status).toBe('IN_PROGRESS');
  });

  it('never leaks tenant contact details to the vendor', async () => {
    wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'DIAGNOSTIC_QUESTIONS_SENT', category: 'PLUMBING_LEAK' },
    });
    aiClient.setMockHandler(() => ROUTINE_TRIAGE);

    await maintenanceWorkflow.recordTenantReply('wf-1', 'Still dripping');

    const vendorSms = outboundTo(VENDOR_PHONE)[0].body;
    expect(vendorSms).not.toContain(TENANT_PHONE);
    expect(vendorSms).not.toMatch(/Alice/);
  });
});

// ── Vendor acceptance opens scheduling (1C) ───────────────────────────────────
describe('vendor acceptance', () => {
  it('creates a real Appointment and asks the vendor for availability', async () => {
    const state = wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'VENDOR_CONTACT_ATTEMPTED', category: 'plumbing' },
    });

    await vendorDispatchService.handleVendorResponse('wf-1', 'v1', true);

    expect(transitionStates()).toEqual(['VENDOR_CONFIRMED', 'APPOINTMENT_PROPOSED']);
    expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vendorId: 'v1', proposedTimes: null, status: 'PROPOSED' }) }),
    );
    expect(outboundTo(VENDOR_PHONE)[0].body).toMatch(/two time windows/i);
    expect(state.request().status).toBe('IN_PROGRESS');
  });

  it('moves to the next vendor when the first declines (Scenario D)', async () => {
    wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'VENDOR_CONTACT_ATTEMPTED', category: 'plumbing' },
    });
    mockPrisma.vendorContactAttempt.count.mockResolvedValue(1);
    mockPrisma.vendor.findMany.mockResolvedValue([
      { id: 'v2', name: 'Second Plumbing', phone: '306-555-0000', isPreferred: false, avgResponseMinutes: 20 },
    ]);

    await vendorDispatchService.handleVendorResponse('wf-1', 'v1', false);

    expect(transitionStates()).toEqual(['VENDOR_DECLINED', 'VENDOR_SELECTION', 'VENDOR_CONTACT_ATTEMPTED']);
    expect(outboundTo('306-555-0000')).toHaveLength(1);
    expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
  });
});

// ── Lifecycle synchronisation (1D) ────────────────────────────────────────────
describe('request status follows workflow state', () => {
  async function transitionTo(state, from, to) {
    await workflowEngine.transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
      fromState: from, toState: to, transitions: maintenanceWorkflow.TRANSITIONS,
      actorType: 'SYSTEM', reason: 'test', persist: workflowEngine.maintenancePersist('wf-1'),
    });
    return state.request();
  }

  it('a resolved workflow can never leave the request OPEN', async () => {
    const state = wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'INVOICE_APPROVED', category: 'plumbing' },
    });

    const request = await transitionTo(state, 'INVOICE_APPROVED', 'RESOLVED');

    expect(request.status).toBe('RESOLVED');
    expect(request.resolvedAt).toBeInstanceOf(Date);
  });

  it('a cancelled workflow closes the request as CANCELLED, not RESOLVED, and stamps no completion date', async () => {
    const state = wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'AWAITING_LANDLORD_APPROVAL', category: 'plumbing' },
    });

    const request = await transitionTo(state, 'AWAITING_LANDLORD_APPROVAL', 'CANCELLED');

    expect(request.status).toBe('CANCELLED');
    expect(request.resolvedAt).toBeNull();
  });

  it('keeps escalations OPEN so they stay in the landlord\'s attention count', async () => {
    const state = wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'VENDOR_DECLINED', category: 'plumbing' },
    });

    const request = await transitionTo(state, 'VENDOR_DECLINED', 'ESCALATED_MANUAL');

    expect(request.status).toBe('OPEN');
  });

  it('marks the request IN_PROGRESS as soon as work is approved', async () => {
    const state = wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'TRIAGED', category: 'plumbing' },
    });

    const request = await transitionTo(state, 'TRIAGED', 'APPROVED');

    expect(request.status).toBe('IN_PROGRESS');
  });

  it('rolls the status change back with the transition when the state guard fails', async () => {
    const state = wireState({
      request: buildRequest(),
      workflow: { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'TRIAGED', category: 'plumbing' },
    });

    // Someone else already moved the workflow off TRIAGED.
    await expect(transitionTo(state, 'APPROVED', 'VENDOR_SELECTION')).rejects.toThrow(/was not in expected state/);
    expect(state.request().status).toBe('OPEN');
  });
});
