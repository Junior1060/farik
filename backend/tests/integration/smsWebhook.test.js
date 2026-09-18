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
  maintenanceRequest: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  lease: { findFirst: jest.fn() },
  escalation: { create: jest.fn() },
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
  mockPrisma.lease.findFirst.mockResolvedValue({
    id: 'lease-1',
    unitId: 'unit-1',
    unit: { id: 'unit-1', name: 'Unit 2B', property: { id: 'prop-1', name: 'Maple Court', landlordId: 'landlord-1' } },
  });
  mockPrisma.maintenanceRequest.create.mockResolvedValue({
    id: 'req-1',
    unit: { id: 'unit-1', name: 'Unit 2B', property: { id: 'prop-1', name: 'Maple Court', landlordId: 'landlord-1' } },
  });
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
      .send({ From: '+15551234567', Body: 'I want to dispute the cleaning fee you charged me last month', MessageSid: 'SM7' });

    expect(res.status).toBe(200);
    const outbound = mockPrisma.smsMessage.create.mock.calls
      .map((c) => c[0].data)
      .filter((d) => d.direction === 'OUTBOUND');
    expect(outbound).toHaveLength(1);
    expect(outbound[0].body).toMatch(/Reply YES/);
    // The tenant's actual message is never swallowed by the consent prompt.
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'I want to dispute the cleaning fee you charged me last month' }) }),
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
      .send({ From: '+15551234567', Body: 'I still want to dispute that cleaning fee you charged me', MessageSid: 'SM8' });

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
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ smsOptOutAt: new Date() }); // what optOutGuard re-reads
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

  // Intent routing. The rule these all serve: escalation means a person genuinely has to
  // take over, not that the classifier was unsure. Greetings and vague messages get
  // answered; only a real handoff is ever described as one.
  describe('intent routing', () => {
    const TENANT = { id: 'tenant-1', userId: 'user-1', phone: '+15551234567', smsConsent: true, smsOptOutAt: null };

    function outbound() {
      return mockPrisma.smsMessage.create.mock.calls
        .map((c) => c[0].data)
        .filter((d) => d.direction === 'OUTBOUND');
    }

    // An escalation is an agentLog row with status ESCALATED plus a landlord notification.
    function escalations() {
      return mockPrisma.agentLog.create.mock.calls
        .map((c) => c[0].data)
        .filter((d) => d.status === 'ESCALATED');
    }

    async function textIn(body, sid = 'SM-intent') {
      return request(buildApp())
        .post('/api/webhooks/sms')
        .type('form')
        .send({ From: '+15551234567', Body: body, MessageSid: sid });
    }

    beforeEach(() => {
      mockPrisma.tenantProfile.findMany.mockResolvedValue([{ ...TENANT, firstName: 'Alice', lastName: 'Morgan' }]);
      mockPrisma.maintenanceWorkflow.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      mockPrisma.smsMessage.findFirst.mockResolvedValue(null);
      mockPrisma.landlordProfile.findUnique.mockResolvedValue({ id: 'landlord-1', userId: 'll-user-1', user: { email: 'll@example.com' } });
      mockPrisma.agentLog.create.mockResolvedValue({ id: 'log-1' });
    });

    it('answers "Hello" as a greeting without creating a request, an escalation or a landlord ping', async () => {
      const res = await textIn('Hello');

      expect(res.status).toBe(200);
      expect(outbound()).toHaveLength(1);
      expect(outbound()[0].body).toMatch(/This is Farik, your property management assistant/);
      expect(escalations()).toHaveLength(0);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockPrisma.maintenanceRequest.create).not.toHaveBeenCalled();
    });

    it('asks "What\'s that?" to clarify rather than escalating', async () => {
      const res = await textIn("What's that?");

      expect(res.status).toBe(200);
      expect(outbound()[0].body).toMatch(/Tell me what you need help with/);
      expect(escalations()).toHaveLength(0);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('asks "Can you help me?" to clarify rather than escalating', async () => {
      const res = await textIn('Can you help me?');

      expect(res.status).toBe(200);
      expect(outbound()[0].body).toMatch(/Tell me what you need help with/);
      expect(escalations()).toHaveLength(0);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('opens a maintenance request for "My sink is leaking", against the unit on the active lease', async () => {
      const res = await textIn('My sink is leaking');

      expect(res.status).toBe(200);
      expect(mockPrisma.maintenanceRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            unitId: 'unit-1', // from the lease, never guessed from the phone number
            description: 'My sink is leaking',
            status: 'OPEN',
          }),
        }),
      );
      // This tenant can receive SMS, so the workflow does the talking — no duplicate ack.
      expect(outbound()).toHaveLength(0);
    });

    it('acknowledges a repair itself when the workflow has no SMS channel to the tenant', async () => {
      mockPrisma.tenantProfile.findMany.mockResolvedValue([
        { ...TENANT, firstName: 'Alice', lastName: 'Morgan', smsConsent: false },
      ]);

      const res = await textIn('My sink is leaking');

      expect(res.status).toBe(200);
      expect(mockPrisma.maintenanceRequest.create).toHaveBeenCalled();
      const bodies = outbound().map((d) => d.body);
      expect(bodies.some((b) => /logged this repair request/i.test(b))).toBe(true);
    });

    it('sends "When is my rent due?" to the AI, which is the only path with the lease data', async () => {
      const res = await textIn('When is my rent due?');

      expect(res.status).toBe(200);
      // Recorded in the conversation and handed to the classifier rather than answered
      // from a canned string that could state a wrong date.
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: 'When is my rent due?' }) }),
      );
      expect(mockPrisma.maintenanceRequest.create).not.toHaveBeenCalled();
    });

    it('escalates "I need to talk to my landlord" and only then promises a handoff', async () => {
      const res = await textIn('I need to talk to my landlord');

      expect(res.status).toBe(200);
      expect(escalations()).toHaveLength(1);
      expect(escalations()[0].summary).toMatch(/asked to speak to a person/i);
      expect(mockPrisma.notification.create).toHaveBeenCalled();
      expect(outbound()[0].body).toMatch(/passed this to your property manager/i);
    });

    it('never promises a handoff when the escalation could not be recorded', async () => {
      // createEscalation returns null when the landlord row is missing — nothing recorded.
      mockPrisma.landlordProfile.findUnique.mockResolvedValue(null);

      const res = await textIn('I need to talk to my landlord');

      expect(res.status).toBe(200);
      expect(escalations()).toHaveLength(0);
      expect(outbound()[0].body).toMatch(/could not process that just now/i);
      expect(outbound()[0].body).not.toMatch(/passed this to your property manager/i);
    });

    it('escalates a second unresolved message instead of asking the same question again', async () => {
      // A clarification already went out inside the window, so this is UNKNOWN, not another
      // round of "tell me more".
      mockPrisma.smsMessage.findFirst.mockResolvedValue({ id: 'prior-clarification' });

      const res = await textIn('??');

      expect(res.status).toBe(200);
      expect(escalations()).toHaveLength(1);
      expect(outbound()[0].body).toMatch(/passed this to your property manager/i);
    });

    it('treats an emergency as urgent maintenance rather than a routine repair', async () => {
      const res = await textIn('I smell gas in the kitchen');

      expect(res.status).toBe(200);
      expect(mockPrisma.maintenanceRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ description: 'I smell gas in the kitchen' }) }),
      );
    });

    it('answers the HELP keyword without touching consent state', async () => {
      const res = await textIn('HELP');

      expect(res.status).toBe(200);
      expect(outbound()[0].body).toMatch(/Reply STOP to opt out/);
      expect(mockPrisma.tenantProfile.update).not.toHaveBeenCalled();
      expect(escalations()).toHaveLength(0);
    });

    // Found in production: an Anthropic billing error surfaced as `POST /api/webhooks/sms
    // 400` with the provider's message in the response body. recordTenantReply saves the
    // answer and then runs AI triage, and the controller awaited both halves.
    it('returns 200 and keeps the provider error to itself when AI triage fails mid-diagnostic', async () => {
      const wf = { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'DIAGNOSTIC_QUESTIONS_SENT', category: 'PLUMBING_LEAK', diagnosticAnswers: null };
      mockPrisma.maintenanceWorkflow.findFirst.mockResolvedValue(wf);
      wireStatefulWorkflow(wf);
      mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req-1', title: 'Leak', description: 'Water under the sink',
        tenant: { id: 'tenant-1', firstName: 'Alice', lastName: 'Morgan', phone: '+15551234567', smsConsent: true },
        unit: { id: 'unit-1', name: 'Unit 2B', property: { id: 'prop-1', name: 'Maple Court', landlord: { id: 'landlord-1' } } },
      });
      const billingError = Object.assign(
        new Error('Your credit balance is too low to access the Anthropic API.'),
        { status: 400 },
      );
      aiClient.setMockHandler(() => { throw billingError; });

      const res = await textIn('yes it is still leaking');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      // The provider's wording must never reach an external caller.
      expect(JSON.stringify(res.body)).not.toMatch(/credit balance/i);
      // And the tenant hears something true: their answer is saved, do not resend.
      const bodies = outbound().map((d) => d.body);
      expect(bodies.some((b) => /saved your answer/i.test(b))).toBe(true);
      expect(bodies.some((b) => /No need to resend/i.test(b))).toBe(true);
    });

    it('returns 200 when vendor reply handling throws', async () => {
      mockPrisma.tenantProfile.findMany.mockResolvedValue([]);
      mockPrisma.vendor.findMany.mockResolvedValue([{ id: 'vendor-1', phone: '+15559998888' }]);
      mockPrisma.vendorContactAttempt.findFirst.mockRejectedValue(new Error('db exploded'));

      const res = await request(buildApp())
        .post('/api/webhooks/sms')
        .type('form')
        .send({ From: '+15559998888', Body: 'YES', MessageSid: 'SM-vendor-fail' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });
    it('still routes a mid-diagnostic reply to the workflow, not the intent classifier', async () => {
      // "yes" would otherwise look like a low-information message worth clarifying.
      const wf = { id: 'wf-1', maintenanceRequestId: 'req-1', state: 'DIAGNOSTIC_QUESTIONS_SENT', category: 'PLUMBING_LEAK', diagnosticAnswers: null };
      mockPrisma.maintenanceWorkflow.findFirst.mockResolvedValue(wf);
      wireStatefulWorkflow(wf);
      mockPrisma.maintenanceRequest.findUnique.mockResolvedValue({
        id: 'req-1', title: 'Leak', description: 'Water under the sink',
        tenant: { id: 'tenant-1', firstName: 'Alice', lastName: 'Morgan', phone: '+15551234567', smsConsent: true },
        unit: { id: 'unit-1', name: 'Unit 2B', property: { id: 'prop-1', name: 'Maple Court', landlord: { id: 'landlord-1' } } },
      });
      aiClient.setMockHandler(() => JSON.stringify({
        urgency: 'ROUTINE', confidence: 'HIGH', category: 'plumbing', priority: 'MEDIUM',
        estimatedCostMin: 80, estimatedCostMax: 150, summary: 'Fix leak', reasoning: 'minor leak',
      }));

      const res = await textIn('yes it is still leaking');

      expect(res.status).toBe(200);
      // Not re-filed as a new repair, and never answered with "tell me what you need" —
      // the reply belongs to the workflow that asked the question.
      expect(mockPrisma.maintenanceRequest.create).not.toHaveBeenCalled();
      const bodies = outbound().map((d) => d.body);
      expect(bodies.some((b) => /Tell me what you need help with/i.test(b))).toBe(false);
      expect(bodies.some((b) => /This is Farik, your property management assistant/i.test(b))).toBe(false);
    });
  });
});
