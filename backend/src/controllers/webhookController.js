const prisma = require('../lib/prisma');
const { getSmsProvider } = require('../services/sms/smsProvider');
const maintenanceWorkflow = require('../services/workflows/maintenanceWorkflow');
const vendorDispatchService = require('../services/vendorDispatchService');
const agentService = require('../services/agentService');

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

async function findTenantByPhone(phone) {
  const target = normalizePhone(phone);
  if (!target) return null;
  const tenants = await prisma.tenantProfile.findMany({ where: { phone: { not: null } } });
  return tenants.find((t) => normalizePhone(t.phone) === target) || null;
}

async function findVendorByPhone(phone) {
  const target = normalizePhone(phone);
  if (!target) return null;
  const vendors = await prisma.vendor.findMany({ where: { phone: { not: null } } });
  return vendors.find((v) => normalizePhone(v.phone) === target) || null;
}

async function handleVendorReply(vendor, body) {
  const attempt = await prisma.vendorContactAttempt.findFirst({
    where: { vendorId: vendor.id, status: 'SENT' },
    orderBy: { sentAt: 'desc' },
  });
  if (!attempt) return; // no pending job for this vendor — nothing to do

  const accepted = /^\s*y(es)?\b/i.test(body);
  const declined = /^\s*no?\b/i.test(body);
  if (!accepted && !declined) return; // ambiguous reply, left pending rather than guessing

  await vendorDispatchService.handleVendorResponse(attempt.maintenanceWorkflowId, vendor.id, accepted);
}

/**
 * POST /api/webhooks/sms — inbound SMS from tenants or vendors.
 * No `authenticate` middleware (external caller); signature verification is the
 * only gate, checked before any database write.
 */
const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_KEYWORDS = new Set(['START', 'UNSTOP', 'YES']);

async function handleInboundSms(req, res, next) {
  try {
    // Defense against silent fail-open: the mock SMS provider always reports a valid
    // signature (there's no real external caller to authenticate in dev/test), so if
    // SMS_PROVIDER is ever unset/misspelled in production, every request would otherwise
    // sail through unauthenticated. Refuse outright rather than falling back to mock.
    if (process.env.NODE_ENV === 'production' && process.env.SMS_PROVIDER !== 'twilio') {
      return res.status(403).json({ error: 'SMS provider not configured for production' });
    }

    const provider = getSmsProvider();
    if (!provider.verifyWebhookSignature(req)) {
      return res.status(403).json({ error: 'Invalid webhook signature' });
    }

    const { from, body, providerMessageId } = provider.parseInboundWebhook(req);
    if (!from || !body) return res.status(400).json({ error: 'Missing from/body' });

    const tenant = await findTenantByPhone(from);
    const vendor = tenant ? null : await findVendorByPhone(from);

    await prisma.smsMessage.create({
      data: {
        tenantId: tenant?.id || null,
        phoneNumber: from,
        direction: 'INBOUND',
        body,
        provider: process.env.SMS_PROVIDER === 'twilio' ? 'twilio' : 'mock',
        providerMessageId,
        status: 'DELIVERED',
      },
    });

    if (vendor) {
      await handleVendorReply(vendor, body);
      return res.status(200).json({ received: true });
    }

    if (!tenant) {
      // Never expose property/tenant info before verification.
      await provider.sendSms({
        to: from,
        body: 'We could not match this number to an account. Please contact your property manager to update your phone number on file.',
      });
      return res.status(200).json({ received: true });
    }

    const keyword = body.trim().toUpperCase();
    if (STOP_KEYWORDS.has(keyword)) {
      await prisma.tenantProfile.update({ where: { id: tenant.id }, data: { smsOptOutAt: new Date() } });
      await provider.sendSms({ to: from, body: 'You have been unsubscribed and will no longer receive texts from Farik. Reply START to resume.', tenantId: tenant.id });
      return res.status(200).json({ received: true });
    }
    if (START_KEYWORDS.has(keyword) && tenant.smsOptOutAt) {
      await prisma.tenantProfile.update({ where: { id: tenant.id }, data: { smsOptOutAt: null } });
      await provider.sendSms({ to: from, body: 'You are resubscribed to Farik texts.', tenantId: tenant.id });
      return res.status(200).json({ received: true });
    }

    const openWorkflow = await prisma.maintenanceWorkflow.findFirst({
      where: { state: 'DIAGNOSTIC_QUESTIONS_SENT', maintenanceRequest: { tenantId: tenant.id } },
      orderBy: { updatedAt: 'desc' },
    });

    if (openWorkflow) {
      await maintenanceWorkflow.recordTenantReply(openWorkflow.id, body);
      return res.status(200).json({ received: true });
    }

    // No open diagnostic workflow — fall back to the existing general message flow.
    let conversation = await prisma.conversation.findFirst({
      where: { participants: { some: { tenantId: tenant.id } } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({ data: { participants: { create: { tenantId: tenant.id } } } });
    }
    const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: tenant.userId, body } });
    agentService.handleTenantMessage(message, conversation.id)
      .catch((err) => console.error('[Webhook] handleTenantMessage error:', err.message));

    return res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { handleInboundSms, findTenantByPhone, findVendorByPhone };
