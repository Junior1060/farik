const mockPrisma = {
  maintenanceRequest: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  lease: { findFirst: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);
jest.mock('../../src/services/agentService', () => ({ triageMaintenanceRequest: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/policyEngine', () => ({ getEffectivePolicy: jest.fn() }));
jest.mock('../../src/services/workflows/maintenanceWorkflow', () => ({ startWorkflow: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/vendorDispatchService', () => ({}));

const maintenanceController = require('../../src/controllers/maintenanceController');

function mockReqRes({ params = {}, body = {}, landlordId = 'landlord-1', tenantId = 'tenant-1' } = {}) {
  const req = { params, body, files: [], user: { landlordProfile: { id: landlordId }, tenantProfile: { id: tenantId } } };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req, res, next: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('maintenanceController.create — tenant/unit ownership protection', () => {
  it('404s and never creates a request when the tenant has no lease on the given unit', async () => {
    mockPrisma.lease.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ body: { unitId: 'someone-elses-unit', title: 'Leak', description: 'Kitchen sink leaking' } });

    await maintenanceController.create(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.maintenanceRequest.create).not.toHaveBeenCalled();
  });

  it('creates the request when the tenant holds a lease on the unit', async () => {
    mockPrisma.lease.findFirst.mockResolvedValue({ id: 'lease-1' });
    mockPrisma.maintenanceRequest.create.mockResolvedValue({
      id: 'req-1',
      tenant: { phone: null, smsConsent: false },
      unit: { property: { landlordId: 'landlord-1', id: 'prop-1' } },
    });
    const { req, res, next } = mockReqRes({ body: { unitId: 'unit-1', title: 'Leak', description: 'Kitchen sink leaking' } });

    await maintenanceController.create(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(res.body.request.id).toBe('req-1');
  });
});

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
