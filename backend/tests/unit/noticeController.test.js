const mockPrisma = {
  tenantProfile: { findFirst: jest.fn() },
  lease: { findFirst: jest.fn() },
  notice: { create: jest.fn() },
  activityLog: { create: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const noticeController = require('../../src/controllers/noticeController');

function mockReqRes({ body = {}, landlordId = 'landlord-1' } = {}) {
  const req = { params: {}, body, user: { landlordProfile: { id: landlordId } } };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req, res, next: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('noticeController.create — cross-landlord IDOR protection', () => {
  it('404s and never creates a notice when the tenant does not belong to this landlord', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ body: { tenantId: 'other-landlords-tenant', title: 'Eviction Notice', body: 'You must vacate' } });

    await noticeController.create(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.notice.create).not.toHaveBeenCalled();
  });

  it('404s when leaseId is given but does not belong to this landlord', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue({ id: 'tenant-1' });
    mockPrisma.lease.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ body: { tenantId: 'tenant-1', leaseId: 'other-lease', title: 'Notice', body: 'Body' } });

    await noticeController.create(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.notice.create).not.toHaveBeenCalled();
  });

  it('creates the notice when tenant ownership checks pass', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue({ id: 'tenant-1' });
    mockPrisma.notice.create.mockResolvedValue({ id: 'notice-1' });
    mockPrisma.activityLog.create.mockResolvedValue({});
    const { req, res, next } = mockReqRes({ body: { tenantId: 'tenant-1', title: 'Notice', body: 'Body' } });

    await noticeController.create(req, res, next);

    expect(res.body.notice.id).toBe('notice-1');
  });
});
