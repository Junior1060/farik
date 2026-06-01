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

const getOne = async (req, res, next) => {
  try {
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

    res.json({ tenant: user.tenantProfile, email: user.email });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, update, remove, lookupByEmail };
