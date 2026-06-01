const { z } = require('zod');
const prisma = require('../lib/prisma');

const noticeSchema = z.object({
  tenantId: z.string(),
  leaseId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  status: z.enum(['DRAFT', 'SENT']).optional(),
});

const getAll = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile?.id || req.user.tenantProfile?.id;
    const where = req.user.role === 'LANDLORD'
      ? { landlordId }
      : { tenantId: req.user.tenantProfile.id };

    const notices = await prisma.notice.findMany({
      where,
      include: {
        tenant: true,
        lease: { include: { unit: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ notices });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const data = noticeSchema.parse(req.body);

    const notice = await prisma.notice.create({
      data: {
        landlordId,
        tenantId: data.tenantId,
        leaseId: data.leaseId || null,
        title: data.title,
        body: data.body,
        status: data.status || 'DRAFT',
        sentAt: data.status === 'SENT' ? new Date() : null,
      },
      include: { tenant: true, lease: { include: { unit: true } } },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        landlordId,
        type: 'NOTICE',
        title: 'Notice created',
        description: `${data.title}`,
        entityId: data.tenantId,
      },
    });

    res.status(201).json({ notice });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const existing = await prisma.notice.findFirst({ where: { id: req.params.id, landlordId } });
    if (!existing) return res.status(404).json({ error: 'Notice not found' });

    const data = noticeSchema.partial().parse(req.body);
    const updateData = {};
    if (data.title) updateData.title = data.title;
    if (data.body) updateData.body = data.body;
    if (data.status) {
      updateData.status = data.status;
      if (data.status === 'SENT') updateData.sentAt = new Date();
    }

    const notice = await prisma.notice.update({
      where: { id: req.params.id },
      data: updateData,
      include: { tenant: true },
    });
    res.json({ notice });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, create, update };
