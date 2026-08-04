const mockPrisma = {
  pilotApplication: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);
jest.mock('../../src/services/emailService', () => ({
  sendPilotTeamNotification: jest.fn(),
  sendPilotApplicantConfirmation: jest.fn(),
}));

const pilotController = require('../../src/controllers/pilotController');
const emailService = require('../../src/services/emailService');

const VALID = {
  fullName: '  Jordan Blake  ',
  email: '  Jordan@Example.COM ',
  phone: '(306) 555-0100',
  city: ' Saskatoon ',
  unitsManaged: '6',
  preferredContactMethod: 'EMAIL',
  biggestProblem: 'Chasing rent every single month and after-hours texts.',
};

function mockReqRes(body = {}, extra = {}) {
  const req = { body, params: {}, query: {}, ip: '203.0.113.9', headers: {}, ...extra };
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
  return { req, res, next: jest.fn() };
}

const ORIGINAL_ENV = { ...process.env };
let warnSpy;
let logSpy;

beforeEach(() => {
  jest.clearAllMocks();
  // These logs are the feature (operators need them) but they drown the test
  // output, so capture rather than print — and assert on them below.
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  delete process.env.BOOKING_URL;
  delete process.env.PILOT_NOTIFICATION_EMAIL;
  delete process.env.ADMIN_EMAILS;
  mockPrisma.pilotApplication.findFirst.mockResolvedValue(null);
  mockPrisma.pilotApplication.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: 'app-1', createdAt: new Date('2026-08-04T12:00:00Z'), ...data }));
  emailService.sendPilotTeamNotification.mockResolvedValue({ sent: true });
  emailService.sendPilotApplicantConfirmation.mockResolvedValue({ sent: true });
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = ORIGINAL_ENV; });

const allWarnings = () => warnSpy.mock.calls.flat().join('\n');
const allLogs = () => logSpy.mock.calls.flat().join('\n');

describe('submit — happy path', () => {
  it('stores a valid application and returns 201', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.application.id).toBe('app-1');
  });

  it('trims whitespace and normalises the email to lower case', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    const { data } = mockPrisma.pilotApplication.create.mock.calls[0][0];
    expect(data.fullName).toBe('Jordan Blake');
    expect(data.email).toBe('jordan@example.com');
    expect(data.city).toBe('Saskatoon');
  });

  it('coerces the unit count to an integer', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);
    expect(mockPrisma.pilotApplication.create.mock.calls[0][0].data.unitsManaged).toBe(6);
  });

  it('stores only a salted hash of the submitter IP, never the address', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    const { data } = mockPrisma.pilotApplication.create.mock.calls[0][0];
    expect(data.submitterIpHash).toMatch(/^[a-f0-9]{32}$/);
    expect(JSON.stringify(data)).not.toContain('203.0.113.9');
  });

  it('never returns internal fields to the browser', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    const keys = Object.keys(res.body.application);
    expect(keys).not.toContain('submitterIpHash');
    expect(keys).not.toContain('internalNotes');
    expect(keys).not.toContain('status');
  });

  it('records where the application came from', async () => {
    const { req, res, next } = mockReqRes({ ...VALID, source: 'landing_pilot_section' });
    await pilotController.submit(req, res, next);
    expect(mockPrisma.pilotApplication.create.mock.calls[0][0].data.source).toBe('landing_pilot_section');
  });

  it('optional fields are stored as null rather than empty strings', async () => {
    const { req, res, next } = mockReqRes({ ...VALID, companyName: '   ', additionalNotes: '' });
    await pilotController.submit(req, res, next);

    const { data } = mockPrisma.pilotApplication.create.mock.calls[0][0];
    expect(data.companyName).toBeNull();
    expect(data.additionalNotes).toBeNull();
  });
});

