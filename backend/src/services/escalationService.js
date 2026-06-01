const prisma = require('../lib/prisma');
const emailService = require('./emailService');

/**
 * Central factory for all escalations.
 * Creates AgentLog (ESCALATED) + in-app Notification + sends email.
 */
async function createEscalation({
  landlordId,
  actionType,
  summary,
  details,
  draftContent,
  entityType,
  entityId,
}) {
  // Fetch landlord user info for notification + email
  const landlord = await prisma.landlordProfile.findUnique({
    where: { id: landlordId },
    include: { user: true },
  });
  if (!landlord) return null;

  const log = await prisma.agentLog.create({
    data: {
      landlordId,
      actionType,
      confidence: 'LOW',
      summary,
      details,
      draftContent: draftContent ? JSON.stringify(draftContent) : null,
      entityType,
      entityId,
      status: 'ESCALATED',
    },
  });

  // In-app notification
  await prisma.notification.create({
    data: {
      userId: landlord.userId,
      title: 'Action Required',
      body: summary,
      type: 'ESCALATION',
      entityId: log.id,
    },
  });

  // Email (async, non-blocking)
  emailService
    .sendEscalationEmail({
      to: landlord.user.email,
      title: summary,
      description: typeof details === 'object' ? (details?.context || summary) : summary,
      draftContent: draftContent ? JSON.stringify(draftContent) : null,
      escalationId: log.id,
    })
    .catch((err) => console.error('[Escalation] Email failed:', err.message));

  return log;
}

/**
 * Hourly cron: send 24h reminder, flip to urgent at 48h.
 */
async function checkEscalationReminders() {
  const now = new Date();
  const h24ago = new Date(now - 24 * 60 * 60 * 1000);
  const h48ago = new Date(now - 48 * 60 * 60 * 1000);

  // Send 24h reminders
  const needsReminder = await prisma.agentLog.findMany({
    where: { status: 'ESCALATED', reminderSentAt: null, createdAt: { lte: h24ago } },
    include: { landlord: { include: { user: true } } },
  });

  for (const log of needsReminder) {
    const hoursAgo = Math.floor((now - new Date(log.createdAt)) / (1000 * 60 * 60));
    await prisma.notification.create({
      data: {
        userId: log.landlord.userId,
        title: 'Reminder: Action Still Required',
        body: `Waiting ${hoursAgo}h: ${log.summary}`,
        type: 'REMINDER',
        entityId: log.id,
      },
    });
    emailService
      .sendReminderEmail({
        to: log.landlord.user.email,
        title: log.summary,
        escalationId: log.id,
        hoursAgo,
      })
      .catch(console.error);
    await prisma.agentLog.update({
      where: { id: log.id },
      data: { reminderSentAt: now, updatedAt: now },
    });
  }

  // Escalate to urgent at 48h
  const needsUrgent = await prisma.agentLog.findMany({
    where: { status: 'ESCALATED', urgentAt: null, createdAt: { lte: h48ago } },
    include: { landlord: { include: { user: true } } },
  });

  for (const log of needsUrgent) {
    await prisma.notification.create({
      data: {
        userId: log.landlord.userId,
        title: '⚠️ URGENT: Immediate Action Required',
        body: `48 hours with no response: ${log.summary}`,
        type: 'URGENT',
        entityId: log.id,
      },
    });
    emailService
      .sendUrgentEmail({ to: log.landlord.user.email, title: log.summary, escalationId: log.id })
      .catch(console.error);
    await prisma.agentLog.update({
      where: { id: log.id },
      data: { urgentAt: now, updatedAt: now },
    });
  }

  if (needsReminder.length || needsUrgent.length) {
    console.log(`[Escalation] Reminders: ${needsReminder.length} sent, Urgent: ${needsUrgent.length} escalated`);
  }
}

module.exports = { createEscalation, checkEscalationReminders };
