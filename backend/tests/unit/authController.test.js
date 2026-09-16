const mockPrisma = {
  user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authController = require('../../src/controllers/authController');

function mockReqRes(body = {}) {
  const req = { body };
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

describe('register — tenant activating an INVITED account', () => {
  const invited = {
    id: 'user-7',
    email: 'alice@example.com',
    role: 'TENANT',
    accountStatus: 'INVITED',
    landlordProfile: null,
    tenantProfile: { id: 'tp-7', firstName: 'A.', lastName: 'Morgan', phone: '+13065550100' },
  };

  it('sets a real password, marks the account ACTIVE, and keeps the linked profile', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(invited);
    mockPrisma.user.update.mockImplementation(({ data }) => Promise.resolve({
      ...invited,
      accountStatus: data.accountStatus,
      tenantProfile: { ...invited.tenantProfile, ...data.tenantProfile.update },
    }));

    const { req, res, next } = mockReqRes({ fullName: 'Alice Morgan', email: 'Alice@Example.com', password: 'a-real-password', role: 'TENANT' });
    await authController.register(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();

    const { where, data } = mockPrisma.user.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'user-7' });
    expect(data.accountStatus).toBe('ACTIVE');
    expect(await bcrypt.compare('a-real-password', data.password)).toBe(true);
    expect(data.tenantProfile.update).toMatchObject({ firstName: 'Alice', lastName: 'Morgan', phone: '+13065550100' });
    expect(res.body.user.profile.id).toBe('tp-7');
  });

  it('does not let a landlord signup take over an INVITED tenant account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(invited);
    const { req, res, next } = mockReqRes({ fullName: 'Alice Morgan', email: 'alice@example.com', password: 'a-real-password', role: 'LANDLORD' });
    await authController.register(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('does not let anyone take over an ACTIVE tenant account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...invited, accountStatus: 'ACTIVE' });
    const { req, res, next } = mockReqRes({ fullName: 'Alice Morgan', email: 'alice@example.com', password: 'a-real-password', role: 'TENANT' });
    await authController.register(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
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
