const mockPrisma = {
  property: { create: jest.fn() },
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const propertyController = require('../../src/controllers/propertyController');

function mockReqRes(body = {}) {
  const req = { body, params: {}, user: { landlordProfile: { id: 'landlord-1' } } };
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
  return { req, res, next: jest.fn() };
}

const BASE = { name: 'Maple Court', address: '12 Maple St', city: 'Regina', state: 'SK', zip: 'S4S 4H4' };

beforeEach(() => {
  mockPrisma.property.create.mockImplementation(({ data }) => Promise.resolve({
    id: 'prop-1',
    ...data,
    units: data.units ? data.units.create.map((u, i) => ({ id: `u-${i}`, ...u })) : [],
  }));
});

describe('propertyController.create — onboarding fields', () => {
  it('creates numbered placeholder units when the landlord only knows the unit count', async () => {
    const { req, res, next } = mockReqRes({ ...BASE, propertyType: 'MULTI_FAMILY', unitCount: '2' });
    await propertyController.create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);

    const { data } = mockPrisma.property.create.mock.calls[0][0];
    expect(data.landlordId).toBe('landlord-1');
    expect(data.propertyType).toBe('MULTI_FAMILY');
    expect(data.unitCount).toBeUndefined();
    expect(data.units.create).toEqual([
      { name: 'Unit 1', rentAmount: 0 },
      { name: 'Unit 2', rentAmount: 0 },
    ]);
    expect(res.body.property.units).toHaveLength(2);
  });

  it('gives a single-unit property one unit called Main', async () => {
    const { req, res, next } = mockReqRes({ ...BASE, propertyType: 'SINGLE_FAMILY', unitCount: 1 });
    await propertyController.create(req, res, next);

    const { data } = mockPrisma.property.create.mock.calls[0][0];
    expect(data.units.create).toEqual([{ name: 'Main', rentAmount: 0 }]);
  });

  it('creates no units when unitCount is omitted, exactly as before', async () => {
    const { req, res, next } = mockReqRes(BASE);
    await propertyController.create(req, res, next);

    const { data } = mockPrisma.property.create.mock.calls[0][0];
    expect(data.units).toBeUndefined();
    expect(data.propertyType).toBeUndefined();
    expect(res.statusCode).toBe(201);
  });

  it('rejects an unknown property type', async () => {
    const { req, res, next } = mockReqRes({ ...BASE, propertyType: 'CASTLE' });
    await propertyController.create(req, res, next);

    expect(next.mock.calls[0][0].name).toBe('ZodError');
    expect(mockPrisma.property.create).not.toHaveBeenCalled();
  });

  it('refuses an absurd unit count instead of creating hundreds of thousands of rows', async () => {
    const { req, res, next } = mockReqRes({ ...BASE, unitCount: 100000 });
    await propertyController.create(req, res, next);

    expect(next.mock.calls[0][0].name).toBe('ZodError');
    expect(mockPrisma.property.create).not.toHaveBeenCalled();
  });
});
