const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../lib/prisma');
const escalationService = require('./escalationService');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Farik AI, an autonomous property management assistant. You help landlords manage rental properties by handling routine tasks automatically.

Your principles:
- Act professionally and empathetically with tenants
- Prioritize tenant safety for maintenance emergencies
- Keep communication clear and concise
- Escalate complex or sensitive situations to the landlord

Always respond with valid JSON only. No markdown, no explanation outside the JSON.`;

async function getOrCreateConfig(landlordId) {
  let config = await prisma.agentConfig.findUnique({ where: { landlordId } });
  if (!config) {
    config = await prisma.agentConfig.create({ data: { landlordId } });
  }
  return config;
}

async function logAction({ landlordId, actionType, confidence, summary, details, entityType, entityId, status }) {
  return prisma.agentLog.create({
    data: { landlordId, actionType, confidence, summary, details, entityType, entityId, status },
  });
}

async function handleTenantMessage(message, conversationId) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            tenant: {
              include: {
                leases: {
                  where: { status: 'ACTIVE' },
                  include: {
                    unit: { include: { property: { include: { landlord: { include: { user: true } } } } } },
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!conversation?.participants?.length) return;
    const tenant = conversation.participants[0].tenant;
    const activeLease = tenant.leases?.[0];
    if (!activeLease) return;

    const landlord = activeLease.unit.property.landlord;
    const config = await getOrCreateConfig(landlord.id);
    if (!config.isEnabled || !config.autoMessages) return;

    const recentPayment = await prisma.payment.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { dueDate: 'desc' },
    });
    const paymentStatus = recentPayment
      ? `${recentPayment.status} (due ${new Date(recentPayment.dueDate).toDateString()})`
      : 'No recent payments';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `A tenant sent this message. Classify it and draft a response if appropriate.

Tenant: ${tenant.firstName} ${tenant.lastName}
Property: ${activeLease.unit.property.name}, Unit ${activeLease.unit.name}
Lease expires: ${new Date(activeLease.endDate).toDateString()}
Monthly rent: $${activeLease.monthlyRent}
Recent payment: ${paymentStatus}

Message: "${message.body}"

Classify this message. Escalation triggers requiring landlord input:
- CHARGE_DISPUTE: tenant disputes any charge, fee, or deduction
- LEASE_BREAK_REQUEST: tenant wants to end lease early or break it
- LEGAL_ESCALATION: message requires legal language or involves legal threats
- TENANT_COMPLAINT: complaint about a neighbour or another tenant

Return JSON:
{
  "category": "PAYMENT_QUESTION" | "MAINTENANCE_STATUS" | "LEASE_QUESTION" | "GENERAL_INQUIRY" | "CHARGE_DISPUTE" | "LEASE_BREAK_REQUEST" | "LEGAL_ESCALATION" | "TENANT_COMPLAINT",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "requiresEscalation": true | false,
  "autoResponse": "response text (null if requiresEscalation is true)",
  "escalationSummary": "one-line summary for landlord (null if not escalating)",
  "draftResponse": "AI-drafted response for landlord to approve (null if autoResponse is used)",
  "reason": "brief explanation"
}`,
        },
      ],
    });

    const result = JSON.parse(response.content[0].text.trim());
    const tName = `${tenant.firstName} ${tenant.lastName}`;
    const uName = `${activeLease.unit.name}, ${activeLease.unit.property.name}`;

    // Escalation triggers
    if (result.requiresEscalation) {
      const escalationActionMap = {
        CHARGE_DISPUTE:       'CHARGE_DISPUTE',
        LEASE_BREAK_REQUEST:  'LEASE_BREAK_REQUEST',
        LEGAL_ESCALATION:     'LEGAL_ESCALATION',
        TENANT_COMPLAINT:     'TENANT_COMPLAINT',
      };
      const actionType = escalationActionMap[result.category] || 'MESSAGE_RESPONSE';
      const escalationTitle = {
        CHARGE_DISPUTE:       `Charge dispute from ${tName}`,
        LEASE_BREAK_REQUEST:  `Lease break request from ${tName}`,
        LEGAL_ESCALATION:     `Legal matter raised by ${tName}`,
        TENANT_COMPLAINT:     `Tenant complaint from ${tName}`,
      }[result.category] || `Message requires your attention from ${tName}`;

      await escalationService.createEscalation({
        landlordId: landlord.id,
        actionType,
        summary: result.escalationSummary || escalationTitle,
        details: {
          context: `${tName} (${uName}) sent: "${message.body}"`,
          tenantName: tName,
          unitName: activeLease.unit.name,
          propertyName: activeLease.unit.property.name,
          messageBody: message.body,
          category: result.category,
          reason: result.reason,
        },
        draftContent: result.draftResponse
          ? { type: 'message', conversationId, body: result.draftResponse }
          : null,
        entityType: 'conversation',
        entityId: conversationId,
      });
      return;
    }

    if (result.confidence === 'HIGH' && result.autoResponse) {
      await prisma.message.create({
        data: { conversationId, senderId: landlord.userId, body: result.autoResponse },
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      await logAction({
        landlordId: landlord.id,
        actionType: 'MESSAGE_RESPONSE',
        confidence: 'HIGH',
        summary: `Auto-replied to ${tName}'s message about ${result.category.toLowerCase().replace(/_/g, ' ')}`,
        details: { messageBody: message.body, response: result.autoResponse, category: result.category, tenantName: tName, unitName: activeLease.unit.name },
        entityType: 'conversation',
        entityId: conversationId,
        status: 'EXECUTED',
      });
    } else {
      await logAction({
        landlordId: landlord.id,
        actionType: 'MESSAGE_RESPONSE',
        confidence: result.confidence,
        summary: `Tenant message needs attention: "${message.body.substring(0, 80)}${message.body.length > 80 ? '...' : ''}"`,
        details: {
          messageBody: message.body,
          category: result.category,
          reason: result.reason,
          suggestedResponse: result.autoResponse,
          tenantName: tName,
          unitName: activeLease.unit.name,
        },
        entityType: 'conversation',
        entityId: conversationId,
        status: 'ESCALATED',
      });
    }
  } catch (err) {
    console.error('[Agent] handleTenantMessage error:', err.message);
  }
}

