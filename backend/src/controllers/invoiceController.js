const { z } = require('zod');
const prisma = require('../lib/prisma');
const workflowEngine = require('../services/workflowEngine');
const invoiceExtractionService = require('../services/invoiceExtractionService');
const { TRANSITIONS } = require('../services/workflows/maintenanceWorkflow');

const approveSchema = z.object({ finalCost: z.number().optional() });
const rejectSchema = z.object({ reason: z.string().min(1) });

async function assertLandlordOwnsRequest(landlordId, maintenanceRequestId) {
  const request = await prisma.maintenanceRequest.findFirst({
    where: { id: maintenanceRequestId, unit: { property: { landlordId } } },
    include: { unit: { include: { property: true } }, workflow: true },
  });
  return request;
}

const upload = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const { maintenanceRequestId, vendorId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No invoice file uploaded' });

    const request = await assertLandlordOwnsRequest(landlordId, maintenanceRequestId);
    if (!request) return res.status(404).json({ error: 'Maintenance request not found' });

    const invoice = await prisma.maintenanceInvoice.create({
      data: {
        maintenanceRequestId,
        vendorId: vendorId || null,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
    });

    const extracted = await invoiceExtractionService.extractInvoiceData(req.file.path);
    const updated = extracted
      ? await prisma.maintenanceInvoice.update({
          where: { id: invoice.id },
          data: { extracted, extractedAmount: extracted.total ?? null },
        })
      : invoice;

    if (request.workflow) {
      const fromState = request.workflow.state;
      if (fromState === 'WORK_COMPLETED_PENDING_INVOICE') {
        await transitionWorkflow(request.workflow.id, landlordId, fromState, 'INVOICE_RECEIVED', 'Invoice uploaded');
      }
      if (extracted && (fromState === 'WORK_COMPLETED_PENDING_INVOICE' || fromState === 'INVOICE_RECEIVED')) {
        await transitionWorkflow(request.workflow.id, landlordId, 'INVOICE_RECEIVED', 'INVOICE_EXTRACTED', 'Invoice data extracted');
      }
    }

    res.status(201).json({ invoice: updated });
  } catch (err) {
    next(err);
  }
};

async function transitionWorkflow(workflowId, landlordId, fromState, toState, reason) {
  return workflowEngine.transition({
    landlordId, workflowType: 'MAINTENANCE', workflowId, fromState, toState, transitions: TRANSITIONS,
    actorType: 'SYSTEM', reason,
    persist: (state) => prisma.maintenanceWorkflow.update({ where: { id: workflowId }, data: { state } }),
  });
}

const getForRequest = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const request = await assertLandlordOwnsRequest(landlordId, req.params.maintenanceRequestId);
    if (!request) return res.status(404).json({ error: 'Maintenance request not found' });

    const invoices = await prisma.maintenanceInvoice.findMany({
      where: { maintenanceRequestId: req.params.maintenanceRequestId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ invoices });
  } catch (err) {
    next(err);
  }
};

const approve = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    approveSchema.parse(req.body);
    const invoice = await prisma.maintenanceInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const request = await assertLandlordOwnsRequest(landlordId, invoice.maintenanceRequestId);
    if (!request) return res.status(404).json({ error: 'Maintenance request not found' });

    const updated = await prisma.maintenanceInvoice.update({
      where: { id: req.params.id },
      data: { approvalStatus: 'APPROVED', approvedByUserId: req.user.id, approvedAt: new Date() },
    });

    if (request.workflow) {
      const fromState = request.workflow.state;
      if (['INVOICE_RECEIVED', 'INVOICE_EXTRACTED', 'INVOICE_DISPUTED'].includes(fromState)) {
        await transitionWorkflow(request.workflow.id, landlordId, fromState, 'INVOICE_APPROVED', 'Landlord approved invoice');
        await transitionWorkflow(request.workflow.id, landlordId, 'INVOICE_APPROVED', 'RESOLVED', 'Invoice approved — request resolved');
      }
    }

    res.json({ invoice: updated });
  } catch (err) {
    next(err);
  }
};

const reject = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const { reason } = rejectSchema.parse(req.body);
    const invoice = await prisma.maintenanceInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const request = await assertLandlordOwnsRequest(landlordId, invoice.maintenanceRequestId);
    if (!request) return res.status(404).json({ error: 'Maintenance request not found' });

    const updated = await prisma.maintenanceInvoice.update({
      where: { id: req.params.id },
      data: { approvalStatus: 'REJECTED' },
    });

    if (request.workflow) {
      const fromState = request.workflow.state;
      if (['INVOICE_RECEIVED', 'INVOICE_EXTRACTED'].includes(fromState)) {
        await transitionWorkflow(request.workflow.id, landlordId, fromState, 'INVOICE_DISPUTED', `Landlord rejected invoice: ${reason}`);
      }
    }

    res.json({ invoice: updated });
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, getForRequest, approve, reject };