describe('submit — validation', () => {
  const cases = [
    ['fullName', { fullName: '   ' }],
    ['email', { email: 'not-an-email' }],
    ['email', { email: '' }],
    ['phone', { phone: '' }],
    ['city', { city: '' }],
    ['unitsManaged', { unitsManaged: '0' }],
    ['unitsManaged', { unitsManaged: '-3' }],
    ['unitsManaged', { unitsManaged: '2.5' }],
    ['unitsManaged', { unitsManaged: 'lots' }],
    ['biggestProblem', { biggestProblem: 'too short' }],
    ['preferredContactMethod', { preferredContactMethod: '' }],
    ['preferredContactMethod', { preferredContactMethod: 'CARRIER_PIGEON' }],
  ];

  it.each(cases)('rejects a bad %s and names the field', async (field, override) => {
    const { req, res, next } = mockReqRes({ ...VALID, ...override });
    await pilotController.submit(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty(field);
    expect(mockPrisma.pilotApplication.create).not.toHaveBeenCalled();
  });

  it('reports every invalid field at once so the form can show them inline', async () => {
    const { req, res, next } = mockReqRes({ fullName: '', email: 'nope', phone: '', city: '', unitsManaged: '0', biggestProblem: 'x', preferredContactMethod: '' });
    await pilotController.submit(req, res, next);

    expect(Object.keys(res.body.fieldErrors).sort()).toEqual(
      ['biggestProblem', 'city', 'email', 'fullName', 'phone', 'preferredContactMethod', 'unitsManaged'],
    );
  });

  it('rejects an empty body without throwing', async () => {
    const { req, res, next } = mockReqRes(undefined);
    await pilotController.submit(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  // A missing key must read the same as an empty one — never zod's bare "Required".
  it('gives an absent field the same applicant-facing message as an empty one', async () => {
    const { req, res, next } = mockReqRes({});
    await pilotController.submit(req, res, next);

    expect(res.body.fieldErrors).toEqual({
      fullName: 'Please enter your full name.',
      email: 'Please enter your email address.',
      phone: 'Please enter a phone number.',
      city: 'Please enter your city.',
      unitsManaged: 'Enter the number of units you manage.',
      biggestProblem: 'Tell us what takes the most of your time.',
      preferredContactMethod: 'Choose how you would like us to reach you.',
    });
    expect(Object.values(res.body.fieldErrors)).not.toContain('Required');
  });
});

describe('submit — spam and duplicates', () => {
  it('silently discards a submission that filled the honeypot', async () => {
    const { req, res, next } = mockReqRes({ ...VALID, website: 'http://spam.example' });
    await pilotController.submit(req, res, next);

    expect(res.statusCode).toBe(202);
    expect(mockPrisma.pilotApplication.create).not.toHaveBeenCalled();
    expect(emailService.sendPilotTeamNotification).not.toHaveBeenCalled();
    expect(emailService.sendPilotApplicantConfirmation).not.toHaveBeenCalled();
  });

  it('an empty honeypot is not treated as spam', async () => {
    const { req, res, next } = mockReqRes({ ...VALID, website: '' });
    await pilotController.submit(req, res, next);
    expect(res.statusCode).toBe(201);
  });

  it('reuses a recent application from the same email instead of creating a duplicate', async () => {
    mockPrisma.pilotApplication.findFirst.mockResolvedValue({
      id: 'app-existing', fullName: 'Jordan Blake', email: 'jordan@example.com', createdAt: new Date(),
    });
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.application.id).toBe('app-existing');
    expect(mockPrisma.pilotApplication.create).not.toHaveBeenCalled();
  });

  it('does not re-send emails for a duplicate submission', async () => {
    mockPrisma.pilotApplication.findFirst.mockResolvedValue({
      id: 'app-existing', fullName: 'Jordan Blake', email: 'jordan@example.com', createdAt: new Date(),
    });
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    expect(emailService.sendPilotTeamNotification).not.toHaveBeenCalled();
    expect(emailService.sendPilotApplicantConfirmation).not.toHaveBeenCalled();
  });

  it('scopes the duplicate lookup to the normalised email and the dedupe window', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    const where = mockPrisma.pilotApplication.findFirst.mock.calls[0][0].where;
    expect(where.email).toBe('jordan@example.com');
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(Date.now() - where.createdAt.gte.getTime()).toBeCloseTo(pilotController.DEDUPE_WINDOW_MS, -3);
  });
});

describe('submit — failures never leak', () => {
  it('passes a database failure to the error handler and creates nothing', async () => {
    mockPrisma.pilotApplication.create.mockRejectedValue(new Error('connection to db "farik" refused'));
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.body).toBeNull(); // nothing was sent to the client here
  });

  it('still succeeds when both email sends fail', async () => {
    emailService.sendPilotTeamNotification.mockRejectedValue(new Error('smtp down'));
    emailService.sendPilotApplicantConfirmation.mockRejectedValue(new Error('smtp down'));
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it('still succeeds when the email provider reports it is not configured', async () => {
    emailService.sendPilotTeamNotification.mockResolvedValue({ sent: false, reason: 'not_configured' });
    emailService.sendPilotApplicantConfirmation.mockResolvedValue({ sent: false, reason: 'not_configured' });
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(JSON.stringify(res.body)).not.toMatch(/configur/i);
  });
});

describe('submit — booking link', () => {
  it('returns a prefilled booking link when BOOKING_URL is configured', async () => {
    process.env.BOOKING_URL = 'https://cal.com/farik/15min';
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    const url = new URL(res.body.bookingUrl);
    expect(url.origin + url.pathname).toBe('https://cal.com/farik/15min');
    expect(url.searchParams.get('name')).toBe('Jordan Blake');
    expect(url.searchParams.get('email')).toBe('jordan@example.com');
    expect(url.searchParams.get('phone')).toBe('(306) 555-0100');
    expect(url.searchParams.get('city')).toBe('Saskatoon');
    expect(url.searchParams.get('units')).toBe('6');
    expect(url.searchParams.get('pilot_ref')).toBe('app-1');
  });

  it('accepts the application with a null booking link when BOOKING_URL is unset', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(res.body.bookingUrl).toBeNull();
    expect(mockPrisma.pilotApplication.create).toHaveBeenCalled();
  });

  it('sends the applicant a confirmation without a booking link when unset', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);
    expect(emailService.sendPilotApplicantConfirmation.mock.calls[0][0].bookingUrl).toBeNull();
  });

  it('logs a clear server-side warning when BOOKING_URL is missing', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);
    expect(allWarnings()).toMatch(/BOOKING_URL is not configured/);
  });

  it('logs the outcome without writing applicant PII into the log', async () => {
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    const logs = allLogs();
    expect(logs).toMatch(/\[pilot\] Application app-1 stored/);
    expect(logs).not.toContain('jordan@example.com');
    expect(logs).not.toContain('Jordan Blake');
    expect(logs).not.toContain('(306) 555-0100');
  });

  it('ignores a BOOKING_URL that is not an absolute http(s) URL', async () => {
    process.env.BOOKING_URL = 'javascript:alert(1)';
    const { req, res, next } = mockReqRes(VALID);
    await pilotController.submit(req, res, next);

    expect(res.body.bookingUrl).toBeNull();
    expect(res.statusCode).toBe(201);
  });

  it('exposes booking availability publicly without leaking anything else', async () => {
    process.env.BOOKING_URL = 'https://cal.com/farik/15min';
    process.env.PILOT_NOTIFICATION_EMAIL = 'founders@internal.example';
    const { req, res, next } = mockReqRes();
    await pilotController.getConfig(req, res, next);

    expect(res.body).toEqual({ bookingUrl: 'https://cal.com/farik/15min' });
    expect(JSON.stringify(res.body)).not.toContain('founders@internal.example');
  });
});

