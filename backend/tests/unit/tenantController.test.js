const mockPrisma = {
  tenantProfile: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  user: { findUnique: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const tenantController = require('../../src/controllers/tenantController');

function mockReqRes({ params = {}, body = {}, query = {}, landlordId = 'landlord-1' } = {}) {
  const req = { params, body, query, user: { landlordProfile: { id: landlordId } } };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
  const next = jest.fn();
  return { req, res, next };
}

afterEach(() => jest.clearAllMocks());

describe('tenantController — cross-landlord IDOR protection', () => {
  it('getOne 404s (not the tenant data) when the tenant does not belong to this landlord', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue(null); // ownership check fails
    const { req, res, next } = mockReqRes({ params: { id: 'other-landlords-tenant' } });

    await tenantController.getOne(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.tenantProfile.findUnique).not.toHaveBeenCalled();
  });

  it('getOne returns full tenant detail when ownership check passes', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue({ id: 'tenant-1' });
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ id: 'tenant-1', firstName: 'Alice' });
    const { req, res, next } = mockReqRes({ params: { id: 'tenant-1' } });

    await tenantController.getOne(req, res, next);

    expect(res.body.tenant.firstName).toBe('Alice');
    expect(mockPrisma.tenantProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'tenant-1', leases: { some: { unit: { property: { landlordId: 'landlord-1' } } } } },
    });
  });

  it('update 404s and never calls prisma.update when the tenant belongs to another landlord', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ params: { id: 'other-landlords-tenant' }, body: { firstName: 'Hacked' } });

    await tenantController.update(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.tenantProfile.update).not.toHaveBeenCalled();
  });

  it('remove 404s and never calls prisma.delete when the tenant belongs to another landlord', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ params: { id: 'other-landlords-tenant' } });

    await tenantController.remove(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.tenantProfile.delete).not.toHaveBeenCalled();
  });

  it('lookupByEmail never returns the tenant phone number', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'alice@example.com',
      tenantProfile: { id: 'tenant-1', firstName: 'Alice', phone: '+15551234567' },
    });
    const { req, res, next } = mockReqRes({ query: { email: 'alice@example.com' } });

    await tenantController.lookupByEmail(req, res, next);

    expect(res.body.tenant.phone).toBeUndefined();
    expect(res.body.tenant.firstName).toBe('Alice');
  });
});
