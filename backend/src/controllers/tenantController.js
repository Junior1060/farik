const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { canLinkTenant } = require('./leaseController');

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
        user: { select: { email: true, accountStatus: true } },
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
      return res.status(404).json({ error: 'No tenant account found with this email. Add them as a new tenant instead.' });
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

// PUT /api/tenants/:id/sms-consent — landlord attesting they have the tenant's
// permission to text them. Needed because imported tenants often have no usable
// portal login, so self-service consent alone would strand them.
//
// Two rules make this safe: a landlord may only ever *grant* here, and never over a
// tenant's own STOP. Undoing an opt-out has to come from the tenant themselves.
const attestSmsConsent = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const owns = await assertLandlordOwnsTenant(landlordId, req.params.id);
    if (!owns) return res.status(404).json({ error: 'Tenant not found' });

    const tenant = await prisma.tenantProfile.findUnique({ where: { id: req.params.id } });
    if (!tenant.phone) {
      return res.status(400).json({ error: 'Add a mobile number for this tenant before enabling text messages.' });
    }
    if (tenant.smsOptOutAt) {
      return res.status(409).json({
        error: 'This tenant has opted out of texts. Only they can resume messaging, by replying START.',
      });
    }
    if (tenant.smsConsent) return res.json({ tenant });

    const updated = await prisma.tenantProfile.update({
      where: { id: req.params.id },
      data: { smsConsent: true, smsConsentAt: new Date(), smsConsentSource: 'LANDLORD_ATTESTED' },
    });
    res.json({ tenant: updated });
  } catch (err) {
    next(err);
  }
};

// POST /api/tenants — a landlord adding a tenant themselves.
//
// A tenant only shows up for a landlord once they hold a lease on one of that
// landlord's units (see getAll), so "add a tenant" necessarily means "create the
// tenant AND their first lease" in one step. If nobody has registered with that
// email yet, the account is created INVITED with a random placeholder password;
// the tenant activates it by signing up with the same email.
const createTenantSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
  email: z.string().trim().email('Enter a valid email address.').max(200).transform((s) => s.toLowerCase()),
  phone: z.string().trim().max(40).optional().nullable(),
  unitId: z.string().min(1, 'Choose a unit.'),
  startDate: z.string().min(1, 'Lease start date is required.'),
  endDate: z.string().min(1, 'Lease end date is required.'),
  monthlyRent: z.coerce.number().positive('Monthly rent must be greater than zero.'),
  deposit: z.coerce.number().min(0).default(0),
  notes: z.string().max(2000).optional().nullable(),
});

const create = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const data = createTenantSchema.parse(req.body);

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Enter valid lease dates.' });
    }
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'The lease end date must be after the start date.' });
    }

    const unit = await prisma.unit.findFirst({
      where: { id: data.unitId, property: { landlordId } },
    });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    let user = await prisma.user.findFirst({
      where: { email: { equals: data.email, mode: 'insensitive' } },
      include: { tenantProfile: true },
    });

    if (user && user.role !== 'TENANT') {
      return res.status(409).json({
        error: 'That email belongs to a landlord account. Use a different email address for the tenant.',
      });
    }

    if (!user) {
      const placeholder = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = await prisma.user.create({
        data: {
          email: data.email,
          password: placeholder,
          role: 'TENANT',
          accountStatus: 'INVITED',
          tenantProfile: {
            create: { firstName: data.firstName, lastName: data.lastName, phone: data.phone || null },
          },
        },
        include: { tenantProfile: true },
      });
    } else if (!user.tenantProfile) {
      user.tenantProfile = await prisma.tenantProfile.create({
        data: { userId: user.id, firstName: data.firstName, lastName: data.lastName, phone: data.phone || null },
      });
    }

    const tenant = user.tenantProfile;

    if (!(await canLinkTenant(tenant.id, landlordId))) {
      return res.status(403).json({
        error: 'This tenant already rents with another landlord on Farik and cannot be added here.',
      });
    }

    const lease = await prisma.lease.create({
      data: {
        tenantId: tenant.id,
        unitId: unit.id,
        startDate,
        endDate,
        monthlyRent: data.monthlyRent,
        deposit: data.deposit,
        status: 'ACTIVE',
        notes: data.notes || null,
      },
      include: { unit: { include: { property: true } } },
    });

    await prisma.unit.update({ where: { id: unit.id }, data: { isOccupied: true } });

    res.status(201).json({
      tenant: { ...tenant, user: { email: user.email, accountStatus: user.accountStatus } },
      lease,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove, lookupByEmail, attestSmsConsent };
