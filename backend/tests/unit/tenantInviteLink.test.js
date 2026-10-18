const mockPrisma = {
  tenantProfile: { findFirst: jest.fn(), findUnique: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

process.env.FRONTEND_URL = 'https://app.farik.test';

const { getInviteLink } = require('../../src/controllers/tenantController');
const { readInviteToken } = require('../../src/services/tenantInviteService');

function mockReqRes({ params = {}, landlordId = 'landlord-1' } = {}) {
  const req = { params, user: { landlordProfile: { id: landlordId } } };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req, res, next: jest.fn() };
}

afterEach(() => jest.clearAllMocks());

describe('GET /api/tenants/:id/invite', () => {
  it('404s for a tenant who is not on one of this landlord\'s units, without reading the account', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ params: { id: 'someone-elses-tenant' } });
    await getInviteLink(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.tenantProfile.findUnique).not.toHaveBeenCalled();
  });

  it('409s once the tenant has activated — there is nothing left to invite them to', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue({ id: 'tenant-1' });
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ id: 'tenant-1', user: { id: 'user-7', email: 'alice@example.com', accountStatus: 'ACTIVE' } });
    const { req, res, next } = mockReqRes({ params: { id: 'tenant-1' } });
    await getInviteLink(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already activated/i);
  });

  it('returns an activation URL on the frontend whose token resolves to the invited user', async () => {
    mockPrisma.tenantProfile.findFirst.mockResolvedValue({ id: 'tenant-1' });
    mockPrisma.tenantProfile.findUnique.mockResolvedValue({ id: 'tenant-1', user: { id: 'user-7', email: 'alice@example.com', accountStatus: 'INVITED' } });
    const { req, res, next } = mockReqRes({ params: { id: 'tenant-1' } });
    await getInviteLink(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.email).toBe('alice@example.com');

    const url = new URL(res.body.url);
    expect(url.origin).toBe('https://app.farik.test');
    expect(url.pathname).toBe('/signup/tenant');
    const invite = readInviteToken(url.searchParams.get('invite'));
    expect(invite.userId).toBe('user-7');
    expect(new Date(res.body.expiresAt).getTime()).toBe(invite.expiresAt.getTime());
  });
});
