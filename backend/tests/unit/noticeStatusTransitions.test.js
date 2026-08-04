const mockPrisma = {
  tenantProfile: { findFirst: jest.fn() },
  lease: { findFirst: jest.fn() },
  notice: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  activityLog: { create: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const noticeController = require('../../src/controllers/noticeController');

function mockReqRes({ body = {}, id = 'notice-1', landlordId = 'landlord-1' } = {}) {
  const req = { params: { id }, body, user: { role: 'LANDLORD', landlordProfile: { id: landlordId } } };
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
  return { req, res, next: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('noticeController.update — status transitions', () => {
  it('DRAFT → SENT records the status and stamps sentAt', async () => {
    mockPrisma.notice.findFirst.mockResolvedValue({ id: 'notice-1', status: 'DRAFT' });
    mockPrisma.notice.update.mockResolvedValue({ id: 'notice-1', status: 'SENT' });
    const { req, res, next } = mockReqRes({ body: { status: 'SENT' } });

    await noticeController.update(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const { data } = mockPrisma.notice.update.mock.calls[0][0];
    expect(data.status).toBe('SENT');
    expect(data.sentAt).toBeInstanceOf(Date);
  });

  it('DRAFT → DRAFT with an edited body is allowed', async () => {
    mockPrisma.notice.findFirst.mockResolvedValue({ id: 'notice-1', status: 'DRAFT' });
    mockPrisma.notice.update.mockResolvedValue({ id: 'notice-1' });
    const { req, res, next } = mockReqRes({ body: { body: 'Revised wording' } });

    await noticeController.update(req, res, next);

    expect(mockPrisma.notice.update.mock.calls[0][0].data.body).toBe('Revised wording');
    expect(res.statusCode).toBe(200);
  });

  it('refuses to re-stamp a notice already recorded as sent', async () => {
    mockPrisma.notice.findFirst.mockResolvedValue({ id: 'notice-1', status: 'SENT' });
    const { req, res, next } = mockReqRes({ body: { status: 'SENT' } });

    await noticeController.update(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.notice.update).not.toHaveBeenCalled();
  });

  it('refuses to revert a recorded notice back to a draft', async () => {
    mockPrisma.notice.findFirst.mockResolvedValue({ id: 'notice-1', status: 'SENT' });
    const { req, res, next } = mockReqRes({ body: { status: 'DRAFT' } });

    await noticeController.update(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.notice.update).not.toHaveBeenCalled();
  });

  it('refuses to rewrite the body of a recorded notice', async () => {
    mockPrisma.notice.findFirst.mockResolvedValue({ id: 'notice-1', status: 'SENT' });
    const { req, res, next } = mockReqRes({ body: { body: 'Rewritten after the fact' } });

    await noticeController.update(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.notice.update).not.toHaveBeenCalled();
  });

  it('404s and never updates a notice belonging to another landlord', async () => {
    mockPrisma.notice.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ body: { status: 'SENT' } });

    await noticeController.update(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.notice.update).not.toHaveBeenCalled();
    // the ownership check must be scoped to the caller's landlord id
    expect(mockPrisma.notice.findFirst.mock.calls[0][0].where.landlordId).toBe('landlord-1');
  });

  // Guards against anyone reintroducing a status the product cannot honestly reach.
  it.each(['DELIVERED', 'SCHEDULED', 'FAILED', 'AWAITING_APPROVAL'])(
    'rejects the unsupported status %s',
    async (status) => {
      mockPrisma.notice.findFirst.mockResolvedValue({ id: 'notice-1', status: 'DRAFT' });
      const { req, res, next } = mockReqRes({ body: { status } });

      await noticeController.update(req, res, next);

      expect(next).toHaveBeenCalled(); // zod threw → error middleware
      expect(mockPrisma.notice.update).not.toHaveBeenCalled();
    },
  );
});

describe('noticeController.create — status', () => {
  it('defaults to DRAFT with no sentAt', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue({ id: 'tenant-1' });
    mockPrisma.notice.create.mockResolvedValue({ id: 'notice-1' });
    mockPrisma.activityLog.create.mockResolvedValue({});
    const { req, res, next } = mockReqRes({ body: { tenantId: 'tenant-1', title: 'Notice', body: 'Body' } });

    await noticeController.create(req, res, next);

    const { data } = mockPrisma.notice.create.mock.calls[0][0];
    expect(data.status).toBe('DRAFT');
    expect(data.sentAt).toBeNull();
  });

  it('rejects an unsupported status at creation time', async () => {
    const { req, res, next } = mockReqRes({ body: { tenantId: 'tenant-1', title: 'N', body: 'B', status: 'DELIVERED' } });

    await noticeController.create(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockPrisma.notice.create).not.toHaveBeenCalled();
  });
});
