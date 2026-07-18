const mockPrisma = {
  tenantProfile: { findUnique: jest.fn() },
  smsMessage: { create: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const mockSmsProvider = require('../../src/services/sms/mockSmsProvider');

afterEach(() => jest.clearAllMocks());

describe('mockSmsProvider.sendSms — opt-out choke point', () => {
  it('skips sending and does not write an SmsMessage row when the tenant has opted out', async () => {
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ smsOptOutAt: new Date() });

    const result = await mockSmsProvider.sendSms({ to: '+15551234567', body: 'Reminder', tenantId: 'tenant-1' });

    expect(result.status).toBe('FAILED');
    expect(mockPrisma.smsMessage.create).not.toHaveBeenCalled();
  });

  it('sends normally when the tenant has not opted out', async () => {
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ smsOptOutAt: null });
    mockPrisma.smsMessage.create.mockResolvedValue({});

    const result = await mockSmsProvider.sendSms({ to: '+15551234567', body: 'Reminder', tenantId: 'tenant-1' });

    expect(result.status).toBe('SENT');
    expect(mockPrisma.smsMessage.create).toHaveBeenCalled();
  });

  it('sends normally when no tenantId is given (e.g. a vendor SMS)', async () => {
    mockPrisma.smsMessage.create.mockResolvedValue({});

    const result = await mockSmsProvider.sendSms({ to: '+15559998888', body: 'New job request' });

    expect(result.status).toBe('SENT');
    expect(mockPrisma.tenantProfile.findUnique).not.toHaveBeenCalled();
  });
});
