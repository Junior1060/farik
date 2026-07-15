const { z } = require('zod');
const prisma = require('../lib/prisma');
const agentService = require('../services/agentService');
const policyEngine = require('../services/policyEngine');
const maintenanceWorkflow = require('../services/workflows/maintenanceWorkflow');
const vendorDispatchService = require('../services/vendorDispatchService');

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

    // Route into the full SMS-capable workflow (diagnostics, deterministic emergency
    // triage, vendor dispatch) only for tenants who've opted into SMS and whose
    // policy trust level isn't OBSERVE; otherwise keep today's direct triage path
    // untouched so existing behavior never regresses.
    const { tenant, unit } = request;
    if (tenant.phone && tenant.smsConsent) {
      const policy = await policyEngine.getEffectivePolicy(unit.property.landlordId, unit.property.id, 'MAINTENANCE');
      if (policy.trustLevel !== 'OBSERVE') {
        maintenanceWorkflow.startWorkflow(request.id).catch(console.error);
      } else {
        agentService.triageMaintenanceRequest(request).catch(console.error);
      }
    } else {
      agentService.triageMaintenanceRequest(request).catch(console.error);
    }

    res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const where = req.user.role === 'LANDLORD'
      ? { id: req.params.id, unit: { property: { landlordId: req.user.landlordProfile.id } } }
      : { id: req.params.id, tenantId: req.user.tenantProfile.id };

    const request = await prisma.maintenanceRequest.findFirst({
      where,
      include: {
        tenant: true,
        unit: { include: { property: true } },
        workflow: true,
        appointments: { include: { vendor: true }, orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!request) return res.status(404).json({ error: 'Maintenance request not found' });

    const [timeline, contactAttempts] = await Promise.all([
      request.workflow
        ? prisma.workflowEvent.findMany({ where: { workflowType: 'MAINTENANCE', workflowId: request.workflow.id }, orderBy: { createdAt: 'asc' } })
        : Promise.resolve([]),
      request.workflow
        ? prisma.vendorContactAttempt.findMany({ where: { maintenanceWorkflowId: request.workflow.id }, include: { vendor: true }, orderBy: { attemptNumber: 'asc' } })
        : Promise.resolve([]),
    ]);

    res.json({ request, timeline, contactAttempts });
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

const approveWorkflow = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.id, unit: { property: { landlordId } } },
      include: { workflow: true },
    });
    if (!request || !request.workflow) return res.status(404).json({ error: 'Maintenance workflow not found' });
    if (request.workflow.state !== 'AWAITING_LANDLORD_APPROVAL') {
      return res.status(409).json({ error: `Workflow is in ${request.workflow.state}, not awaiting approval` });
    }

    await maintenanceWorkflow.approveByLandlord(request.workflow.id, req.user.id);
    await vendorDispatchService.dispatchNextVendor(request.workflow.id);

    const workflow = await prisma.maintenanceWorkflow.findUnique({ where: { id: request.workflow.id } });
    res.json({ workflow });
  } catch (err) {
    next(err);
  }
};

const cancelWorkflow = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.id, unit: { property: { landlordId } } },
      include: { workflow: true },
    });
    if (!request || !request.workflow) return res.status(404).json({ error: 'Maintenance workflow not found' });

    await maintenanceWorkflow.cancel(request.workflow.id, { actorType: 'LANDLORD', actorId: req.user.id, reason: req.body?.reason || 'Cancelled by landlord' });
    const workflow = await prisma.maintenanceWorkflow.findUnique({ where: { id: request.workflow.id } });
    res.json({ workflow });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, approveWorkflow, cancelWorkflow };
