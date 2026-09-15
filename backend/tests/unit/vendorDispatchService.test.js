const mockPrisma = {
  maintenanceWorkflow: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  maintenanceRequest: { findUnique: jest.fn(), updateMany: jest.fn() },
  tenantProfile: { findUnique: jest.fn() },
  vendor: { findMany: jest.fn(), findUnique: jest.fn() },
  appointment: { create: jest.fn() },
  vendorContactAttempt: { findMany: jest.fn(), create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
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

const vendorDispatchService = require('../../src/services/vendorDispatchService');

const baseRequest = {
  id: 'req-1', title: 'Leaking sink',
  tenant: { id: 'tenant-1', phone: '+15551234567', smsConsent: true },
  unit: { id: 'unit-1', name: 'Unit 2B', property: { id: 'prop-1', name: 'Maple Court', landlord: { id: 'landlord-1' } } },
};

function statefulWorkflow(initial) {
  let row = { ...initial };
  mockPrisma.maintenanceWorkflow.findUnique.mockImplementation(() => Promise.resolve({ ...row }));
  mockPrisma.maintenanceWorkflow.update.mockImplementation(({ data }) => {
    row = { ...row, ...data };
    return Promise.resolve({ ...row });
  });
  mockPrisma.maintenanceWorkflow.updateMany.mockImplementation(({ where, data }) => {
    if (where.state !== undefined && row.state !== where.state) return Promise.resolve({ count: 0 });
    row = { ...row, ...data };
    return Promise.resolve({ count: 1 });
  });
  return () => row;
}

beforeEach(() => {
  mockPrisma.maintenanceRequest.findUnique.mockResolvedValue(baseRequest);
  mockPrisma.landlordProfile.findUnique.mockResolvedValue({ id: 'landlord-1', userId: 'user-1', user: { email: 'l@example.com' } });
  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.agentLog.create.mockResolvedValue({ id: 'log-1' });
  mockPrisma.smsMessage.create.mockResolvedValue({});
  mockPrisma.vendorContactAttempt.findMany.mockResolvedValue([]);
  mockPrisma.vendorContactAttempt.count.mockResolvedValue(0);
  mockPrisma.vendorContactAttempt.create.mockResolvedValue({ id: 'attempt-1' });
  mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue(null);
  mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'OPERATE_WITHIN_POLICY', settings: { maxVendorRetries: 2 } });
  mockPrisma.appointment.create.mockResolvedValue({ id: 'appt-1' });
  mockPrisma.vendor.findUnique.mockResolvedValue({ id: 'v1', name: 'Bob Plumbing', phone: '555-9999' });
  mockPrisma.tenantProfile.findUnique.mockResolvedValue({ smsOptOutAt: null }); // optOutGuard lookup
  mockPrisma.maintenanceRequest.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => jest.clearAllMocks());

describe('selectEligibleVendor', () => {
  it('prefers isPreferred vendors over faster-response non-preferred ones', async () => {
    mockPrisma.vendor.findMany.mockResolvedValue([
      { id: 'v1', isPreferred: false, avgResponseMinutes: 5 },
      { id: 'v2', isPreferred: true, avgResponseMinutes: 60 },
    ]);
    const chosen = await vendorDispatchService.selectEligibleVendor('landlord-1', 'plumbing', 'wf-1');
    expect(chosen.id).toBe('v2');
  });

  it('falls back to fastest average response time among equally-preferred vendors', async () => {
    mockPrisma.vendor.findMany.mockResolvedValue([
      { id: 'v1', isPreferred: false, avgResponseMinutes: 45 },
      { id: 'v2', isPreferred: false, avgResponseMinutes: 10 },
    ]);
    const chosen = await vendorDispatchService.selectEligibleVendor('landlord-1', 'plumbing', 'wf-1');
    expect(chosen.id).toBe('v2');
  });

  it('returns null when there are no eligible vendors', async () => {
    mockPrisma.vendor.findMany.mockResolvedValue([]);
    expect(await vendorDispatchService.selectEligibleVendor('landlord-1', 'plumbing', 'wf-1')).toBeNull();
  });
});

describe('dispatchNextVendor', () => {
  it('contacts the selected vendor via SMS and transitions APPROVED -> VENDOR_SELECTION -> VENDOR_CONTACT_ATTEMPTED', async () => {
    statefulWorkflow({ id: 'wf-1', maintenanceRequestId: 'req-1', state: 'APPROVED', category: 'PLUMBING_LEAK' });
    mockPrisma.vendor.findMany.mockResolvedValue([{ id: 'v1', name: 'Bob Plumbing', phone: '555-9999', isPreferred: false, avgResponseMinutes: 10 }]);

    await vendorDispatchService.dispatchNextVendor('wf-1');

    expect(mockPrisma.smsMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phoneNumber: '555-9999' }) }),
    );
    const toStates = mockPrisma.workflowEvent.create.mock.calls.map((c) => c[0].data.toState);
    expect(toStates).toEqual(['VENDOR_SELECTION', 'VENDOR_CONTACT_ATTEMPTED']);
    // Only issue summary shared with vendor — no tenant name/phone in the SMS body.
    const smsBody = mockPrisma.smsMessage.create.mock.calls[0][0].data.body;
    expect(smsBody).not.toMatch(/\+1555/);
  });

  it('escalates to ESCALATED_MANUAL when no eligible vendor exists', async () => {
    statefulWorkflow({ id: 'wf-1', maintenanceRequestId: 'req-1', state: 'APPROVED', category: 'PLUMBING_LEAK' });
    mockPrisma.vendor.findMany.mockResolvedValue([]);

    await vendorDispatchService.dispatchNextVendor('wf-1');

    const toStates = mockPrisma.workflowEvent.create.mock.calls.map((c) => c[0].data.toState);
    expect(toStates).toEqual(['ESCALATED_MANUAL']);
    expect(mockPrisma.agentLog.create).toHaveBeenCalledTimes(1);
  });
});

