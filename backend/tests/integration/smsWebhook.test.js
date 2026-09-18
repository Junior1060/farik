const express = require('express');
const request = require('supertest');

const mockPrisma = {
  tenantProfile: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  vendor: { findMany: jest.fn(), findUnique: jest.fn() },
  appointment: { create: jest.fn() },
  smsMessage: { create: jest.fn(), findFirst: jest.fn() },
  maintenanceWorkflow: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  vendorContactAttempt: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  conversation: { findFirst: jest.fn(), create: jest.fn() },
  message: { create: jest.fn() },
  maintenanceRequest: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  workflowEvent: { create: jest.fn() },
  landlordProfile: { findUnique: jest.fn() },
  agentLog: { create: jest.fn() },
  notification: { create: jest.fn() },
  agentPolicyOverride: { findUnique: jest.fn() },
  agentPolicyDefault: { findUnique: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const aiClient = require('../../src/services/ai/aiClient');

function wireStatefulWorkflow(initial) {
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

function buildApp() {
  const app = express();
  app.use('/api/webhooks/sms', express.urlencoded({ extended: false }));
  app.use('/api/webhooks', require('../../src/routes/webhooks'));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message })); // eslint-disable-line no-unused-vars
  return app;
}

beforeEach(() => {
  delete process.env.SMS_PROVIDER; // default: mock provider (always-valid signature)
  mockPrisma.smsMessage.create.mockResolvedValue({});
  mockPrisma.vendor.findMany.mockResolvedValue([]);
  mockPrisma.agentPolicyOverride.findUnique.mockResolvedValue(null);
  mockPrisma.agentPolicyDefault.findUnique.mockResolvedValue({ trustLevel: 'OPERATE_WITHIN_POLICY', settings: {} });
  mockPrisma.maintenanceWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.tenantProfile.findUnique.mockResolvedValue({ smsOptOutAt: null });
  mockPrisma.tenantProfile.update.mockResolvedValue({});
  mockPrisma.smsMessage.findFirst.mockResolvedValue(null); // no prior consent prompt
  mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
  mockPrisma.vendorContactAttempt.findMany.mockResolvedValue([]);
  mockPrisma.vendorContactAttempt.count.mockResolvedValue(0);
  mockPrisma.vendorContactAttempt.create.mockResolvedValue({ id: 'attempt-1' });
  mockPrisma.appointment.create.mockResolvedValue({ id: 'appt-1' });
  mockPrisma.maintenanceRequest.updateMany.mockResolvedValue({ count: 1 }); // status projection
});

afterEach(() => {
  aiClient.clearMockHandler();
  jest.clearAllMocks();
  delete process.env.NODE_ENV;
});

