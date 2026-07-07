const { z } = require('zod');
const prisma = require('../lib/prisma');
const agentService = require('../services/agentService');

const requestSchema = z.object({
  unitId: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

const updateSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

const getAll = async (req, res, next) => {
  try {
    let where = {};

    if (req.user.role === 'LANDLORD') {
      const landlordId = req.user.landlordProfile.id;
      const properties = await prisma.property.findMany({ where: { landlordId }, select: { id: true } });
      const propertyIds = properties.map((p) => p.id);
      where = { unit: { propertyId: { in: propertyIds } } };
    } else {
      where = { tenantId: req.user.tenantProfile.id };
    }

    const { status, priority } = req.query;
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const requests = await prisma.maintenanceRequest.findMany({
      where,
      include: {
        tenant: true,
        unit: { include: { property: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ requests });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantProfile.id;
    const data = requestSchema.parse(req.body);
    const photos = (req.files || []).map((f) => `/uploads/maintenance/${f.filename}`);

    const request = await prisma.maintenanceRequest.create({
      data: {
        tenantId,
        unitId: data.unitId,
        title: data.title,
        description: data.description,
        photos,
        priority: data.priority || 'MEDIUM',
        status: 'OPEN',
      },
      include: { tenant: true, unit: { include: { property: true } } },
    });
    // Trigger AI triage in background
    agentService.triageMaintenanceRequest(request).catch(console.error);

    res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const updateData = {};
    if (data.status) {
      updateData.status = data.status;
      if (data.status === 'RESOLVED') updateData.resolvedAt = new Date();
    }
    if (data.priority) updateData.priority = data.priority;

    const request = await prisma.maintenanceRequest.update({
      where: { id: req.params.id },
      data: updateData,
      include: { tenant: true, unit: { include: { property: true } } },
    });
    res.json({ request });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, create, update };
