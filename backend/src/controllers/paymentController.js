const { z } = require('zod');
const prisma = require('../lib/prisma');

const paymentSchema = z.object({
  leaseId: z.string(),
  tenantId: z.string(),
  amount: z.number().positive(),
  dueDate: z.string(),
  paidDate: z.string().optional().nullable(),
  status: z.enum(['PAID', 'PENDING', 'OVERDUE', 'PARTIAL']).optional(),
  description: z.string().optional(),
});

const getAll = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const properties = await prisma.property.findMany({ where: { landlordId }, select: { id: true } });
    const propertyIds = properties.map((p) => p.id);

    const { status, tenantId, month } = req.query;
    const where = { lease: { unit: { propertyId: { in: propertyIds } } } };

    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;
    if (month) {
      const [year, m] = month.split('-');
      where.dueDate = {
        gte: new Date(Number(year), Number(m) - 1, 1),
        lt: new Date(Number(year), Number(m), 1),
      };
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        tenant: true,
        lease: { include: { unit: { include: { property: true } } } },
      },
      orderBy: { dueDate: 'desc' },
    });

    // Summary stats
    const totalCollected = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0);
    const totalPending = payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0);
    const totalOverdue = payments.filter((p) => p.status === 'OVERDUE').reduce((s, p) => s + p.amount, 0);
    const totalPartial = payments.filter((p) => p.status === 'PARTIAL').reduce((s, p) => s + p.amount, 0);

    res.json({ payments, summary: { totalCollected, totalPending, totalOverdue, totalPartial } });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = paymentSchema.parse(req.body);
    const payment = await prisma.payment.create({
      data: {
        leaseId: data.leaseId,
        tenantId: data.tenantId,
        amount: data.amount,
        dueDate: new Date(data.dueDate),
        paidDate: data.paidDate ? new Date(data.paidDate) : null,
        status: data.status || 'PENDING',
        description: data.description,
      },
      include: { tenant: true, lease: { include: { unit: true } } },
    });
    res.status(201).json({ payment });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = paymentSchema.partial().parse(req.body);
    const updateData = {};
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.paidDate !== undefined) updateData.paidDate = data.paidDate ? new Date(data.paidDate) : null;
    if (data.status) updateData.status = data.status;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);

    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: updateData,
      include: { tenant: true, lease: { include: { unit: true } } },
    });
    res.json({ payment });
  } catch (err) {
    next(err);
  }
};

// Tenant: get their own payments
const getMyPayments = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantProfile.id;
    const payments = await prisma.payment.findMany({
      where: { tenantId },
      include: { lease: { include: { unit: { include: { property: true } } } } },
      orderBy: { dueDate: 'desc' },
    });
    res.json({ payments });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, create, update, getMyPayments };
