const mockPrisma = {
  tenantProfile: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), create: jest.fn() },
  user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  unit: { findFirst: jest.fn(), update: jest.fn() },
  lease: { findMany: jest.fn(), create: jest.fn() },
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

describe('tenantController.create — landlord adds a tenant and their first lease', () => {
  const VALID = {
    firstName: 'Alice',
    lastName: 'Morgan',
    email: ' Alice@Example.com ',
    phone: '(306) 555-0100',
    unitId: 'unit-1',
    startDate: '2026-10-01',
    endDate: '2027-09-30',
    monthlyRent: '1450',
    deposit: '1450',
  };

  beforeEach(() => {
    mockPrisma.unit.findFirst.mockResolvedValue({ id: 'unit-1', isOccupied: false });
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(({ data }) => Promise.resolve({
      id: 'user-1',
      email: data.email,
      role: 'TENANT',
      accountStatus: data.accountStatus,
      tenantProfile: { id: 'tp-1', ...data.tenantProfile.create },
    }));
    mockPrisma.lease.findMany.mockResolvedValue([]); // canLinkTenant: no prior leases
    mockPrisma.lease.create.mockImplementation(({ data }) => Promise.resolve({ id: 'lease-1', ...data }));
    mockPrisma.unit.update.mockResolvedValue({});
  });

  it('creates an INVITED tenant account, the profile, and an active lease in one call', async () => {
    const { req, res, next } = mockReqRes({ body: VALID });
    await tenantController.create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);

    const { data: userData } = mockPrisma.user.create.mock.calls[0][0];
    expect(userData.email).toBe('alice@example.com');
    expect(userData.role).toBe('TENANT');
    expect(userData.accountStatus).toBe('INVITED');
    expect(userData.password).toMatch(/^\$2[aby]\$/); // bcrypt hash of random bytes, never a guessable default
    expect(userData.tenantProfile.create).toEqual({ firstName: 'Alice', lastName: 'Morgan', phone: '(306) 555-0100' });

    const { data: leaseData } = mockPrisma.lease.create.mock.calls[0][0];
    expect(leaseData).toMatchObject({ tenantId: 'tp-1', unitId: 'unit-1', monthlyRent: 1450, deposit: 1450, status: 'ACTIVE' });
    expect(mockPrisma.unit.update).toHaveBeenCalledWith({ where: { id: 'unit-1' }, data: { isOccupied: true } });

    expect(res.body.tenant).toMatchObject({ id: 'tp-1', firstName: 'Alice', user: { email: 'alice@example.com', accountStatus: 'INVITED' } });
    expect(res.body.lease.id).toBe('lease-1');
  });

  it('only accepts units that belong to this landlord', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ body: VALID, landlordId: 'landlord-2' });
    await tenantController.create(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.unit.findFirst).toHaveBeenCalledWith({ where: { id: 'unit-1', property: { landlordId: 'landlord-2' } } });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.lease.create).not.toHaveBeenCalled();
  });

  it('links an existing tenant account instead of creating a duplicate', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-5', email: 'alice@example.com', role: 'TENANT', accountStatus: 'ACTIVE',
      tenantProfile: { id: 'tp-5', firstName: 'Alice', lastName: 'Morgan' },
    });
    const { req, res, next } = mockReqRes({ body: VALID });
    await tenantController.create(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.lease.create.mock.calls[0][0].data.tenantId).toBe('tp-5');
  });

  it('refuses to turn a landlord email into a tenant', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-5', email: 'alice@example.com', role: 'LANDLORD', tenantProfile: null });
    const { req, res, next } = mockReqRes({ body: VALID });
    await tenantController.create(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/landlord account/i);
    expect(mockPrisma.lease.create).not.toHaveBeenCalled();
  });

  it('refuses to attach a tenant who already rents with another landlord', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-5', email: 'alice@example.com', role: 'TENANT', tenantProfile: { id: 'tp-5' } });
    mockPrisma.lease.findMany.mockResolvedValue([{ unit: { property: { landlordId: 'someone-else' } } }]);
    const { req, res, next } = mockReqRes({ body: VALID });
    await tenantController.create(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.lease.create).not.toHaveBeenCalled();
    expect(mockPrisma.unit.update).not.toHaveBeenCalled();
  });

  it('rejects a lease that ends before it starts', async () => {
    const { req, res, next } = mockReqRes({ body: { ...VALID, endDate: '2026-09-01' } });
    await tenantController.create(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/end date/i);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});
