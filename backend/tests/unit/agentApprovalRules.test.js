const mockPrisma = {
  agentLog: { findFirst: jest.fn(), update: jest.fn() },
  notice: { create: jest.fn() },
  message: { create: jest.fn(), deleteMany: jest.fn() },
  conversation: { update: jest.fn() },
  landlordProfile: { findUnique: jest.fn() },
  lease: { findUnique: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);
jest.mock('../../src/services/agentService', () => ({
  getOrCreateConfig: jest.fn(),
  runRentReminderCheck: jest.fn(),
  runLeaseRenewalCheck: jest.fn(),
}));

const agentController = require('../../src/controllers/agentController');

function mockReqRes({ id = 'log-1', landlordId = 'landlord-1' } = {}) {
  const req = { params: { id }, body: {}, user: { id: 'user-1', landlordProfile: { id: landlordId } } };
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
  return { req, res, next: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('approval queue — only ESCALATED logs are actionable', () => {
  it.each(['approveLog', 'rejectLog', 'dismissLog'])(
    '%s scopes its lookup to the caller and to status ESCALATED',
    async (fn) => {
      mockPrisma.agentLog.findFirst.mockResolvedValue(null);
      const { req, res, next } = mockReqRes();

      await agentController[fn](req, res, next);

      const where = mockPrisma.agentLog.findFirst.mock.calls[0][0].where;
      expect(where.landlordId).toBe('landlord-1');
      expect(where.status).toBe('ESCALATED');
      expect(res.statusCode).toBe(404);
      expect(mockPrisma.agentLog.update).not.toHaveBeenCalled();
    },
  );

  it('approveLog 404s for a log belonging to another landlord and creates nothing', async () => {
    mockPrisma.agentLog.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ landlordId: 'landlord-2' });

    await agentController.approveLog(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.notice.create).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });
});

describe('approveLog — executes the stored draft', () => {
  it('creates the notice described by a notice draft and marks the log APPROVED', async () => {
    mockPrisma.agentLog.findFirst.mockResolvedValue({
      id: 'log-1',
      actionType: 'LATE_RENT_NOTICE',
      draftContent: JSON.stringify({
        type: 'notice', tenantId: 'tenant-1', leaseId: 'lease-1', title: 'Late rent notice', body: 'Dear tenant…',
      }),
    });
    mockPrisma.notice.create.mockResolvedValue({ id: 'notice-1' });
    mockPrisma.agentLog.update.mockResolvedValue({ id: 'log-1', status: 'APPROVED' });
    const { req, res, next } = mockReqRes();

    await agentController.approveLog(req, res, next);

    const noticeData = mockPrisma.notice.create.mock.calls[0][0].data;
    expect(noticeData.landlordId).toBe('landlord-1');
    expect(noticeData.tenantId).toBe('tenant-1');
    expect(noticeData.title).toBe('Late rent notice');
    expect(mockPrisma.agentLog.update.mock.calls[0][0].data.status).toBe('APPROVED');
    expect(res.body.log.status).toBe('APPROVED');
  });

  it('posts the message described by a message draft', async () => {
    mockPrisma.agentLog.findFirst.mockResolvedValue({
      id: 'log-1',
      actionType: 'MESSAGE_RESPONSE',
      draftContent: JSON.stringify({ type: 'message', conversationId: 'conv-1', body: 'Thanks for reaching out.' }),
    });
    mockPrisma.landlordProfile.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.agentLog.update.mockResolvedValue({ id: 'log-1', status: 'APPROVED' });
    const { req, res, next } = mockReqRes();

    await agentController.approveLog(req, res, next);

    expect(mockPrisma.message.create.mock.calls[0][0].data.body).toBe('Thanks for reaching out.');
    expect(mockPrisma.notice.create).not.toHaveBeenCalled();
  });

  it('does not blow up on unparseable draft content, and still records the decision', async () => {
    mockPrisma.agentLog.findFirst.mockResolvedValue({ id: 'log-1', actionType: 'MESSAGE_RESPONSE', draftContent: 'not json' });
    mockPrisma.agentLog.update.mockResolvedValue({ id: 'log-1', status: 'APPROVED' });
    const { req, res, next } = mockReqRes();

    await agentController.approveLog(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockPrisma.notice.create).not.toHaveBeenCalled();
    expect(res.body.log.status).toBe('APPROVED');
  });
});

describe('rejectLog / dismissLog — nothing is executed', () => {
  it.each(['rejectLog', 'dismissLog'])('%s marks REJECTED without side effects', async (fn) => {
    mockPrisma.agentLog.findFirst.mockResolvedValue({
      id: 'log-1',
      draftContent: JSON.stringify({ type: 'notice', tenantId: 't1', title: 'x', body: 'y' }),
    });
    mockPrisma.agentLog.update.mockResolvedValue({ id: 'log-1', status: 'REJECTED' });
    const { req, res, next } = mockReqRes();

    await agentController[fn](req, res, next);

    expect(mockPrisma.agentLog.update.mock.calls[0][0].data.status).toBe('REJECTED');
    expect(mockPrisma.notice.create).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });
});

describe('undoLog — only completed actions can be undone', () => {
  it('scopes to status EXECUTED and 404s otherwise', async () => {
    mockPrisma.agentLog.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes();

    await agentController.undoLog(req, res, next);

    expect(mockPrisma.agentLog.findFirst.mock.calls[0][0].where.status).toBe('EXECUTED');
    expect(res.statusCode).toBe(404);
  });
});
