const mockPrisma = {
  maintenanceRequest: { findFirst: jest.fn(), update: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const maintenanceController = require('../../src/controllers/maintenanceController');

function mockReqRes({ params = {}, body = {}, landlordId = 'landlord-1' } = {}) {
  const req = { params, body, user: { landlordProfile: { id: landlordId } } };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req, res, next: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('maintenanceController.update — cross-landlord IDOR protection', () => {
  it('404s and never updates when the maintenance request does not belong to this landlord', async () => {
    mockPrisma.maintenanceRequest.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ params: { id: 'other-landlords-request' }, body: { status: 'RESOLVED' } });

    await maintenanceController.update(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.maintenanceRequest.update).not.toHaveBeenCalled();
  });

  it('updates when ownership check passes', async () => {
    mockPrisma.maintenanceRequest.findFirst.mockResolvedValue({ id: 'req-1' });
    mockPrisma.maintenanceRequest.update.mockResolvedValue({ id: 'req-1', status: 'RESOLVED' });
    const { req, res, next } = mockReqRes({ params: { id: 'req-1' }, body: { status: 'RESOLVED' } });

    await maintenanceController.update(req, res, next);

    expect(res.body.request.status).toBe('RESOLVED');
  });
});
