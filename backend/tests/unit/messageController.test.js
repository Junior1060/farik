const mockPrisma = {
  tenantProfile: { count: jest.fn() },
  conversation: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  message: { create: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);
jest.mock('../../src/services/agentService', () => ({ handleTenantMessage: jest.fn().mockResolvedValue() }));

const messageController = require('../../src/controllers/messageController');

function mockReqRes({ body = {}, params = { conversationId: 'new' }, role = 'LANDLORD', landlordId = 'landlord-1' } = {}) {
  const req = {
    params, body,
    user: {
      id: 'user-1', role,
      landlordProfile: role === 'LANDLORD' ? { id: landlordId } : undefined,
      tenantProfile: role === 'TENANT' ? { id: 'tenant-1' } : undefined,
    },
  };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req, res, next: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('messageController.sendMessage (new conversation) — cross-landlord IDOR protection', () => {
  it('denies a landlord starting a new conversation with a tenant they do not own', async () => {
    mockPrisma.tenantProfile.count.mockResolvedValue(0);
    const { req, res, next } = mockReqRes({ body: { body: 'hello', tenantId: 'other-landlords-tenant' } });

    await messageController.sendMessage(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
  });

  it('allows a landlord to start a new conversation with their own tenant', async () => {
    mockPrisma.tenantProfile.count.mockResolvedValue(1);
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv-1' });
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
    mockPrisma.conversation.update.mockResolvedValue({});
    const { req, res, next } = mockReqRes({ body: { body: 'hello', tenantId: 'tenant-1' } });

    await messageController.sendMessage(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(mockPrisma.conversation.create).toHaveBeenCalled();
  });

  it('denies a tenant starting a new conversation on behalf of a different tenantId', async () => {
    const { req, res, next } = mockReqRes({ body: { body: 'hello', tenantId: 'someone-elses-tenant-id' }, role: 'TENANT' });

    await messageController.sendMessage(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
  });
});
