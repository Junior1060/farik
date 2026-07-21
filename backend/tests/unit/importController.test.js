const mockPrisma = {
  property: { findFirst: jest.fn(), create: jest.fn() },
  unit: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn() },
  tenantProfile: { findUnique: jest.fn(), create: jest.fn() },
  lease: { create: jest.fn(), findMany: jest.fn() },
  payment: { create: jest.fn() },
  importBatch: { create: jest.fn().mockResolvedValue({}) },
  activityLog: { create: jest.fn().mockResolvedValue({}) },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const importController = require('../../src/controllers/importController');

function mockReqRes({ body = {}, landlordId = 'landlord-1' } = {}) {
  const req = { body, user: { landlordProfile: { id: landlordId } } };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req, res, next: jest.fn() };
}

const validRow = {
  _id: 'row-0', _valid: true,
  propertyName: 'Maple Court', propertyAddress: '123 Main St', propertyCity: 'Vancouver', propertyState: 'BC', propertyZip: 'V6B1A1',
  unitNumber: 'Unit 1', bedrooms: '2', bathrooms: '1', sqft: '850',
  tenantFirstName: 'Alice', tenantLastName: 'Morgan', tenantEmail: 'alice@example.com', tenantPhone: '',
  leaseStartDate: '2026-01-01', leaseEndDate: '2027-01-01', monthlyRent: '2000', securityDeposit: '2000',
  paymentDueDay: '1', leaseStatus: 'ACTIVE', notes: '', parkingInfo: '', utilitiesIncluded: '',
};

beforeEach(() => {
  mockPrisma.property.findFirst.mockResolvedValue(null);
  mockPrisma.property.create.mockResolvedValue({ id: 'prop-1', name: 'Maple Court' });
  mockPrisma.unit.findFirst.mockResolvedValue(null);
  mockPrisma.unit.create.mockResolvedValue({ id: 'unit-1' });
  mockPrisma.unit.update.mockResolvedValue({});
  mockPrisma.lease.create.mockResolvedValue({ id: 'lease-1' });
  mockPrisma.payment.create.mockResolvedValue({ id: 'payment-1' });
  mockPrisma.user.create.mockResolvedValue({ id: 'new-user-1' });
  mockPrisma.tenantProfile.create.mockResolvedValue({ id: 'new-tenant-1' });
  mockPrisma.lease.findMany.mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

describe('importController.confirm — cross-landlord tenant-linking protection', () => {
  it('creates a lease for a brand-new tenant email (no existing user)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null); // no existing account for this email
    mockPrisma.tenantProfile.findUnique.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ body: { rows: [validRow] } });

    await importController.confirm(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.body.results.leases).toBe(1);
    expect(res.body.results.errors).toHaveLength(0);
  });

  it('skips the row with an error when the email belongs to a tenant who already has a lease with another landlord', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ id: 'tenant-1' });
    mockPrisma.lease.findMany.mockResolvedValue([{ unit: { property: { landlordId: 'some-other-landlord' } } }]);
    const { req, res, next } = mockReqRes({ body: { rows: [validRow] } });

    await importController.confirm(req, res, next);

    expect(mockPrisma.lease.create).not.toHaveBeenCalled();
    expect(res.body.results.leases).toBe(0);
    expect(res.body.results.errors).toHaveLength(1);
    expect(res.body.results.errors[0].message).toMatch(/already has a lease with another landlord/);
  });

  it('still creates the lease when the existing tenant already belongs to this same landlord', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ id: 'tenant-1' });
    mockPrisma.lease.findMany.mockResolvedValue([{ unit: { property: { landlordId: 'landlord-1' } } }]);
    const { req, res, next } = mockReqRes({ body: { rows: [validRow] }, landlordId: 'landlord-1' });

    await importController.confirm(req, res, next);

    expect(res.body.results.leases).toBe(1);
    expect(res.body.results.errors).toHaveLength(0);
  });
});