describe('admin endpoints', () => {
  it('lists applications newest first', async () => {
    mockPrisma.pilotApplication.findMany.mockResolvedValue([{ id: 'app-1' }]);
    const { req, res, next } = mockReqRes();
    await pilotController.list(req, res, next);

    expect(mockPrisma.pilotApplication.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    expect(res.body.applications).toHaveLength(1);
  });

  it('ignores an unknown status filter rather than erroring', async () => {
    mockPrisma.pilotApplication.findMany.mockResolvedValue([]);
    const { req, res, next } = mockReqRes({}, { query: { status: 'DROP TABLE' } });
    await pilotController.list(req, res, next);
    expect(mockPrisma.pilotApplication.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('updates status and internal notes', async () => {
    mockPrisma.pilotApplication.findUnique.mockResolvedValue({ id: 'app-1', status: 'NEW' });
    mockPrisma.pilotApplication.update.mockResolvedValue({ id: 'app-1', status: 'CONTACTED' });
    const { req, res, next } = mockReqRes({ status: 'CONTACTED', internalNotes: 'Left a voicemail.' }, { params: { id: 'app-1' } });
    await pilotController.update(req, res, next);

    const { data } = mockPrisma.pilotApplication.update.mock.calls[0][0];
    expect(data.status).toBe('CONTACTED');
    expect(data.internalNotes).toBe('Left a voicemail.');
  });

  it('marking a call booked moves a new application to CALL_BOOKED', async () => {
    mockPrisma.pilotApplication.findUnique.mockResolvedValue({ id: 'app-1', status: 'NEW' });
    mockPrisma.pilotApplication.update.mockResolvedValue({ id: 'app-1' });
    const { req, res, next } = mockReqRes({ bookedCallAt: '2026-08-10T15:00:00.000Z' }, { params: { id: 'app-1' } });
    await pilotController.update(req, res, next);

    const { data } = mockPrisma.pilotApplication.update.mock.calls[0][0];
    expect(data.bookedCallAt).toBeInstanceOf(Date);
    expect(data.status).toBe('CALL_BOOKED');
  });

  it('does not override a status the admin set explicitly', async () => {
    mockPrisma.pilotApplication.findUnique.mockResolvedValue({ id: 'app-1', status: 'NEW' });
    mockPrisma.pilotApplication.update.mockResolvedValue({ id: 'app-1' });
    const { req, res, next } = mockReqRes(
      { bookedCallAt: '2026-08-10T15:00:00.000Z', status: 'PILOT_ACCEPTED' },
      { params: { id: 'app-1' } },
    );
    await pilotController.update(req, res, next);
    expect(mockPrisma.pilotApplication.update.mock.calls[0][0].data.status).toBe('PILOT_ACCEPTED');
  });

  it('404s for an unknown application', async () => {
    mockPrisma.pilotApplication.findUnique.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ status: 'CONTACTED' }, { params: { id: 'nope' } });
    await pilotController.update(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.pilotApplication.update).not.toHaveBeenCalled();
  });

  it('rejects a status outside the allowed set', async () => {
    mockPrisma.pilotApplication.findUnique.mockResolvedValue({ id: 'app-1', status: 'NEW' });
    const { req, res, next } = mockReqRes({ status: 'SECRETLY_ADMIN' }, { params: { id: 'app-1' } });
    await pilotController.update(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockPrisma.pilotApplication.update).not.toHaveBeenCalled();
  });
});
