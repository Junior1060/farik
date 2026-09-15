const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockPrisma = {
  pilotApplication: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);
jest.mock('../../src/services/emailService', () => ({
  sendPilotTeamNotification: jest.fn().mockResolvedValue({ sent: true }),
  sendPilotApplicantConfirmation: jest.fn().mockResolvedValue({ sent: true }),
  sendEscalationEmail: jest.fn(),
  sendReminderEmail: jest.fn(),
  sendUrgentEmail: jest.fn(),
}));

const app = require('../../src/server');

const VALID = {
  fullName: 'Jordan Blake',
  email: 'jordan@example.com',
  phone: '(306) 555-0100',
  city: 'Saskatoon',
  unitsManaged: 6,
  preferredContactMethod: 'EMAIL',
  biggestProblem: 'Chasing rent every month and after-hours maintenance texts.',
};

const tokenFor = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  delete process.env.ADMIN_EMAILS;
  delete process.env.BOOKING_URL;
  mockPrisma.pilotApplication.findFirst.mockResolvedValue(null);
  mockPrisma.pilotApplication.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: 'app-1', createdAt: new Date(), ...data }));
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = ORIGINAL_ENV; });

describe('POST /api/pilot-applications — public', () => {
  it('accepts an application with no authentication at all', async () => {
    const res = await request(app).post('/api/pilot-applications').send(VALID);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('returns inline field errors for an invalid submission', async () => {
    const res = await request(app)
      .post('/api/pilot-applications')
      .send({ ...VALID, email: 'nope', unitsManaged: 0 });

    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.email).toBeTruthy();
    expect(res.body.fieldErrors.unitsManaged).toBeTruthy();
  });

  it('never echoes database detail back to the client on failure', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.pilotApplication.create.mockRejectedValue(
      new Error('P1001: Can\'t reach database server at db.abcdefg.supabase.co:5432'),
    );
    const res = await request(app).post('/api/pilot-applications').send(VALID);
    process.env.NODE_ENV = 'test';

    expect(res.status).toBe(500);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/supabase|5432|P1001|prisma/i);
  });
});

describe('GET /api/pilot-applications — reading is not public', () => {
  it('401s an anonymous visitor', async () => {
    const res = await request(app).get('/api/pilot-applications');
    expect(res.status).toBe(401);
    expect(mockPrisma.pilotApplication.findMany).not.toHaveBeenCalled();
  });

  it('403s a signed-in landlord who is not on the admin allowlist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'landlord@example.com', role: 'LANDLORD', landlordProfile: { id: 'lp-1' }, tenantProfile: null,
    });
    const res = await request(app)
      .get('/api/pilot-applications')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(403);
    expect(mockPrisma.pilotApplication.findMany).not.toHaveBeenCalled();
  });

  it('403s everyone when ADMIN_EMAILS is unset — the allowlist fails closed', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'founder@farik.ca', role: 'LANDLORD', landlordProfile: { id: 'lp-1' }, tenantProfile: null,
    });
    const res = await request(app)
      .get('/api/pilot-applications')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(403);
  });

  it('403s a tenant', async () => {
    process.env.ADMIN_EMAILS = 'founder@farik.ca';
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-2', email: 'alice.morgan@email.com', role: 'TENANT', landlordProfile: null, tenantProfile: { id: 'tp-1' },
    });
    const res = await request(app)
      .get('/api/pilot-applications')
      .set('Authorization', `Bearer ${tokenFor('user-2')}`);

    expect(res.status).toBe(403);
  });

  it('lets an allowlisted admin read applications', async () => {
    process.env.ADMIN_EMAILS = 'Founder@Farik.ca, cofounder@farik.ca';
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'founder@farik.ca', role: 'LANDLORD', landlordProfile: { id: 'lp-1' }, tenantProfile: null,
    });
    mockPrisma.pilotApplication.findMany.mockResolvedValue([{ id: 'app-1', fullName: 'Jordan Blake' }]);

    const res = await request(app)
      .get('/api/pilot-applications')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
  });
});

describe('PATCH /api/pilot-applications/:id — writing is not public', () => {
  it('401s an anonymous visitor and updates nothing', async () => {
    const res = await request(app).patch('/api/pilot-applications/app-1').send({ status: 'PILOT_ACCEPTED' });
    expect(res.status).toBe(401);
    expect(mockPrisma.pilotApplication.update).not.toHaveBeenCalled();
  });

  it('403s a non-admin signed-in user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'landlord@example.com', role: 'LANDLORD', landlordProfile: { id: 'lp-1' }, tenantProfile: null,
    });
    const res = await request(app)
      .patch('/api/pilot-applications/app-1')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .send({ status: 'PILOT_ACCEPTED' });

    expect(res.status).toBe(403);
    expect(mockPrisma.pilotApplication.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/pilot-applications/config', () => {
  it('is public and reports null when no booking link is configured', async () => {
    const res = await request(app).get('/api/pilot-applications/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bookingUrl: null });
  });

  it('reports the configured booking link', async () => {
    process.env.BOOKING_URL = 'https://cal.com/farik/15min';
    const res = await request(app).get('/api/pilot-applications/config');
    expect(res.body.bookingUrl).toBe('https://cal.com/farik/15min');
  });
});

describe('rate limiting', () => {
  it('starts refusing submissions from one address after the hourly limit', async () => {
    const agent = request(app);
    const statuses = [];
    // Limit is 10/hour/IP. Supertest requests share 127.0.0.1.
    for (let i = 0; i < 13; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await agent.post('/api/pilot-applications').send({ ...VALID, email: `applicant${i}@example.com` });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.at(-1)).toBe(429);
  });
});
