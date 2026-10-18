const jwt = require('jsonwebtoken');

const mockPrisma = { user: { findUnique: jest.fn() } };
jest.mock('../../src/lib/prisma', () => mockPrisma);

const { authenticate } = require('../../src/middleware/auth');
const { createInviteToken } = require('../../src/services/tenantInviteService');

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
}

afterEach(() => jest.clearAllMocks());

describe('authenticate — tokens that are not sessions', () => {
  it('refuses a tenant invitation token as a session without even looking the user up', async () => {
    const res = mockRes();
    const next = jest.fn();
    await authenticate({ headers: { authorization: `Bearer ${createInviteToken('user-7')}` } }, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a validly signed token that has no userId claim', async () => {
    const res = mockRes();
    const next = jest.fn();
    await authenticate({ headers: { authorization: `Bearer ${jwt.sign({ sub: 'user-7' }, process.env.JWT_SECRET)}` } }, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('still accepts a real session token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-7', role: 'TENANT' });
    const req = { headers: { authorization: `Bearer ${jwt.sign({ userId: 'user-7' }, process.env.JWT_SECRET)}` } };
    const next = jest.fn();
    await authenticate(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe('user-7');
  });
});