async function triageMaintenanceRequest(request) {
  try {
    const unit = await prisma.unit.findUnique({
      where: { id: request.unitId },
      include: { property: { include: { landlord: true } } },
    });
    if (!unit) return;

    const landlord = unit.property.landlord;
    const config = await getOrCreateConfig(landlord.id);
    if (!config.isEnabled || !config.autoMaintenance) return;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `Triage this maintenance request.

Title: "${request.title}"
Description: "${request.description}"
Unit: ${unit.name}, ${unit.property.name}

Return JSON:
{
  "urgency": "EMERGENCY" | "HIGH" | "ROUTINE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "category": "plumbing" | "electrical" | "hvac" | "structural" | "appliance" | "general",
  "priority": "HIGH" | "MEDIUM" | "LOW",
  "estimatedCostMin": number or null,
  "estimatedCostMax": number or null,
  "summary": "one-line summary of what needs to be done",
  "reasoning": "why this urgency level"
}`,
        },
      ],
    });

    const result = JSON.parse(response.content[0].text.trim());

    if (result.priority && result.confidence !== 'LOW') {
      await prisma.maintenanceRequest.update({
        where: { id: request.id },
        data: { priority: result.priority },
      });
    }

    const vendor = await prisma.vendor.findFirst({
      where: {
        landlordId: landlord.id,
        isActive: true,
        specialty: { contains: result.category, mode: 'insensitive' },
      },
    });

    // Fetch tenant for escalation context
    const maintenanceFull = await prisma.maintenanceRequest.findUnique({
      where: { id: request.id },
      include: { tenant: true },
    });
    const tName = maintenanceFull
      ? `${maintenanceFull.tenant.firstName} ${maintenanceFull.tenant.lastName}`
      : 'Tenant';

    const estimatedMax = result.estimatedCostMax || 0;
    const isHighCost = estimatedMax > 500;
    const isEmergency = result.urgency === 'EMERGENCY';
    const autoAct = (isEmergency || result.confidence === 'HIGH') && !isHighCost;

    // Cost escalation — always pause if estimated > $500
    if (isHighCost) {
      await escalationService.createEscalation({
        landlordId: landlord.id,
        actionType: 'MAINTENANCE_ESCALATION',
        summary: `Maintenance cost $${estimatedMax}+ requires approval — ${result.summary}`,
        details: {
          context: `${tName} reported: "${request.title}" at ${unit.name}, ${unit.property.name}. Estimated cost: $${result.estimatedCostMin}–$${result.estimatedCostMax}.`,
          tenantName: tName,
          unitName: unit.name,
          propertyName: unit.property.name,
          estimatedCostMin: result.estimatedCostMin,
          estimatedCostMax: result.estimatedCostMax,
          category: result.category,
          urgency: result.urgency,
        },
        draftContent: vendor
          ? { type: 'booking', summary: `Proceed with ${result.category} work. Vendor: ${vendor.name} (${vendor.phone}). Est. cost: $${result.estimatedCostMin}–$${result.estimatedCostMax}.` }
          : null,
        entityType: 'maintenance',
        entityId: request.id,
      });
      return;
    }

    const summary = isEmergency
      ? `EMERGENCY: ${result.summary}${vendor ? ` — assigned to ${vendor.name}` : ' — no vendor on file, escalating'}`
      : `Maintenance triaged as ${result.urgency}: ${result.summary}${vendor ? ` — ${vendor.name} available` : ''}`;

    await logAction({
      landlordId: landlord.id,
      actionType: 'MAINTENANCE_TRIAGE',
      confidence: isEmergency ? 'HIGH' : result.confidence,
      summary,
      details: {
        requestId: request.id,
        urgency: result.urgency,
        category: result.category,
        reasoning: result.reasoning,
        tenantName: tName,
        unitName: unit.name,
        propertyName: unit.property.name,
        vendorAssigned: vendor ? { name: vendor.name, phone: vendor.phone } : null,
      },
      entityType: 'maintenance',
      entityId: request.id,
      status: autoAct ? 'EXECUTED' : 'ESCALATED',
    });

    if (vendor && autoAct) {
      await logAction({
        landlordId: landlord.id,
        actionType: 'MAINTENANCE_BOOKING',
        confidence: isEmergency ? 'HIGH' : result.confidence,
        summary: `Vendor logged: ${vendor.name} (${vendor.phone}) for ${result.category} — ${unit.name}, ${unit.property.name}`,
        details: { vendor: { name: vendor.name, phone: vendor.phone, email: vendor.email }, requestId: request.id, tenantName: tName },
        entityType: 'maintenance',
        entityId: request.id,
        status: 'EXECUTED',
      });
    }
  } catch (err) {
    console.error('[Agent] triageMaintenanceRequest error:', err.message);
  }
}

