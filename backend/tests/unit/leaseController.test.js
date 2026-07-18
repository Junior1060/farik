const mockPrisma = {
  unit: { findFirst: jest.fn(), update: jest.fn() },
  lease: { create: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const leaseController = require('../../src/controllers/leaseController');

const validBody = {
  tenantId: 'tenant-1', unitId: 'other-landlords-unit',
  startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 1500, deposit: 1500,
};

function mockReqRes({ body = {}, landlordId = 'landlord-1' } = {}) {
  const req = { params: {}, body, user: { landlordProfile: { id: landlordId } } };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req, res, next: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('leaseController.create — cross-landlord IDOR protection', () => {
  it('404s and never creates a lease when the unit does not belong to this landlord', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ body: validBody });

    await leaseController.create(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.lease.create).not.toHaveBeenCalled();
    expect(mockPrisma.unit.update).not.toHaveBeenCalled();
  });

  it('creates the lease when the unit belongs to this landlord', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
    mockPrisma.lease.create.mockResolvedValue({ id: 'lease-1' });
    mockPrisma.unit.update.mockResolvedValue({});
    const { req, res, next } = mockReqRes({ body: { ...validBody, unitId: 'unit-1' } });

    await leaseController.create(req, res, next);

    expect(res.body.lease.id).toBe('lease-1');
  });
});
