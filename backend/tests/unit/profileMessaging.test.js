jest.mock('../../src/lib/prisma', () => ({
  landlordProfile: { update: jest.fn() },
  tenantProfile: { update: jest.fn() },
  user: { update: jest.fn() },
}));

const { getMessagingConfig } = require('../../src/controllers/profileController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.SMS_PROVIDER;
  delete process.env.TWILIO_FROM_NUMBER;
});

afterAll(() => { process.env = ORIGINAL_ENV; });

describe('GET /api/profile/messaging', () => {
  it('reports no messaging number when nothing is configured', async () => {
    const res = mockRes();
    await getMessagingConfig({ user: {} }, res, jest.fn());
    expect(res.body).toEqual({ messagingNumber: null, provider: null });
  });

  it('does not advertise a number while the mock SMS provider is active', async () => {
    process.env.TWILIO_FROM_NUMBER = '+13065550100';
    // SMS_PROVIDER unset → smsProvider.js loads the mock adapter, which sends nothing.
    const res = mockRes();
    await getMessagingConfig({ user: {} }, res, jest.fn());
    expect(res.body.messagingNumber).toBeNull();
    expect(res.body.provider).toBeNull();
  });

  it('does not advertise a number when the provider is set but the number is missing', async () => {
    process.env.SMS_PROVIDER = 'twilio';
    const res = mockRes();
    await getMessagingConfig({ user: {} }, res, jest.fn());
    expect(res.body.messagingNumber).toBeNull();
  });

  it('returns the configured number only when Twilio is actually active', async () => {
    process.env.SMS_PROVIDER = 'twilio';
    process.env.TWILIO_FROM_NUMBER = '+13065550100';
    const res = mockRes();
    await getMessagingConfig({ user: {} }, res, jest.fn());
    expect(res.body).toEqual({ messagingNumber: '+13065550100', provider: 'twilio' });
  });

  it('never emits a placeholder number when unconfigured', async () => {
    const res = mockRes();
    await getMessagingConfig({ user: {} }, res, jest.fn());
    expect(JSON.stringify(res.body)).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
  });
});
