const mockStripe = {
  checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
  webhooks: { constructEvent: jest.fn() },
};
jest.mock('stripe', () => jest.fn(() => mockStripe));

const mockPrisma = {
  payment: { findUnique: jest.fn(), update: jest.fn() },
  transactionLog: { findFirst: jest.fn(), create: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

process.env.FRONTEND_URL = 'https://app.farik.test';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

const stripeController = require('../../src/controllers/stripeController');

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
}

const LANDLORD = { id: 'landlord-1', stripeAccountId: 'acct_123', stripeConnected: true };
const PAYMENT = {
  id: 'pay-1', leaseId: 'lease-1', tenantId: 'tenant-1', amount: 1450.5, status: 'PENDING',
  dueDate: '2026-11-01T00:00:00.000Z', stripeSessionId: null,
  lease: { unit: { name: 'Unit 2B', property: { name: 'Maple Court', address: '12 Main St', city: 'Saskatoon', landlord: LANDLORD } } },
};
const METADATA = { paymentId: 'pay-1', leaseId: 'lease-1', tenantId: 'tenant-1', landlordId: 'landlord-1' };

const tenantReq = (tenantId = 'tenant-1', body = { paymentId: 'pay-1' }) => ({
  body, user: { email: 'alice@example.com', tenantProfile: { id: tenantId } },
});

function settledSession(overrides = {}) {
  return {
    id: 'cs_new', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 145050, currency: 'cad',
    metadata: { ...METADATA }, ...overrides,
  };
}

function webhookReq(session, type = 'checkout.session.completed') {
  mockStripe.webhooks.constructEvent.mockReturnValue({ type, data: { object: session } });
  return { body: Buffer.from('{}'), headers: { 'stripe-signature': 'sig' } };
}

beforeEach(() => {
  mockPrisma.payment.findUnique.mockResolvedValue({ ...PAYMENT });
  mockPrisma.payment.update.mockResolvedValue({});
  mockPrisma.transactionLog.findFirst.mockResolvedValue(null);
  mockPrisma.transactionLog.create.mockResolvedValue({});
  mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.com/cs_new' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('handleWebhook — checkout.session.completed', () => {
  it('400s and touches nothing when the signature does not verify', async () => {
    mockStripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('No signatures found'); });
    const res = mockRes();
    await stripeController.handleWebhook({ body: Buffer.from('{}'), headers: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockPrisma.transactionLog.create).not.toHaveBeenCalled();
  });

  it('marks the payment PAID and writes exactly one ledger row carrying the 1% fee', async () => {
    const res = mockRes();
    await stripeController.handleWebhook(webhookReq(settledSession()), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });

    expect(mockPrisma.payment.update).toHaveBeenCalledTimes(1);
    const { where, data } = mockPrisma.payment.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'pay-1' });
    expect(data).toMatchObject({ status: 'PAID', stripeSessionId: 'cs_new', stripePaymentIntentId: 'pi_1' });
    expect(data.paidDate).toBeInstanceOf(Date);

    expect(mockPrisma.transactionLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.transactionLog.create.mock.calls[0][0].data).toMatchObject({
      paymentId: 'pay-1', leaseId: 'lease-1', tenantId: 'tenant-1', landlordId: 'landlord-1',
      stripeSessionId: 'cs_new', amount: 1450.5, fee: 14.51, currency: 'cad', status: 'completed',
    });
  });

  it('acknowledges a redelivered event without a second ledger row or re-marking the payment', async () => {
    mockPrisma.transactionLog.findFirst.mockResolvedValue({ id: 'tx-1', stripeSessionId: 'cs_new' });
    const res = mockRes();
    await stripeController.handleWebhook(webhookReq(settledSession()), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(mockPrisma.transactionLog.findFirst).toHaveBeenCalledWith({ where: { stripeSessionId: 'cs_new' } });
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockPrisma.transactionLog.create).not.toHaveBeenCalled();
  });

  it('ignores a completed session whose payment has not actually settled', async () => {
    const res = mockRes();
    await stripeController.handleWebhook(webhookReq(settledSession({ payment_status: 'unpaid' })), res);

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockPrisma.transactionLog.create).not.toHaveBeenCalled();
  });

  it('ignores event types it does not handle and sessions carrying no paymentId', async () => {
    let res = mockRes();
    await stripeController.handleWebhook(webhookReq(settledSession(), 'payment_intent.succeeded'), res);
    expect(res.statusCode).toBe(200);

    res = mockRes();
    await stripeController.handleWebhook(webhookReq(settledSession({ metadata: {} })), res);
    expect(res.statusCode).toBe(200);

    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockPrisma.transactionLog.create).not.toHaveBeenCalled();
  });

  it('acknowledges a session for a payment that no longer exists without writing anything', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await stripeController.handleWebhook(webhookReq(settledSession()), res);

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockPrisma.transactionLog.create).not.toHaveBeenCalled();
  });

  it('records a second settled session for an already-PAID payment but flags it as a possible double charge', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({ ...PAYMENT, status: 'PAID', stripeSessionId: 'cs_first' });
    const res = mockRes();
    await stripeController.handleWebhook(webhookReq(settledSession({ id: 'cs_second' })), res);

    expect(res.statusCode).toBe(200);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/double charge/i));
    expect(mockPrisma.transactionLog.create.mock.calls[0][0].data).toMatchObject({
      stripeSessionId: 'cs_second',
      metadata: { ...METADATA, duplicateOfSession: 'cs_first' },
    });
  });

  it('500s so Stripe retries when the database write fails', async () => {
    mockPrisma.payment.update.mockRejectedValue(new Error('connection reset'));
    const res = mockRes();
    await stripeController.handleWebhook(webhookReq(settledSession()), res);

    expect(res.statusCode).toBe(500);
    expect(mockPrisma.transactionLog.create).not.toHaveBeenCalled();
  });
});

