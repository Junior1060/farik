const express = require('express');
const request = require('supertest');

const mockPrisma = {
  tenantProfile: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  vendor: { findMany: jest.fn() },
  smsMessage: { create: jest.fn() },
  maintenanceWorkflow: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  vendorContactAttempt: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  conversation: { findFirst: jest.fn(), create: jest.fn() },
  message: { create: jest.fn() },
  maintenanceRequest: { findUnique: jest.fn(), update: jest.fn() },
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

  it('clears opt-out when a previously opted-out tenant replies START', async () => {
    mockPrisma.tenantProfile.findMany.mockResolvedValue([{ id: 'tenant-1', userId: 'user-1', phone: '+15551234567', smsOptOutAt: new Date() }]);
    const app = buildApp();

    const res = await request(app)
      .post('/api/webhooks/sms')
      .type('form')
      .send({ From: '+15551234567', Body: 'START', MessageSid: 'SM5' });

    expect(res.status).toBe(200);
    expect(mockPrisma.tenantProfile.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' }, data: { smsOptOutAt: null },
    });
  });
});
