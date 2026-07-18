const mockPrisma = {
  maintenanceInvoice: { findUnique: jest.fn(), update: jest.fn() },
  maintenanceRequest: { findFirst: jest.fn() },
  maintenanceWorkflow: { updateMany: jest.fn() },
  workflowEvent: { create: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};
const mockTx = {
  maintenanceInvoice: { update: jest.fn() },
  maintenanceWorkflow: { updateMany: jest.fn() },
  workflowEvent: { create: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const invoiceController = require('../../src/controllers/invoiceController');

function mockReqRes({ params = {}, body = {}, userId = 'user-1', landlordId = 'landlord-1' } = {}) {
  const req = { params, body, user: { id: userId, landlordProfile: { id: landlordId } } };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
  const next = jest.fn();
  return { req, res, next };
}

const baseRequest = { id: 'req-1', unit: { property: { landlordId: 'landlord-1' } }, workflow: { id: 'wf-1', state: 'INVOICE_RECEIVED' } };

beforeEach(() => {
  mockTx.maintenanceWorkflow.updateMany.mockResolvedValue({ count: 1 });
  mockTx.maintenanceInvoice.update.mockImplementation(({ data }) => Promise.resolve({ id: 'inv-1', ...data }));
});

afterEach(() => jest.clearAllMocks());

describe('invoiceController.approve', () => {
  it('approves the invoice and transitions the workflow to INVOICE_APPROVED then RESOLVED, all inside one transaction', async () => {
    mockPrisma.maintenanceInvoice.findUnique.mockResolvedValue({ id: 'inv-1', maintenanceRequestId: 'req-1' });
    mockPrisma.maintenanceRequest.findFirst.mockResolvedValue(baseRequest);
    const { req, res, next } = mockReqRes({ params: { id: 'inv-1' } });

    await invoiceController.approve(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.maintenanceInvoice.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvalStatus: 'APPROVED' }),
    }));
    const toStates = mockTx.workflowEvent.create.mock.calls.map((c) => c[0].data.toState);
    expect(toStates).toEqual(['INVOICE_APPROVED', 'RESOLVED']);
    expect(res.body.invoice.approvalStatus).toBe('APPROVED');
  });

  it('404s without touching the invoice when the request does not belong to this landlord', async () => {
    mockPrisma.maintenanceInvoice.findUnique.mockResolvedValue({ id: 'inv-1', maintenanceRequestId: 'req-1' });
    mockPrisma.maintenanceRequest.findFirst.mockResolvedValue(null); // ownership check fails
    const { req, res, next } = mockReqRes({ params: { id: 'inv-1' } });

    await invoiceController.approve(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('propagates a failed workflow transition to next(err) without a partial invoice update surviving observably', async () => {
    mockPrisma.maintenanceInvoice.findUnique.mockResolvedValue({ id: 'inv-1', maintenanceRequestId: 'req-1' });
    mockPrisma.maintenanceRequest.findFirst.mockResolvedValue(baseRequest);
    // Simulate a concurrent modification: the workflow already moved off INVOICE_RECEIVED.
    mockTx.maintenanceWorkflow.updateMany.mockResolvedValue({ count: 0 });
    const { req, res, next } = mockReqRes({ params: { id: 'inv-1' } });

    await invoiceController.approve(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].name).toBe('ConcurrentModificationError');
    expect(res.body).toBeNull(); // res.json was never reached — the transaction's rejection propagated first
  });
});

describe('invoiceController.reject', () => {
  it('rejects the invoice and transitions the workflow to INVOICE_DISPUTED inside one transaction', async () => {
    mockPrisma.maintenanceInvoice.findUnique.mockResolvedValue({ id: 'inv-1', maintenanceRequestId: 'req-1' });
    mockPrisma.maintenanceRequest.findFirst.mockResolvedValue(baseRequest);
    const { req, res, next } = mockReqRes({ params: { id: 'inv-1' }, body: { reason: 'Amount does not match estimate' } });

    await invoiceController.reject(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockTx.maintenanceInvoice.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvalStatus: 'REJECTED' }),
    }));
    const toStates = mockTx.workflowEvent.create.mock.calls.map((c) => c[0].data.toState);
    expect(toStates).toEqual(['INVOICE_DISPUTED']);
  });
});