async function runRentReminderCheck() {
  console.log('[Agent] Running rent reminder check...');
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const activeLeases = await prisma.lease.findMany({
      where: { status: 'ACTIVE' },
      include: {
        tenant: true,
        unit: { include: { property: { include: { landlord: true } } } },
        payments: {
          where: { status: { in: ['PENDING', 'OVERDUE'] } },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    for (const lease of activeLeases) {
      const landlord = lease.unit.property.landlord;
      const config = await getOrCreateConfig(landlord.id);
      if (!config.isEnabled || !config.autoRentReminders) continue;

      for (const payment of lease.payments) {
        const dueDate = new Date(payment.dueDate);
        const daysUntilDue = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));

        let noticeTitle = null;
        let noticeBody = null;
        let actionType = 'RENT_REMINDER';

        if (daysUntilDue === 3) {
          noticeTitle = 'Rent Due in 3 Days';
          noticeBody = `Hi ${lease.tenant.firstName},\n\nThis is a friendly reminder that your rent payment of $${payment.amount} is due on ${dueDate.toDateString()}.\n\nPlease ensure payment is made on time to avoid any late fees.\n\nThank you!`;
        } else if (daysUntilDue === 0) {
          noticeTitle = 'Rent Due Today';
          noticeBody = `Hi ${lease.tenant.firstName},\n\nYour rent payment of $${payment.amount} is due today, ${dueDate.toDateString()}.\n\nIf you have already made your payment, please disregard this notice.\n\nThank you!`;
        } else if (daysUntilDue === -1) {
          noticeTitle = 'Rent Payment Overdue';
          noticeBody = `Hi ${lease.tenant.firstName},\n\nYour rent payment of $${payment.amount} was due on ${dueDate.toDateString()} and has not been received.\n\nPlease make your payment as soon as possible.\n\nThank you.`;
          await prisma.payment.update({ where: { id: payment.id }, data: { status: 'OVERDUE' } });
        } else if (daysUntilDue === -3) {
          noticeTitle = 'Formal Notice: Rent 3 Days Overdue';
          noticeBody = `Hi ${lease.tenant.firstName},\n\nThis is a formal notice that your rent payment of $${payment.amount} is now 3 days overdue (due: ${dueDate.toDateString()}).\n\nImmediate payment is required. Late fees may apply per your lease agreement.\n\nPlease contact us if you are experiencing financial difficulties.\n\nSincerely,\nProperty Management`;
          actionType = 'LATE_RENT_NOTICE';
        } else if (daysUntilDue === -7) {
          const tName = `${lease.tenant.firstName} ${lease.tenant.lastName}`;
          const uName = `${lease.unit.name}, ${lease.unit.property.name}`;
          const draftBody = `Dear ${lease.tenant.firstName},\n\nThis is a formal notice that your rent payment of $${payment.amount} for ${uName} is now 7 days overdue.\n\nYou are required to pay the outstanding balance immediately. Failure to do so may result in further legal action as permitted under your lease agreement.\n\nPlease contact us immediately to arrange payment.\n\nSincerely,\nProperty Management`;
          await escalationService.createEscalation({
            landlordId: landlord.id,
            actionType: 'LATE_RENT_ESCALATION',
            summary: `Rent 7 days overdue — ${tName} owes $${payment.amount}`,
            details: {
              context: `${tName} (${uName}) has not paid $${payment.amount} rent due on ${new Date(payment.dueDate).toDateString()}. Now 7 days overdue.`,
              tenantName: tName,
              unitName: lease.unit.name,
              propertyName: lease.unit.property.name,
              amount: payment.amount,
              dueDate: payment.dueDate,
              paymentId: payment.id,
            },
            draftContent: { type: 'notice', title: 'Formal Notice: Rent 7 Days Overdue', tenantId: lease.tenantId, leaseId: lease.id, body: draftBody },
            entityType: 'payment',
            entityId: payment.id,
          });
          continue;
        } else {
          continue;
        }

        // Respect cancellations from the timeline
        const wasCancelled = await prisma.agentLog.findFirst({
          where: {
            landlordId: landlord.id,
            entityId: payment.id,
            actionType,
            status: 'CANCELLED',
            scheduledAt: { gte: today, lt: new Date(today.getTime() + 86400000) },
          },
        });
        if (wasCancelled) continue;

        // Avoid duplicate notices on the same day
        const alreadySent = await prisma.notice.findFirst({
          where: {
            landlordId: landlord.id,
            tenantId: lease.tenantId,
            title: noticeTitle,
            createdAt: { gte: today },
          },
        });
        if (alreadySent) continue;

        await prisma.notice.create({
          data: {
            landlordId: landlord.id,
            tenantId: lease.tenantId,
            leaseId: lease.id,
            title: noticeTitle,
            body: noticeBody,
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        await logAction({
          landlordId: landlord.id,
          actionType,
          confidence: 'HIGH',
          summary: `Sent "${noticeTitle}" to ${lease.tenant.firstName} ${lease.tenant.lastName}`,
          details: { paymentId: payment.id, daysUntilDue, amount: payment.amount },
          entityType: 'payment',
          entityId: payment.id,
          status: 'EXECUTED',
        });
      }
    }
    console.log('[Agent] Rent reminder check complete.');
  } catch (err) {
    console.error('[Agent] runRentReminderCheck error:', err.message);
  }
}

async function runLeaseRenewalCheck() {
  console.log('[Agent] Running lease renewal check...');
  try {
    const today = new Date();
    const in90 = new Date(today);
    in90.setDate(today.getDate() + 90);
    const in85 = new Date(today);
    in85.setDate(today.getDate() + 85);

    const expiringLeases = await prisma.lease.findMany({
      where: { status: 'ACTIVE', endDate: { gte: in85, lte: in90 } },
      include: {
        tenant: true,
        unit: { include: { property: { include: { landlord: true } } } },
      },
    });

    for (const lease of expiringLeases) {
      const landlord = lease.unit.property.landlord;
      const config = await getOrCreateConfig(landlord.id);
      if (!config.isEnabled || !config.autoLeaseRenewal) continue;

      const alreadyLogged = await prisma.agentLog.findFirst({
        where: {
          landlordId: landlord.id,
          actionType: 'LEASE_RENEWAL_DRAFT',
          entityId: lease.id,
          status: { in: ['ESCALATED', 'APPROVED', 'EXECUTED'] },
        },
      });
      if (alreadyLogged) continue;

      const daysLeft = Math.floor((new Date(lease.endDate) - today) / (1000 * 60 * 60 * 24));
      const renewedEndDate = new Date(lease.endDate);
      renewedEndDate.setFullYear(renewedEndDate.getFullYear() + 1);

      await logAction({
        landlordId: landlord.id,
        actionType: 'LEASE_RENEWAL_DRAFT',
        confidence: 'LOW',
        summary: `Lease for ${lease.tenant.firstName} ${lease.tenant.lastName} expires in ${daysLeft} days — review and approve renewal`,
        details: {
          leaseId: lease.id,
          tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
          unit: `${lease.unit.name}, ${lease.unit.property.name}`,
          expiryDate: lease.endDate,
          currentRent: lease.monthlyRent,
          suggestedRenewalRent: lease.monthlyRent,
          suggestedNewEndDate: renewedEndDate,
        },
        entityType: 'lease',
        entityId: lease.id,
        status: 'ESCALATED',
      });
    }
    console.log('[Agent] Lease renewal check complete.');
  } catch (err) {
    console.error('[Agent] runLeaseRenewalCheck error:', err.message);
  }
}

module.exports = {
  handleTenantMessage,
  triageMaintenanceRequest,
  runRentReminderCheck,
  runLeaseRenewalCheck,
  getOrCreateConfig,
};