describe('POST /api/webhooks/sms', () => {
  it('refuses all requests (403) when NODE_ENV=production and SMS_PROVIDER is not "twilio" — fail-closed, not fail-open', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SMS_PROVIDER; // misconfigured — would otherwise silently fall back to the always-valid mock signature
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15551234567', Body: 'hello', MessageSid: 'SM1' });

    expect(res.status).toBe(403);
    expect(mockPrisma.smsMessage.create).not.toHaveBeenCalled();
  });

  it('rejects a request with an invalid Twilio signature (403) and writes nothing to the DB', async () => {
    process.env.SMS_PROVIDER = 'twilio';
    process.env.TWILIO_AUTH_TOKEN = 'test-token';
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .set('X-Twilio-Signature', 'totally-invalid-signature')
      .type('form')
      .send({ From: '+15551234567', Body: 'hello', MessageSid: 'SM123' });

    expect(res.status).toBe(403);
    expect(mockPrisma.smsMessage.create).not.toHaveBeenCalled();

    delete process.env.SMS_PROVIDER;
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  it('replies with a not-recognized message and does not leak account info for an unmatched phone number', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([]);
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+19995550000', Body: 'hi there', MessageSid: 'SM1' });

    expect(res.status).toBe(200);
    expect(mockPrisma.smsMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: null, direction: 'INBOUND' }) }),
    );
  });


  // The Add Tenant form stores whatever the landlord typed ("3062093660"), while Twilio
  // always delivers E.164 ("+13062093660"). Comparing those raw sent every real tenant
  // down the unmatched branch and replied "we could not match this number".
  it('matches a tenant stored without a country code against the E.164 number Twilio sends', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([
      { id: 'tenant-1', userId: 'user-1', phone: '3062093660', smsConsent: true },
    ]);
    mockPrisma.maintenanceWorkflow.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+13062093660', Body: 'my sink is leaking', MessageSid: 'SM-e164' });

    expect(res.status).toBe(200);
    // Attribution on the inbound row is the proof the lookup matched.
    expect(mockPrisma.smsMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1', direction: 'INBOUND' }) }),
    );
    const bodies = mockPrisma.smsMessage.create.mock.calls.map((c) => c[0].data.body);
    expect(bodies.some((b) => /could not match this number/i.test(b))).toBe(false);
  });
  it('routes a matched tenant reply into an open diagnostic workflow', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([
      { id: 'tenant-1', userId: 'user-1', phone: '+15551234567' },
    ]);
    mockPrisma.maintenanceWorkflow.findFirst.mockResolvedValue({ id: 'wf-1', maintenanceRequestId: 'req-1', state: 'DIAGNOSTIC_QUESTIONS_SENT', category: 'PLUMBING_LEAK', diagnosticAnswers: null });
    wireStatefulWorkflow({ id: 'wf-1', maintenanceRequestId: 'req-1', state: 'DIAGNOSTIC_QUESTIONS_SENT', category: 'PLUMBING_LEAK', diagnosticAnswers: null });
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({
      id: 'req-1', title: 'Leak', description: 'Water under the sink',
      tenant: { id: 'tenant-1', firstName: 'Alice', lastName: 'Morgan', phone: '+15551234567', smsConsent: true },
      unit: { id: 'unit-1', name: 'Unit 2B', property: { id: 'prop-1', name: 'Maple Court', landlord: { id: 'landlord-1' } } },
    });

    aiClient.setMockHandler(() => JSON.stringify({
      urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'MEDIUM',
      estimatedCostMin: 80, estimatedCostMax: 150, summary: 'Fix leak', reasoning: 'minor leak',
    }));

    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15551234567', Body: 'Yes it is actively leaking', MessageSid: 'SM2' });

    expect(res.status).toBe(200);
    expect(mockPrisma.maintenanceWorkflow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ state: 'DIAGNOSTIC_QUESTIONS_SENT' }) }),
    );
    // The reply was recorded and a workflow transition was attempted (proves routing worked).
    expect(mockPrisma.workflowEvent.create).toHaveBeenCalled();
  });

  it('routes a vendor YES reply to handleVendorResponse', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([]);
    mockPrisma.vendor.findMany.mockResolvedValue([{ id: 'vendor-1', phone: '+15559998888' }]);
    mockPrisma.vendorContactAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', maintenanceWorkflowId: 'wf-1' });
    mockPrisma.maintenanceWorkflow.findUnique.mockResolvedValue({ id: 'wf-1', maintenanceRequestId: 'req-1', state: 'VENDOR_CONTACT_ATTEMPTED' });
    mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({
      id: 'req-1', title: 'Leak',
      tenant: { id: 'tenant-1', phone: '+15551234567', smsConsent: true },
      unit: { id: 'unit-1', name: 'Unit 2B', property: { id: 'prop-1', name: 'Maple Court', landlord: { id: 'landlord-1' } } },
    });

    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15559998888', Body: 'YES', MessageSid: 'SM3' });

    expect(res.status).toBe(200);
    expect(mockPrisma.vendorContactAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
    );
  });

  // Regression guard: Vendor.phone is a required column, so a `{ not: null }` filter is a
  // Prisma validation error that only fires in production — the mocked client here accepts
  // any argument shape, so assert the query itself rather than trusting the mock's return.
  it('queries vendors without a nullability filter on the required phone column', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([]);
    mockPrisma.vendor.findMany.mockResolvedValue([]);

    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15550000000', Body: 'hello', MessageSid: 'SM-novendor' });

    expect(res.status).toBe(200);
    expect(mockPrisma.vendor.findMany).toHaveBeenCalled();
    const [args] = mockPrisma.vendor.findMany.mock.calls[0];
    expect(args?.where?.phone).toBeUndefined();
  });
  it('records opt-out and sends a confirmation when a matched tenant replies STOP, without touching any workflow', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([{ id: 'tenant-1', userId: 'user-1', phone: '+15551234567' }]);
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15551234567', Body: 'STOP', MessageSid: 'SM4' });

    expect(res.status).toBe(200);
    expect(mockPrisma.tenantProfile.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' }, data: { smsOptOutAt: expect.any(Date) },
    });
    expect(mockPrisma.maintenanceWorkflow.findFirst).not.toHaveBeenCalled();
  });

  it('clears opt-out and records consent when a previously opted-out tenant replies START', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([{ id: 'tenant-1', userId: 'user-1', phone: '+15551234567', smsOptOutAt: new Date() }]);
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15551234567', Body: 'START', MessageSid: 'SM5' });

    expect(res.status).toBe(200);
    expect(mockPrisma.tenantProfile.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: {
        smsOptOutAt: null,
        smsConsent: true,
        smsConsentAt: expect.any(Date),
        smsConsentSource: 'SMS_REPLY_START',
      },
    });
  });

  it('records consent as a double opt-in when a never-consented tenant replies YES', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([
      { id: 'tenant-1', userId: 'user-1', phone: '+15551234567', smsConsent: false, smsOptOutAt: null },
    ]);
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15551234567', Body: 'YES', MessageSid: 'SM6' });

    expect(res.status).toBe(200);
    expect(mockPrisma.tenantProfile.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: {
        smsOptOutAt: null,
        smsConsent: true,
        smsConsentAt: expect.any(Date),
        smsConsentSource: 'SMS_DOUBLE_OPT_IN',
      },
    });
  });

  it('asks an unconsented tenant for consent once, and still records what they said', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([
      { id: 'tenant-1', userId: 'user-1', phone: '+15551234567', smsConsent: false, smsOptOutAt: null },
    ]);
    mockPrisma.maintenanceWorkflow.findFirst.mockResolvedValue(null);
    mockPrisma.smsMessage.findFirst.mockResolvedValue(null); // not asked before
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15551234567', Body: 'my sink is leaking', MessageSid: 'SM7' });

    expect(res.status).toBe(200);
    const outbound = mockPrisma.smsMessage.create.mock.calls
      .map((c) => c[0].data)
      .filter((d) => d.direction === 'OUTBOUND');
    expect(outbound).toHaveLength(1);
    expect(outbound[0].body).toMatch(/Reply YES/);
    // The tenant's actual message is never swallowed by the consent prompt.
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'my sink is leaking' }) }),
    );
  });

  it('does not re-ask a tenant who was already prompted for consent recently', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([
      { id: 'tenant-1', userId: 'user-1', phone: '+15551234567', smsConsent: false, smsOptOutAt: null },
    ]);
    mockPrisma.maintenanceWorkflow.findFirst.mockResolvedValue(null);
    mockPrisma.smsMessage.findFirst.mockResolvedValue({ id: 'prior-prompt' }); // asked already
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15551234567', Body: 'still leaking', MessageSid: 'SM8' });

    expect(res.status).toBe(200);
    const outbound = mockPrisma.smsMessage.create.mock.calls
      .map((c) => c[0].data)
      .filter((d) => d.direction === 'OUTBOUND');
    expect(outbound).toHaveLength(0);
  });

  it('never prompts a tenant who has opted out', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([
      { id: 'tenant-1', userId: 'user-1', phone: '+15551234567', smsConsent: false, smsOptOutAt: new Date() },
    ]);
    mockPrisma.maintenanceWorkflow.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15551234567', Body: 'hello', MessageSid: 'SM9' });

    expect(res.status).toBe(200);
    expect(mockPrisma.smsMessage.findFirst).not.toHaveBeenCalled();
    const outbound = mockPrisma.smsMessage.create.mock.calls
      .map((c) => c[0].data)
      .filter((d) => d.direction === 'OUTBOUND');
    expect(outbound).toHaveLength(0);
  });
});
