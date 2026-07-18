const mockPrisma = {
  lease: { findFirst: jest.fn() },
  payment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const paymentController = require('../../src/controllers/paymentController');

function mockReqRes({ params = {}, body = {}, query = {}, landlordId = 'landlord-1' } = {}) {
  const req = { params, body, query, user: { landlordProfile: { id: landlordId } } };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
  const next = jest.fn();
  return { req, res, next };
}

afterEach(() => jest.clearAllMocks());

describe('paymentController.create — cross-landlord IDOR protection', () => {
  const validBody = { leaseId: 'lease-1', tenantId: 'attacker-supplied-tenant-id', amount: 1500, dueDate: '2026-08-01' };

  it('404s and never creates a payment when the lease does not belong to this landlord', async () => {
    mockPrisma.lease.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ body: validBody });

    await paymentController.create(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });

  it('derives tenantId from the owned lease rather than trusting the request body', async () => {
    mockPrisma.lease.findFirst.mockResolvedValue({ id: 'lease-1', tenantId: 'real-tenant-1' });
    mockPrisma.payment.create.mockResolvedValue({ id: 'pay-1' });
    const { req, res, next } = mockReqRes({ body: validBody });

    await paymentController.create(req, res, next);

    expect(mockPrisma.payment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'real-tenant-1', leaseId: 'lease-1' }),
    }));
  });
});

describe('paymentController.update — cross-landlord IDOR protection', () => {
  it('404s and never updates when the payment does not belong to this landlord', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ params: { id: 'other-landlords-payment' }, body: { status: 'PAID' } });

    await paymentController.update(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });

  it('updates when ownership check passes', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue({ id: 'pay-1' });
    mockPrisma.payment.update.mockResolvedValue({ id: 'pay-1', status: 'PAID' });
    const { req, res, next } = mockReqRes({ params: { id: 'pay-1' }, body: { status: 'PAID' } });

    await paymentController.update(req, res, next);

    expect(res.body.payment.status).toBe('PAID');
  });
});
