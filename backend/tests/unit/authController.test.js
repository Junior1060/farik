const mockPrisma = {
  user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authController = require('../../src/controllers/authController');
const { createInviteToken } = require('../../src/services/tenantInviteService');

function mockReqRes(body = {}, params = {}) {
  const req = { body, params };
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
  return { req, res, next: jest.fn() };
}

const LANDLORD_SIGNUP = {
  fullName: '  Jordan   Blake ',
  email: ' Jordan@Example.COM ',
  password: 'correct horse',
  companyName: 'Blake Rentals',
};

beforeEach(() => {
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.user.create.mockImplementation(({ data }) => Promise.resolve({
    id: 'user-1',
    email: data.email,
    role: data.role,
    accountStatus: data.accountStatus,
    landlordProfile: data.landlordProfile ? { id: 'lp-1', ...data.landlordProfile.create } : null,
    tenantProfile: data.tenantProfile ? { id: 'tp-1', ...data.tenantProfile.create } : null,
  }));
});

describe('register — self-serve landlord signup', () => {
  it('creates an ACTIVE landlord from a single full-name field and returns a usable token', async () => {
    const { req, res, next } = mockReqRes(LANDLORD_SIGNUP);
    await authController.register(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);

    const { data } = mockPrisma.user.create.mock.calls[0][0];
    expect(data.role).toBe('LANDLORD');
    expect(data.accountStatus).toBe('ACTIVE');
    expect(data.landlordProfile.create).toMatchObject({ firstName: 'Jordan', lastName: 'Blake', companyName: 'Blake Rentals' });

    expect(res.body.user).toEqual({
      id: 'user-1',
      email: 'jordan@example.com',
      role: 'LANDLORD',
      profile: expect.objectContaining({ firstName: 'Jordan' }),
    });
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET).userId).toBe('user-1');
  });

  it('trims and lower-cases the email before storing it', async () => {
    const { req, res, next } = mockReqRes(LANDLORD_SIGNUP);
    await authController.register(req, res, next);
    expect(mockPrisma.user.create.mock.calls[0][0].data.email).toBe('jordan@example.com');
  });

  it('never stores the plain-text password', async () => {
    const { req, res, next } = mockReqRes(LANDLORD_SIGNUP);
    await authController.register(req, res, next);
    const stored = mockPrisma.user.create.mock.calls[0][0].data.password;
    expect(stored).not.toBe('correct horse');
    expect(await bcrypt.compare('correct horse', stored)).toBe(true);
  });

  it('keeps a single-word name as the first name with an empty last name', async () => {
    const { req, res, next } = mockReqRes({ ...LANDLORD_SIGNUP, fullName: 'Cher' });
    await authController.register(req, res, next);
    expect(mockPrisma.user.create.mock.calls[0][0].data.landlordProfile.create)
      .toMatchObject({ firstName: 'Cher', lastName: '' });
  });

  it('still accepts the older firstName/lastName shape', async () => {
    const { req, res, next } = mockReqRes({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', password: 'longenough' });
    await authController.register(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.user.create.mock.calls[0][0].data.landlordProfile.create)
      .toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('rejects an existing email with a 409 and a human-readable message', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-9', email: 'jordan@example.com', role: 'LANDLORD', accountStatus: 'ACTIVE' });
    const { req, res, next } = mockReqRes(LANDLORD_SIGNUP);
    await authController.register(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('treats an email that differs only by case as the same account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-9', email: 'Jordan@Example.com', role: 'LANDLORD', accountStatus: 'ACTIVE' });
    const { req, res, next } = mockReqRes(LANDLORD_SIGNUP);
    await authController.register(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: { equals: 'jordan@example.com', mode: 'insensitive' } },
    }));
  });

  it.each([
    ['a short password', { ...LANDLORD_SIGNUP, password: 'short' }, 'password'],
    ['a malformed email', { ...LANDLORD_SIGNUP, email: 'not-an-email' }, 'email'],
    ['a missing name', { ...LANDLORD_SIGNUP, fullName: '   ' }, 'fullName'],
  ])('hands %s to the error handler as a validation error on the right field', async (_label, body, field) => {
    const { req, res, next } = mockReqRes(body);
    await authController.register(req, res, next);

    expect(res.body).toBeNull();
    const err = next.mock.calls[0][0];
    expect(err.name).toBe('ZodError');
    expect(err.errors.map((e) => e.path[0])).toContain(field);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});

describe('register — tenant activation requires the invitation link', () => {
  const invited = {
    id: 'user-7',
    email: 'alice@example.com',
    role: 'TENANT',
    accountStatus: 'INVITED',
    landlordProfile: null,
    tenantProfile: { id: 'tp-7', firstName: 'A.', lastName: 'Morgan', phone: '+13065550100' },
  };
  const inviteToken = createInviteToken('user-7');
  const activation = { fullName: 'Alice Morgan', email: 'Alice@Example.com', password: 'a-real-password', role: 'TENANT', inviteToken };

  beforeEach(() => {
    // Lookups by id resolve the invited account; lookups by email (the landlord path)
    // find nothing unless a test says otherwise.
    mockPrisma.user.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === 'user-7' ? invited : null));
    mockPrisma.user.update.mockImplementation(({ data }) => Promise.resolve({
      ...invited,
      accountStatus: data.accountStatus,
      tenantProfile: { ...invited.tenantProfile, ...data.tenantProfile.update },
    }));
  });

  it('activates the account the link was issued for: real password, ACTIVE, linked profile kept', async () => {
    const { req, res, next } = mockReqRes(activation);
    await authController.register(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-7' } }));

    const { where, data } = mockPrisma.user.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'user-7' });
    expect(data.accountStatus).toBe('ACTIVE');
    expect(await bcrypt.compare('a-real-password', data.password)).toBe(true);
    expect(data.tenantProfile.update).toMatchObject({ firstName: 'Alice', lastName: 'Morgan', phone: '+13065550100' });
    expect(res.body.user.profile.id).toBe('tp-7');
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET).userId).toBe('user-7');
  });

  it('refuses a tenant signup with no invitation (403) and never creates a free-floating tenant account', async () => {
    const { inviteToken: _omit, ...noToken } = activation;
    const { req, res, next } = mockReqRes(noToken);
    await authController.register(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/invitation link/i);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    // Knowing the email alone must not be enough: nothing was even looked up by email.
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['a session token for the same user', jwt.sign({ userId: 'user-7' }, process.env.JWT_SECRET)],
    ['a token signed with another secret', jwt.sign({ purpose: 'tenant-invite', inviteUserId: 'user-7' }, 'not-our-secret')],
    ['an expired invitation', jwt.sign({ purpose: 'tenant-invite', inviteUserId: 'user-7' }, process.env.JWT_SECRET, { expiresIn: -10 })],
    ['garbage', 'not-a-token'],
  ])('refuses %s with 403 and no account change', async (_label, token) => {
    const { req, res, next } = mockReqRes({ ...activation, inviteToken: token });
    await authController.register(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/invalid or has expired/i);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a link whose account is already ACTIVE — a used invitation is dead', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...invited, accountStatus: 'ACTIVE' });
    const { req, res, next } = mockReqRes(activation);
    await authController.register(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a link presented with a different email than the account it was issued for', async () => {
    const { req, res, next } = mockReqRes({ ...activation, email: 'mallory@example.com' });
    await authController.register(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/email address your landlord has on file/i);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('does not let a landlord signup take over an INVITED tenant account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(invited);
    const { req, res, next } = mockReqRes({ fullName: 'Alice Morgan', email: 'alice@example.com', password: 'a-real-password', role: 'LANDLORD' });
    await authController.register(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});

describe('getInvite — who an invitation link is for', () => {
  const invited = {
    id: 'user-7', email: 'alice@example.com', role: 'TENANT', accountStatus: 'INVITED',
    landlordProfile: null, tenantProfile: { id: 'tp-7', firstName: 'Alice', lastName: 'Morgan' },
  };

  it('returns the email and name for a live link so the page can lock the email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(invited);
    const { req, res, next } = mockReqRes({}, { token: createInviteToken('user-7') });
    await authController.getInvite(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ email: 'alice@example.com', firstName: 'Alice', lastName: 'Morgan' });
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it.each([
    ['an already-active account', { ...invited, accountStatus: 'ACTIVE' }, createInviteToken('user-7')],
    ['a landlord account', { ...invited, role: 'LANDLORD' }, createInviteToken('user-7')],
    ['a deleted account', null, createInviteToken('user-7')],
    ['a session token', invited, jwt.sign({ userId: 'user-7' }, process.env.JWT_SECRET)],
  ])('404s for %s without revealing anything', async (_label, found, token) => {
    mockPrisma.user.findUnique.mockResolvedValue(found);
    const { req, res, next } = mockReqRes({}, { token });
    await authController.getInvite(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: expect.stringMatching(/invalid or has expired/i) });
  });
});

describe('login', () => {
  const hashed = bcrypt.hashSync('password123', 4);
  const user = {
    id: 'user-1', email: 'demo@farik.ca', role: 'LANDLORD', accountStatus: 'ACTIVE', password: hashed,
    landlordProfile: { id: 'lp-1' }, tenantProfile: null,
  };

  it('returns a token and the public user shape on valid credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user);
    const { req, res, next } = mockReqRes({ email: 'demo@farik.ca', password: 'password123' });
    await authController.login(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toEqual({ id: 'user-1', email: 'demo@farik.ca', role: 'LANDLORD', profile: { id: 'lp-1' } });
    expect(res.body.user.password).toBeUndefined();
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET).userId).toBe('user-1');
  });

  it('normalises the typed email before looking it up', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user);
    const { req, res, next } = mockReqRes({ email: '  Demo@Farik.CA ', password: 'password123' });
    await authController.login(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'demo@farik.ca' } }));
  });

  it('falls back to a case-insensitive match so a legacy mixed-case account can still log in', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue({ ...user, email: 'Demo@Farik.ca' });
    const { req, res, next } = mockReqRes({ email: 'demo@farik.ca', password: 'password123' });
    await authController.login(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it('refuses an INVITED account with the generic message, never revealing it exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...user, accountStatus: 'INVITED' });
    const { req, res, next } = mockReqRes({ email: 'demo@farik.ca', password: 'password123' });
    await authController.login(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it.each([
    ['unknown email', null, 'password123'],
    ['wrong password', user, 'nope'],
  ])('401s with the same generic message on %s', async (_label, found, password) => {
    mockPrisma.user.findUnique.mockResolvedValue(found);
    const { req, res, next } = mockReqRes({ email: 'demo@farik.ca', password });
    await authController.login(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });
});
