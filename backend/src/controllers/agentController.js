const { z } = require('zod');
const prisma = require('../lib/prisma');
const agentService = require('../services/agentService');

const configSchema = z.object({
  isEnabled: z.boolean().optional(),
  autoRentReminders: z.boolean().optional(),
  autoMaintenance: z.boolean().optional(),
  autoMessages: z.boolean().optional(),
  autoLeaseRenewal: z.boolean().optional(),
});

const vendorSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().nullable(),
  specialty: z.string().min(1),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const getConfig = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const config = await agentService.getOrCreateConfig(landlordId);
    res.json({ config });
  } catch (err) {
    next(err);
  }
};

const updateConfig = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const data = configSchema.parse(req.body);
    const config = await prisma.agentConfig.upsert({
      where: { landlordId },
      update: data,
      create: { landlordId, ...data },
    });
    res.json({ config });
  } catch (err) {
    next(err);
  }
};

const getLogs = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const { status, actionType, page = 1, limit = 50 } = req.query;
    const where = { landlordId };
    if (status) where.status = status;
    if (actionType) where.actionType = actionType;

    const [logs, total] = await Promise.all([
      prisma.agentLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.agentLog.count({ where }),
    ]);
    res.json({ logs, total });
  } catch (err) {
    next(err);
  }
};

async function executeDraftContent(draftContent, landlordId) {
  let draft;
  try { draft = JSON.parse(draftContent); } catch { return; }

  if (draft.type === 'notice') {
    await prisma.notice.create({
      data: {
        landlordId,
        tenantId: draft.tenantId,
        leaseId: draft.leaseId || null,
        title: draft.title,
        body: draft.body,
        status: 'SENT',
        sentAt: new Date(),
      },
    });
  } else if (draft.type === 'message' && draft.conversationId && draft.body) {
    const landlordProfile = await prisma.landlordProfile.findUnique({
      where: { id: landlordId },
      select: { userId: true },
    });
    await prisma.message.create({
      data: { conversationId: draft.conversationId, senderId: landlordProfile.userId, body: draft.body },
    });
    await prisma.conversation.update({
      where: { id: draft.conversationId },
      data: { updatedAt: new Date() },
    });
  }
  // 'booking' type: no further automated action needed
}

const approveLog = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const log = await prisma.agentLog.findFirst({
      where: { id: req.params.id, landlordId, status: 'ESCALATED' },
    });
    if (!log) return res.status(404).json({ error: 'Log not found or not pending approval' });

    // Execute draft content (notices, messages, etc.)
    if (log.draftContent) {
      await executeDraftContent(log.draftContent, landlordId);
    } else if (log.actionType === 'LEASE_RENEWAL_DRAFT') {
      // Legacy path: no draftContent stored, build notice from details
      const lease = await prisma.lease.findUnique({ where: { id: log.entityId }, include: { tenant: true } });
      if (lease) {
        const details = log.details;
        await prisma.notice.create({
          data: {
            landlordId,
            tenantId: lease.tenantId,
            leaseId: lease.id,
            title: 'Lease Renewal Offer',
            body: `Dear ${lease.tenant.firstName},\n\nYour lease expires on ${new Date(lease.endDate).toDateString()}.\n\nWe would like to offer you a renewal for another year at $${details?.suggestedRenewalRent || lease.monthlyRent}/month.\n\nPlease contact us to discuss the renewal terms.\n\nSincerely,\nProperty Management`,
            status: 'SENT',
            sentAt: new Date(),
          },
        });
      }
    }

    const updated = await prisma.agentLog.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', updatedAt: new Date() },
    });
    res.json({ log: updated });
  } catch (err) {
    next(err);
  }
};

const rejectLog = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const log = await prisma.agentLog.findFirst({
      where: { id: req.params.id, landlordId, status: 'ESCALATED' },
    });
    if (!log) return res.status(404).json({ error: 'Log not found or not pending approval' });

    const updated = await prisma.agentLog.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', updatedAt: new Date() },
    });
    res.json({ log: updated });
  } catch (err) {
    next(err);
  }
};

const getVendors = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const vendors = await prisma.vendor.findMany({
      where: { landlordId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ vendors });
  } catch (err) {
    next(err);
  }
};

