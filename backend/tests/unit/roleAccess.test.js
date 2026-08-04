const jwt = require('jsonwebtoken');

const mockPrisma = { user: { findUnique: jest.fn() } };
jest.mock('../../src/lib/prisma', () => mockPrisma);

const { authenticate, requireLandlord, requireTenant } = require('../../src/middleware/auth');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}

const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET);

afterEach(() => jest.clearAllMocks());

describe('authenticate', () => {
  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer header', { authorization: 'Basic abc' }],
    ['a Bearer header with a junk token', { authorization: 'Bearer not-a-jwt' }],
  ])('401s on %s', async (_label, headers) => {
    const res = mockRes();
    const next = jest.fn();

    await authenticate({ headers }, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s on a token signed with the wrong secret', async () => {
    const res = mockRes();
    const next = jest.fn();
    const forged = jwt.sign({ userId: 'user-1' }, 'a-different-secret');

    await authenticate({ headers: { authorization: `Bearer ${forged}` } }, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when the token is valid but the user no longer exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = mockRes();
    const next = jest.fn();

    await authenticate({ headers: { authorization: `Bearer ${sign({ userId: 'ghost' })}` } }, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the hydrated user and continues on a valid token', async () => {
    const user = { id: 'user-1', role: 'LANDLORD', landlordProfile: { id: 'lp-1' }, tenantProfile: null };
    mockPrisma.user.findUnique.mockResolvedValue(user);
    const req = { headers: { authorization: `Bearer ${sign({ userId: 'user-1' })}` } };
    const next = jest.fn();

    await authenticate(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBe(user);
    // both profiles are loaded so downstream controllers can scope queries
    expect(mockPrisma.user.findUnique.mock.calls[0][0].include).toEqual({
      landlordProfile: true,
      tenantProfile: true,
    });
  });
});

describe('role guards', () => {
  it('requireLandlord blocks a tenant', () => {
    const res = mockRes();
    const next = jest.fn();
    requireLandlord({ user: { role: 'TENANT' } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireLandlord blocks an unauthenticated request', () => {
    const res = mockRes();
    const next = jest.fn();
    requireLandlord({}, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireLandlord admits a landlord', () => {
    const next = jest.fn();
    requireLandlord({ user: { role: 'LANDLORD' } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('requireTenant blocks a landlord', () => {
    const res = mockRes();
    const next = jest.fn();
    requireTenant({ user: { role: 'LANDLORD' } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireTenant admits a tenant', () => {
    const next = jest.fn();
    requireTenant({ user: { role: 'TENANT' } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