describe('handleVendorResponse', () => {
  it('moves to VENDOR_CONFIRMED and opens scheduling when the vendor accepts', async () => {
    statefulWorkflow({ id: 'wf-1', maintenanceRequestId: 'req-1', state: 'VENDOR_CONTACT_ATTEMPTED', category: 'PLUMBING_LEAK' });
    mockPrisma.vendorContactAttempt.findFirst.mockResolvedValue({ id: 'attempt-1' });

    await vendorDispatchService.handleVendorResponse('wf-1', 'v1', true);

    expect(mockPrisma.vendorContactAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
    );
    // Acceptance must not be terminal — scheduling opens off the back of it.
    const toStates = mockPrisma.workflowEvent.create.mock.calls.map((c) => c[0].data.toState);
    expect(toStates).toEqual(['VENDOR_CONFIRMED', 'APPOINTMENT_PROPOSED']);

    // A real Appointment row, tied to this vendor, with no invented times.
    expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maintenanceRequestId: 'req-1', vendorId: 'v1', proposedTimes: null, status: 'PROPOSED' }),
      }),
    );

    // The vendor is asked for availability; the tenant is told a vendor is confirmed.
    const outbound = mockPrisma.smsMessage.create.mock.calls.map((c) => c[0].data);
    expect(outbound.find((m) => m.phoneNumber === '555-9999').body).toMatch(/two time windows/i);
    expect(outbound.find((m) => m.phoneNumber === '+15551234567').body).toMatch(/accepted your repair/i);
  });

  it('keeps the vendor acceptance recorded even if opening scheduling fails', async () => {
    statefulWorkflow({ id: 'wf-1', maintenanceRequestId: 'req-1', state: 'VENDOR_CONTACT_ATTEMPTED', category: 'PLUMBING_LEAK' });
    mockPrisma.vendorContactAttempt.findFirst.mockResolvedValue({ id: 'attempt-1' });
    mockPrisma.appointment.create.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(vendorDispatchService.handleVendorResponse('wf-1', 'v1', true)).resolves.toBeTruthy();

    expect(mockPrisma.vendorContactAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
    );
    const toStates = mockPrisma.workflowEvent.create.mock.calls.map((c) => c[0].data.toState);
    expect(toStates).toEqual(['VENDOR_CONFIRMED']);
    console.error.mockRestore();
  });

  it('retries with the next vendor when this one declines and retries remain', async () => {
    statefulWorkflow({ id: 'wf-1', maintenanceRequestId: 'req-1', state: 'VENDOR_CONTACT_ATTEMPTED', category: 'PLUMBING_LEAK' });
    mockPrisma.vendorContactAttempt.findFirst.mockResolvedValue({ id: 'attempt-1' });
    mockPrisma.vendorContactAttempt.count.mockResolvedValue(1); // 1 attempt so far, maxVendorRetries=2
    mockPrisma.vendor.findMany.mockResolvedValue([{ id: 'v2', name: 'Second Plumbing', phone: '555-0000', isPreferred: false, avgResponseMinutes: 20 }]);

    await vendorDispatchService.handleVendorResponse('wf-1', 'v1', false);

    const toStates = mockPrisma.workflowEvent.create.mock.calls.map((c) => c[0].data.toState);
    expect(toStates).toEqual(['VENDOR_DECLINED', 'VENDOR_SELECTION', 'VENDOR_CONTACT_ATTEMPTED']);
    expect(mockPrisma.agentLog.create).not.toHaveBeenCalled();
  });

  it('escalates to manual review after exceeding max vendor retries', async () => {
    statefulWorkflow({ id: 'wf-1', maintenanceRequestId: 'req-1', state: 'VENDOR_CONTACT_ATTEMPTED', category: 'PLUMBING_LEAK' });
    mockPrisma.vendorContactAttempt.findFirst.mockResolvedValue({ id: 'attempt-1' });
    mockPrisma.vendorContactAttempt.count.mockResolvedValue(3); // exceeds maxVendorRetries=2

    await vendorDispatchService.handleVendorResponse('wf-1', 'v1', false);

    const toStates = mockPrisma.workflowEvent.create.mock.calls.map((c) => c[0].data.toState);
    expect(toStates).toEqual(['VENDOR_DECLINED', 'ESCALATED_MANUAL']);
    expect(mockPrisma.agentLog.create).toHaveBeenCalledTimes(1);
  });
});