const createVendor = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const data = vendorSchema.parse(req.body);
    const vendor = await prisma.vendor.create({ data: { landlordId, ...data } });
    res.status(201).json({ vendor });
  } catch (err) {
    next(err);
  }
};

const updateVendor = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const existing = await prisma.vendor.findFirst({ where: { id: req.params.id, landlordId } });
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });
    const data = vendorSchema.partial().parse(req.body);
    const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data });
    res.json({ vendor });
  } catch (err) {
    next(err);
  }
};

const deleteVendor = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const existing = await prisma.vendor.findFirst({ where: { id: req.params.id, landlordId } });
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });
    await prisma.vendor.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const REMINDER_OFFSETS = [
  { offset: -3, actionType: 'RENT_REMINDER',       summary: '3-day rent reminder',              confidence: 'HIGH' },
  { offset:  0, actionType: 'RENT_REMINDER',       summary: 'Rent due today reminder',          confidence: 'HIGH' },
  { offset:  1, actionType: 'RENT_REMINDER',       summary: '1-day overdue notice',             confidence: 'HIGH' },
  { offset:  3, actionType: 'LATE_RENT_NOTICE',    summary: 'Formal 3-day late rent notice',    confidence: 'HIGH' },
  { offset:  7, actionType: 'LATE_RENT_ESCALATION',summary: '7-day escalation to landlord',     confidence: 'LOW'  },
];

