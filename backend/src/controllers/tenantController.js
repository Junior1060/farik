const { z } = require('zod');
const prisma = require('../lib/prisma');

const tenantSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
});

const getAll = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;

    const properties = await prisma.property.findMany({
      where: { landlordId },
      select: { id: true },
    });
    const propertyIds = properties.map((p) => p.id);

    const tenants = await prisma.tenantProfile.findMany({
      where: {
        leases: {
          some: { unit: { propertyId: { in: propertyIds } } },
        },
      },
      include: {
        user: { select: { email: true } },
        leases: {
          orderBy: { startDate: 'desc' },
          take: 1,
          include: { unit: { include: { property: true } } },
        },
        payments: {
          orderBy: { dueDate: 'desc' },
          take: 1,
        },
      },
    });

    res.json({ tenants });
  } catch (err) {
    next(err);
  }
};

// Every tenant-scoped mutation/read below must confirm the tenant has at least one
// lease on a unit under this landlord's own properties before proceeding — the same
// scoping shape already used by getAll — otherwise any landlord could read/edit/delete
// any other landlord's tenants by guessing an id.
async function assertLandlordOwnsTenant(landlordId, tenantId) {
  return prisma.tenantProfile.findFirst({
    where: { id: tenantId, leases: { some: { unit: { property: { landlordId } } } } },
  });
}

const getOne = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const owns = await assertLandlordOwnsTenant(landlordId, req.params.id);
    if (!owns) return res.status(404).json({ error: 'Tenant not found' });

    const tenant = await prisma.tenantProfile.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { email: true, createdAt: true } },
        leases: {
          include: { unit: { include: { property: true } }, payments: { orderBy: { dueDate: 'desc' }, take: 6 } },
        },
        maintenanceRequests: { orderBy: { createdAt: 'desc' }, include: { unit: true } },
        notices: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ tenant });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const owns = await assertLandlordOwnsTenant(landlordId, req.params.id);
    if (!owns) return res.status(404).json({ error: 'Tenant not found' });

    const data = tenantSchema.partial().parse(req.body);
    const tenant = await prisma.tenantProfile.update({
      where: { id: req.params.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
    });
    res.json({ tenant });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const owns = await assertLandlordOwnsTenant(landlordId, req.params.id);
    if (!owns) return res.status(404).json({ error: 'Tenant not found' });

    await prisma.tenantProfile.delete({ where: { id: req.params.id } });
    res.json({ message: 'Tenant deleted' });
  } catch (err) {
    next(err);
  }
};

const lookupByEmail = async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenantProfile: true },
    });

    if (!user || !user.tenantProfile) {
      return res.status(404).json({ error: 'No tenant account found with this email. Ask them to sign up at /register first.' });
    }

    // This lookup intentionally spans all landlords (used by onboarding/import to find
    // an existing user by email before attaching a new lease), but the caller has no
    // established relationship with this tenant yet — never return phone/contact info
    // here, only enough to confirm the account exists and link it.
    const { phone, ...tenantProfileSafe } = user.tenantProfile;
    res.json({ tenant: tenantProfileSafe, email: user.email });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, update, remove, lookupByEmail };
