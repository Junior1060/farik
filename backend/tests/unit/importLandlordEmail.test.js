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

const row = {
  _id: 'row-0', _valid: true,
  propertyName: 'Maple Court', propertyAddress: '123 Main St', propertyCity: 'Vancouver', propertyState: 'BC', propertyZip: 'V6B1A1',
  unitNumber: 'Unit 1', bedrooms: '2', bathrooms: '1', sqft: '850',
  tenantFirstName: 'Jordan', tenantLastName: 'Blake', tenantEmail: 'jordan@blakerentals.com', tenantPhone: '',
  leaseStartDate: '2026-01-01', leaseEndDate: '2027-01-01', monthlyRent: '2000', securityDeposit: '2000',
  paymentDueDay: '1', leaseStatus: 'ACTIVE', notes: '', parkingInfo: '', utilitiesIncluded: '',
};

beforeEach(() => {
  mockPrisma.property.findFirst.mockResolvedValue({ id: 'prop-1', name: 'Maple Court' });
  mockPrisma.unit.findFirst.mockResolvedValue(null);
  mockPrisma.unit.create.mockResolvedValue({ id: 'unit-1' });
});

afterEach(() => jest.clearAllMocks());

describe('importController.confirm — a landlord login is never turned into a tenant', () => {
  it('reports the row as an error and creates no profile, lease or payment', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-landlord', role: 'LANDLORD' });
    const req = { body: { rows: [row] }, user: { landlordProfile: { id: 'landlord-1' } } };
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };

    await importController.confirm(req, res, jest.fn());

    expect(res.body.results.errors).toEqual([{ row: 'row-0', message: expect.stringMatching(/landlord account/i) }]);
    expect(res.body.results.leases).toBe(0);
    expect(mockPrisma.tenantProfile.create).not.toHaveBeenCalled();
    expect(mockPrisma.lease.create).not.toHaveBeenCalled();
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });
});