const getTimeline = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysOut = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Past executed/escalated logs (last 7 days)
    const pastLogs = await prisma.agentLog.findMany({
      where: {
        landlordId,
        status: { notIn: ['SCHEDULED', 'CANCELLED'] },
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Cancellation markers
    const cancellations = await prisma.agentLog.findMany({
      where: { landlordId, status: 'CANCELLED' },
    });

    // Active leases with pending payments and end dates
    const activeLeases = await prisma.lease.findMany({
      where: { status: 'ACTIVE', unit: { property: { landlordId } } },
      include: {
        tenant: true,
        unit: { include: { property: true } },
        payments: {
          where: { status: { in: ['PENDING', 'OVERDUE'] } },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    const futureEntries = [];

    for (const lease of activeLeases) {
      const tName = `${lease.tenant.firstName} ${lease.tenant.lastName}`;
      const uName = lease.unit.name;
      const pName = lease.unit.property.name;

      // Rent reminders for each upcoming payment
      for (const payment of lease.payments) {
        const base = new Date(payment.dueDate);
        base.setHours(8, 0, 0, 0);

        for (const { offset, actionType, summary, confidence } of REMINDER_OFFSETS) {
          const scheduledAt = new Date(base);
          scheduledAt.setDate(scheduledAt.getDate() + offset);

          if (scheduledAt <= today || scheduledAt > thirtyDaysOut) continue;

          // Already executed today?
          const done = pastLogs.some(
            (l) =>
              l.entityId === payment.id &&
              l.actionType === actionType &&
              new Date(l.createdAt).toDateString() === scheduledAt.toDateString()
          );
          if (done) continue;

          const cancelled = cancellations.some(
            (c) =>
              c.entityId === payment.id &&
              c.actionType === actionType &&
              c.scheduledAt &&
              new Date(c.scheduledAt).toDateString() === scheduledAt.toDateString()
          );

          futureEntries.push({
            id: `v:${payment.id}:${actionType}:${scheduledAt.getTime()}`,
            isVirtual: true,
            actionType,
            summary,
            tenantName: tName,
            unitName: uName,
            propertyName: pName,
            time: scheduledAt,
            status: cancelled ? 'CANCELLED' : 'SCHEDULED',
            entityType: 'payment',
            entityId: payment.id,
            confidence,
            cancellable: !cancelled,
          });
        }
      }

      // Lease renewal (90 days before expiry)
      const renewalAt = new Date(lease.endDate);
      renewalAt.setDate(renewalAt.getDate() - 90);
      renewalAt.setHours(9, 0, 0, 0);

      if (renewalAt > today && renewalAt <= thirtyDaysOut) {
        const done = pastLogs.some(
          (l) => l.entityId === lease.id && l.actionType === 'LEASE_RENEWAL_DRAFT'
        );
        if (!done) {
          const cancelled = cancellations.some(
            (c) => c.entityId === lease.id && c.actionType === 'LEASE_RENEWAL_DRAFT'
          );
          futureEntries.push({
            id: `v:${lease.id}:LEASE_RENEWAL_DRAFT:${renewalAt.getTime()}`,
            isVirtual: true,
            actionType: 'LEASE_RENEWAL_DRAFT',
            summary: 'Lease renewal draft — send to landlord for approval',
            tenantName: tName,
            unitName: uName,
            propertyName: pName,
            time: renewalAt,
            status: cancelled ? 'CANCELLED' : 'SCHEDULED',
            entityType: 'lease',
            entityId: lease.id,
            confidence: 'LOW',
            cancellable: !cancelled,
          });
        }
      }
    }

    // Map past logs → timeline format
    const pastEntries = pastLogs.map((log) => ({
      id: log.id,
      isVirtual: false,
      actionType: log.actionType,
      summary: log.summary,
      tenantName: log.details?.tenantName || null,
      unitName: log.details?.unitName || null,
      propertyName: log.details?.propertyName || null,
      time: log.createdAt,
      status: log.status === 'EXECUTED' ? 'COMPLETED' : log.status,
      entityType: log.entityType,
      entityId: log.entityId,
      confidence: log.confidence,
      cancellable: false,
      details: log.details,
    }));

    const entries = [...pastEntries, ...futureEntries].sort(
      (a, b) => new Date(a.time) - new Date(b.time)
    );

    res.json({ entries });
  } catch (err) {
    next(err);
  }
};

const cancelScheduled = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const { entityId, entityType, actionType, scheduledAt } = req.body;

    // Idempotent — don't double-create
    const existing = await prisma.agentLog.findFirst({
      where: { landlordId, entityId, actionType, status: 'CANCELLED' },
    });
    if (existing) return res.json({ log: existing });

    const log = await prisma.agentLog.create({
      data: {
        landlordId,
        actionType,
        confidence: 'HIGH',
        summary: `Cancelled by landlord: ${actionType.toLowerCase().replace(/_/g, ' ')}`,
        entityType,
        entityId,
        status: 'CANCELLED',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      },
    });
    res.json({ log });
  } catch (err) {
    next(err);
  }
};

const undoLog = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const log = await prisma.agentLog.findFirst({
      where: { id: req.params.id, landlordId, status: 'EXECUTED' },
    });
    if (!log) return res.status(404).json({ error: 'Log not found or cannot be undone' });

    // Best-effort reversal for message responses
    if (log.actionType === 'MESSAGE_RESPONSE' && log.entityId && log.details?.response) {
      await prisma.message.deleteMany({
        where: { conversationId: log.entityId, body: log.details.response },
      });
    }

    const updated = await prisma.agentLog.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', updatedAt: new Date() },
    });
    res.json({ log: updated });
  } catch (err) {
    next(err);
  }
};

const dismissLog = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const log = await prisma.agentLog.findFirst({
      where: { id: req.params.id, landlordId, status: 'ESCALATED' },
    });
    if (!log) return res.status(404).json({ error: 'Log not found or not pending approval' });
    const updated = await prisma.agentLog.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', updatedAt: new Date() },
    });
    res.json({ log: updated });
  } catch (err) {
    next(err);
  }
};

const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const unreadCount = await prisma.notification.count({ where: { userId, read: false } });
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
};

const markNotificationsRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const getEscalations = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const escalations = await prisma.agentLog.findMany({
      where: { landlordId, status: 'ESCALATED' },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ escalations });
  } catch (err) {
    next(err);
  }
};

const triggerAgentRun = async (req, res, next) => {
  try {
    agentService.runRentReminderCheck().catch(console.error);
    agentService.runLeaseRenewalCheck().catch(console.error);
    res.json({ message: 'Agent checks triggered successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getConfig,
  updateConfig,
  getLogs,
  approveLog,
  rejectLog,
  dismissLog,
  undoLog,
  getTimeline,
  cancelScheduled,
  getEscalations,
  getNotifications,
  markNotificationsRead,
  getVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  triggerAgentRun,
};