describe('createCheckoutSession', () => {
  it('403s when the payment belongs to another tenant', async () => {
    const res = mockRes();
    await stripeController.createCheckoutSession(tenantReq('tenant-2'), res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('400s when the payment is already PAID', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({ ...PAYMENT, status: 'PAID' });
    const res = mockRes();
    await stripeController.createCheckoutSession(tenantReq(), res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('400s with a clear message when the landlord has not connected Stripe', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      ...PAYMENT,
      lease: { unit: { ...PAYMENT.lease.unit, property: { ...PAYMENT.lease.unit.property, landlord: { ...LANDLORD, stripeConnected: false } } } },
    });
    const res = mockRes();
    await stripeController.createCheckoutSession(tenantReq(), res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/landlord has not connected/i);
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('creates a destination charge for the full amount with a 1% application fee and stores the session id', async () => {
    const res = mockRes();
    await stripeController.createCheckoutSession(tenantReq(), res, jest.fn());

    expect(mockStripe.checkout.sessions.retrieve).not.toHaveBeenCalled(); // nothing to reuse yet
    const params = mockStripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.mode).toBe('payment');
    expect(params.line_items[0].price_data.unit_amount).toBe(145050);
    expect(params.line_items[0].price_data.currency).toBe('cad');
    expect(params.payment_intent_data).toMatchObject({ application_fee_amount: 1451, transfer_data: { destination: 'acct_123' } });
    expect(params.metadata).toEqual(METADATA);
    expect(params.customer_email).toBe('alice@example.com');
    expect(params.success_url).toContain('https://app.farik.test/payment/success');

    expect(mockPrisma.payment.update).toHaveBeenCalledWith({ where: { id: 'pay-1' }, data: { stripeSessionId: 'cs_new' } });
    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/cs_new', sessionId: 'cs_new' });
  });

  it('returns the Checkout session already open for this payment instead of minting a second one', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({ ...PAYMENT, stripeSessionId: 'cs_open' });
    mockStripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_open', status: 'open', url: 'https://checkout.stripe.com/cs_open' });
    const res = mockRes();
    await stripeController.createCheckoutSession(tenantReq(), res, jest.fn());

    expect(mockStripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_open');
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/cs_open', sessionId: 'cs_open', reused: true });
  });

  it('409s when the existing session has completed but the webhook has not landed yet', async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({ ...PAYMENT, stripeSessionId: 'cs_done' });
    mockStripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_done', status: 'complete' });
    const res = mockRes();
    await stripeController.createCheckoutSession(tenantReq(), res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', () => mockStripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_old', status: 'expired' })],
    ['unknown to Stripe', () => mockStripe.checkout.sessions.retrieve.mockRejectedValue(new Error('No such checkout.session'))],
  ])('starts a fresh session when the previous one is %s', async (_label, arrange) => {
    mockPrisma.payment.findUnique.mockResolvedValue({ ...PAYMENT, stripeSessionId: 'cs_old' });
    arrange();
    const res = mockRes();
    await stripeController.createCheckoutSession(tenantReq(), res, jest.fn());

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/cs_new', sessionId: 'cs_new' });
  });
});
