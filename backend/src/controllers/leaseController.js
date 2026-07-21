const { z } = require('zod');
const prisma = require('../lib/prisma');

const leaseSchema = z.object({
  tenantId: z.string(),
  unitId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  monthlyRent: z.number().positive(),
  deposit: z.number().positive(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'TERMINATED', 'PENDING']).optional(),
  notes: z.string().optional(),
});

const getAll = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const properties = await prisma.property.findMany({ where: { landlordId }, select: { id: true } });
    const propertyIds = properties.map((p) => p.id);

    const leases = await prisma.lease.findMany({
      where: { unit: { propertyId: { in: propertyIds } } },
      include: {
        tenant: true,
        unit: { include: { property: true } },
        payments: { orderBy: { dueDate: 'desc' }, take: 1 },
      },
      orderBy: { startDate: 'desc' },
    });

    res.json({ leases });
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const lease = await prisma.lease.findFirst({
      where: { id: req.params.id, unit: { property: { landlordId } } },
      include: {
        tenant: true,
        unit: { include: { property: true } },
        payments: { orderBy: { dueDate: 'desc' } },
        notices: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    res.json({ lease });
  } catch (err) {
    next(err);
  }
};

// A tenant with no prior leases anywhere is a genuine new tenant being onboarded — safe to
// link. A tenant who already has a lease with THIS landlord (renewal / second unit) is also
// safe. But a tenant whose only existing leases are with OTHER landlords already has an
// established housing relationship elsewhere — linking them here would let any landlord
// attach (and bill) a tenant they've never actually interacted with. Block that case.
async function canLinkTenant(tenantId, landlordId) {
  const existingLeases = await prisma.lease.findMany({
    where: { tenantId },
    select: { unit: { select: { property: { select: { landlordId: true } } } } },
  });
  if (existingLeases.length === 0) return true;
  return existingLeases.some((l) => l.unit.property.landlordId === landlordId);
}

const create = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const data = leaseSchema.parse(req.body);

    const unit = await prisma.unit.findFirst({
      where: { id: data.unitId, property: { landlordId } },
    });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const tenant = await prisma.tenantProfile.findUnique({ where: { id: data.tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    if (!(await canLinkTenant(data.tenantId, landlordId))) {
      return res.status(403).json({ error: 'This tenant already has a lease with another landlord and cannot be added here.' });
    }

    const lease = await prisma.lease.create({
      data: {
        tenantId: data.tenantId,
        unitId: data.unitId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        monthlyRent: data.monthlyRent,
        deposit: data.deposit,
        status: data.status || 'ACTIVE',
        notes: data.notes,
      },
      include: { tenant: true, unit: { include: { property: true } } },
    });

    // Mark unit as occupied
    await prisma.unit.update({ where: { id: data.unitId }, data: { isOccupied: true } });

    res.status(201).json({ lease });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const existing = await prisma.lease.findFirst({
      where: { id: req.params.id, unit: { property: { landlordId } } },
    });
    if (!existing) return res.status(404).json({ error: 'Lease not found' });

    const data = leaseSchema.partial().parse(req.body);
    const updateData = {};
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);
    if (data.monthlyRent) updateData.monthlyRent = data.monthlyRent;
    if (data.deposit) updateData.deposit = data.deposit;
    if (data.status) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const lease = await prisma.lease.update({
      where: { id: req.params.id },
      data: updateData,
      include: { tenant: true, unit: { include: { property: true } } },
    });
    res.json({ lease });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const existing = await prisma.lease.findFirst({
      where: { id: req.params.id, unit: { property: { landlordId } } },
    });
    if (!existing) return res.status(404).json({ error: 'Lease not found' });
    await prisma.lease.delete({ where: { id: req.params.id } });
    res.json({ message: 'Lease deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove, canLinkTenant };
