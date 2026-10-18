const os = require('os');
const path = require('path');
const fs = require('fs');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// config/uploads.js resolves UPLOADS_DIR when it is first required, so the scratch
// directory has to exist in the environment before the router is loaded.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'farik-uploads-'));
process.env.UPLOADS_DIR = TMP;

const mockPrisma = {
  user: { findUnique: jest.fn() },
  maintenanceRequest: { findFirst: jest.fn() },
  maintenanceInvoice: { findFirst: jest.fn() },
  uploadedDocument: { findFirst: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const uploadsRouter = require('../../src/routes/uploads');

const LANDLORD = { id: 'u-landlord', role: 'LANDLORD', landlordProfile: { id: 'landlord-1' }, tenantProfile: null };
const TENANT = { id: 'u-tenant', role: 'TENANT', landlordProfile: null, tenantProfile: { id: 'tenant-1' } };
const bearer = (user) => `Bearer ${jwt.sign({ userId: user.id }, process.env.JWT_SECRET)}`;

// supertest does not buffer binary responses by default.
const binaryParser = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

function buildApp() {
  const app = express();
  app.use('/uploads', uploadsRouter);
  app.use((err, req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

beforeAll(() => {
  fs.mkdirSync(path.join(TMP, 'maintenance'), { recursive: true });
  fs.mkdirSync(path.join(TMP, 'invoices'), { recursive: true });
  fs.writeFileSync(path.join(TMP, 'maintenance', 'photo.jpg'), 'jpegbytes');
  fs.writeFileSync(path.join(TMP, 'invoices', 'inv.pdf'), '%PDF-1.4 invoice');
  fs.writeFileSync(path.join(TMP, 'secret.txt'), 'not for anyone');
});

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

beforeEach(() => {
  mockPrisma.user.findUnique.mockImplementation(({ where }) => Promise.resolve(
    where.id === LANDLORD.id ? LANDLORD : where.id === TENANT.id ? TENANT : null,
  ));
  mockPrisma.maintenanceRequest.findFirst.mockResolvedValue(null);
  mockPrisma.maintenanceInvoice.findFirst.mockResolvedValue(null);
  mockPrisma.uploadedDocument.findFirst.mockResolvedValue(null);
});

afterEach(() => jest.clearAllMocks());

describe('GET /uploads/:folder/:file', () => {
  it('401s with no session — nothing under /uploads is public any more', async () => {
    const res = await request(buildApp()).get('/uploads/maintenance/photo.jpg');
    expect(res.status).toBe(401);
    expect(mockPrisma.maintenanceRequest.findFirst).not.toHaveBeenCalled();
  });

  it('serves a maintenance photo to the landlord whose property the request is on', async () => {
    mockPrisma.maintenanceRequest.findFirst.mockResolvedValue({ id: 'req-1' });
    const res = await request(buildApp())
      .get('/uploads/maintenance/photo.jpg')
      .set('Authorization', bearer(LANDLORD))
      .buffer()
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('jpegbytes');
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(mockPrisma.maintenanceRequest.findFirst).toHaveBeenCalledWith({
      where: { photos: { has: '/uploads/maintenance/photo.jpg' }, unit: { property: { landlordId: 'landlord-1' } } },
      select: { id: true },
    });
  });

  it('serves a tenant their own request photo, scoping the lookup by tenantId', async () => {
    mockPrisma.maintenanceRequest.findFirst.mockResolvedValue({ id: 'req-1' });
    const res = await request(buildApp()).get('/uploads/maintenance/photo.jpg').set('Authorization', bearer(TENANT));

    expect(res.status).toBe(200);
    expect(mockPrisma.maintenanceRequest.findFirst).toHaveBeenCalledWith({
      where: { photos: { has: '/uploads/maintenance/photo.jpg' }, tenantId: 'tenant-1' },
      select: { id: true },
    });
  });

  it('404s (never 403) for a landlord who does not own the request, so existence is not confirmed', async () => {
    const res = await request(buildApp()).get('/uploads/maintenance/photo.jpg').set('Authorization', bearer(LANDLORD));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'File not found' });
  });

  it('serves an invoice to the owning landlord but never to a tenant, without a database lookup for the tenant', async () => {
    mockPrisma.maintenanceInvoice.findFirst.mockResolvedValue({ id: 'inv-1' });
    const asLandlord = await request(buildApp()).get('/uploads/invoices/inv.pdf').set('Authorization', bearer(LANDLORD));
    expect(asLandlord.status).toBe(200);
    expect(mockPrisma.maintenanceInvoice.findFirst).toHaveBeenCalledWith({
      where: { storedName: 'inv.pdf', maintenanceRequest: { unit: { property: { landlordId: 'landlord-1' } } } },
      select: { id: true },
    });

    jest.clearAllMocks();
    const asTenant = await request(buildApp()).get('/uploads/invoices/inv.pdf').set('Authorization', bearer(TENANT));
    expect(asTenant.status).toBe(404);
    expect(mockPrisma.maintenanceInvoice.findFirst).not.toHaveBeenCalled();
  });

  it('404s for folders that are never served (temp import files) and for unknown folders', async () => {
    for (const folder of ['spreadsheets', 'onboarding', 'nope']) {
      const res = await request(buildApp()).get(`/uploads/${folder}/anything.xlsx`).set('Authorization', bearer(LANDLORD));
      expect(res.status).toBe(404);
    }
  });

  it('refuses path traversal out of the folder before touching the database', async () => {
    for (const evil of ['..%2Fsecret.txt', '%2e%2e', '..', '.hidden']) {
      const res = await request(buildApp()).get(`/uploads/maintenance/${evil}`).set('Authorization', bearer(LANDLORD));
      expect(res.status).toBe(404);
    }
    expect(mockPrisma.maintenanceRequest.findFirst).not.toHaveBeenCalled();
  });

  it('404s when the record exists but the file is gone from disk', async () => {
    mockPrisma.maintenanceRequest.findFirst.mockResolvedValue({ id: 'req-1' });
    const res = await request(buildApp()).get('/uploads/maintenance/missing.jpg').set('Authorization', bearer(LANDLORD));
    expect(res.status).toBe(404);
  });
});
