const prisma = require('../lib/prisma');
const { getSmsProvider } = require('../services/sms/smsProvider');
const maintenanceWorkflow = require('../services/workflows/maintenanceWorkflow');
const vendorDispatchService = require('../services/vendorDispatchService');
const agentService = require('../services/agentService');
const escalationService = require('../services/escalationService');
const policyEngine = require('../services/policyEngine');
const { normalizePhone } = require('../services/sms/phoneNumber');
const { canReceiveSms } = require('../services/sms/optOutGuard');
const { INTENT, REPLY, classifyIntent, isHelpKeyword } = require('../services/sms/inboundIntent');

async function findTenantByPhone(phone) {
  const target = normalizePhone(phone);
  if (!target) return null;
  const tenants = await prisma.tenantProfile.findMany({ where: { phone: { not: null } } });
  return tenants.find((t) => normalizePhone(t.phone) === target) || null;
}

async function findVendorByPhone(phone) {
  const target = normalizePhone(phone);
  if (!target) return null;
  // Vendor.phone is a required column, so there is nothing to filter out — a
  // not-null filter on a non-nullable field is a Prisma validation error, not a no-op.
  const vendors = await prisma.vendor.findMany();
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

// Sent verbatim, so an exact match on this constant is a reliable record that a given
// number has already been asked — no extra table needed to make the prompt one-shot.
const CONSENT_PROMPT = 'Farik helps your landlord handle repairs. Reply YES to let us text you '
  + 'about maintenance at this number. Msg & data rates may apply. Reply STOP to opt out at any time.';
const CONSENT_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Asks an identified tenant for SMS consent at most once a week. Returns silently if
 * they have already consented, already opted out (never re-prompt someone who said
 * STOP), or were prompted recently.
 */
async function maybeRequestConsent(tenant, provider, phoneNumber) {
  if (tenant.smsConsent || tenant.smsOptOutAt) return;

  const alreadyAsked = await prisma.smsMessage.findFirst({
    where: {
      phoneNumber,
      direction: 'OUTBOUND',
      body: CONSENT_PROMPT,
      createdAt: { gte: new Date(Date.now() - CONSENT_PROMPT_COOLDOWN_MS) },
    },
  });
  if (alreadyAsked) return;

  // No tenantId: optOutGuard would be a no-op here anyway (we just checked opt-out),
  // and this send must not be attributed as consented traffic.
  await provider.sendSms({ to: phoneNumber, body: CONSENT_PROMPT });
}

// How long a clarification stays "already asked". Long enough to cover one back-and-forth,
// short enough that a vague text next week starts over rather than escalating immediately.
const CLARIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * True when we already asked this number to clarify inside the current window. This is the
 * entire difference between CLARIFICATION_NEEDED (ask once) and UNKNOWN (stop asking, get
 * a human) — as with CONSENT_PROMPT, sending the text verbatim is what makes it detectable
 * without another table.
 */
async function alreadyAskedToClarify(phoneNumber) {
  const asked = await prisma.smsMessage.findFirst({
    where: {
      phoneNumber,
      direction: 'OUTBOUND',
      body: REPLY.CLARIFICATION,
      createdAt: { gte: new Date(Date.now() - CLARIFICATION_COOLDOWN_MS) },
    },
  });
  return Boolean(asked);
}

/**
 * The tenant's active lease — the only thing that tells us which unit a repair belongs to
 * and which landlord an escalation belongs to. Null means there is no property context,
 * so there is nothing this flow can safely do on its own.
 */
async function loadActiveLease(tenantId) {
  return prisma.lease.findFirst({
    where: { tenantId, status: 'ACTIVE' },
    include: { unit: { include: { property: true } } },
    orderBy: { startDate: 'desc' },
  });
}

/**
 * Records the escalation FIRST and only claims a handoff once the row exists. Telling a
 * tenant "we have passed this to your property manager" when nothing was recorded is the
 * one thing this flow must never do, so every failure path falls back to the honest text.
 */
async function escalateWithHoldingText({ provider, tenant, phoneNumber, lease, body, actionType, summary }) {
  const send = (text) => provider.sendSms({ to: phoneNumber, body: text, tenantId: tenant.id });

  if (!lease) {
    await send(REPLY.TEMPORARY_FAILURE);
    return false;
  }

  let escalation;
  try {
    escalation = await escalationService.createEscalation({
      landlordId: lease.unit.property.landlordId,
      actionType,
      summary,
      details: {
        messageBody: body,
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        unitName: lease.unit.name,
        propertyName: lease.unit.property.name,
        channel: 'SMS',
      },
      entityType: 'tenant',
      entityId: tenant.id,
    });
  } catch (err) {
    console.error('[Webhook] escalation failed:', err.message);
    await send(REPLY.TEMPORARY_FAILURE);
    return false;
  }

  // createEscalation returns null rather than throwing when the landlord cannot be found,
  // so a falsy result means nothing was recorded and the handoff promise would be false.
  if (!escalation) {
    await send(REPLY.TEMPORARY_FAILURE);
    return false;
  }

  await send(REPLY.ESCALATION_HOLDING);
  return true;
}

/**
 * Opens a repair from a cold text. The unit comes from the tenant's active lease rather
 * than being inferred from the phone number, which is what made SMS-only intake unsafe
 * before; a tenant with no active lease never reaches here.
 *
 * startWorkflow is deliberately not awaited: it can run AI triage, and Twilio gives the
 * webhook about 15 seconds before it gives up and retries. It also talks to the tenant
 * itself — emergency safety message, or diagnostic questions — so the caller only sends
 * its own acknowledgement when the workflow has no SMS channel to use.
 */
async function openMaintenanceFromSms(tenant, lease, body) {
  const title = body.length > 60 ? `${body.slice(0, 57).trimEnd()}...` : body;
  const request = await prisma.maintenanceRequest.create({
    data: { tenantId: tenant.id, unitId: lease.unitId, title, description: body, status: 'OPEN' },
    include: { tenant: true, unit: { include: { property: true } } },
  });

  // Same branch the web intake uses: OBSERVE means the agent watches but never acts.
  const policy = await policyEngine.getEffectivePolicy(
    lease.unit.property.landlordId, lease.unit.property.id, 'MAINTENANCE',
  );
  const run = policy.trustLevel !== 'OBSERVE'
    ? maintenanceWorkflow.startWorkflow(request.id)
    : agentService.triageMaintenanceRequest(request);
  run.catch((err) => console.error('[Webhook] maintenance intake failed:', err.message));

  return request;
}

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
      // Same reasoning as the diagnostic branch below: the reply is recorded, so a failure
      // in the dispatch machinery is ours to log, not Twilio's to retry.
      try {
        await handleVendorReply(vendor, body);
      } catch (err) {
        console.error('[Webhook] vendor reply handling failed:', err.message);
      }
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
    // HELP is carrier-mandated and must be answered even for a number that has opted out,
    // so it sits ahead of every other branch and never changes consent state. No tenantId
    // on the send, deliberately: passing one would let optOutGuard suppress exactly the
    // reply the carriers require, and this is not consented marketing traffic.
    if (isHelpKeyword(keyword)) {
      await provider.sendSms({ to: from, body: REPLY.HELP });
      return res.status(200).json({ received: true });
    }
    if (STOP_KEYWORDS.has(keyword)) {
      await prisma.tenantProfile.update({ where: { id: tenant.id }, data: { smsOptOutAt: new Date() } });
      await provider.sendSms({ to: from, body: 'You have been unsubscribed and will no longer receive texts from Farik. Reply START to resume.', tenantId: tenant.id });
      return res.status(200).json({ received: true });
    }
    // START/YES is an unambiguous opt-in, so it does double duty: it clears a prior
    // opt-out *and* records consent for a tenant who never had it — which is how the
    // double opt-in prompt above gets answered. This is the primary writer of
    // smsConsent; nothing grants it implicitly or by default.
    if (START_KEYWORDS.has(keyword) && (tenant.smsOptOutAt || !tenant.smsConsent)) {
      const wasOptedOut = Boolean(tenant.smsOptOutAt);
      await prisma.tenantProfile.update({
        where: { id: tenant.id },
        data: {
          smsOptOutAt: null,
          smsConsent: true,
          // Preserve the original grant metadata for a tenant who is merely resubscribing.
          ...(tenant.smsConsent ? {} : {
            smsConsentAt: new Date(),
            smsConsentSource: wasOptedOut ? 'SMS_REPLY_START' : 'SMS_DOUBLE_OPT_IN',
          }),
        },
      });
      await provider.sendSms({
        to: from,
        body: wasOptedOut
          ? 'You are resubscribed to Farik texts. Reply STOP to opt out at any time.'
          : 'Thanks — Farik can now text you about repairs at this number. Reply STOP to opt out at any time.',
        tenantId: tenant.id,
      });
      return res.status(200).json({ received: true });
    }

    const openWorkflow = await prisma.maintenanceWorkflow.findFirst({
      where: { state: 'DIAGNOSTIC_QUESTIONS_SENT', maintenanceRequest: { tenantId: tenant.id } },
      orderBy: { updatedAt: 'desc' },
    });

    if (openWorkflow) {
      // recordTenantReply saves the answer and then runs AI triage. A provider failure in
      // that second half must not become a non-2xx for Twilio: the inbound message is
      // already durably recorded above, so "received" is the truthful response, and an
      // upstream provider's error text has no business being returned to an external
      // caller — the shared error handler passes 4xx messages through on the assumption
      // that we raised them ourselves, which is not true of a relayed one.
      try {
        await maintenanceWorkflow.recordTenantReply(openWorkflow.id, body);
      } catch (err) {
        console.error('[Webhook] diagnostic reply handling failed:', err.message);
        await provider.sendSms({ to: from, body: REPLY.DIAGNOSTIC_DEFERRED, tenantId: tenant.id });
      }
      return res.status(200).json({ received: true });
    }

    // No open diagnostic workflow — a tenant mid-diagnostics has necessarily consented
    // already, so only this path needs to ask. The message is still recorded and handled
    // either way; asking for consent never swallows what the tenant actually said.
    await maybeRequestConsent(tenant, provider, from);

    // Intent routing. Everything below this line exists so that "hi" and "??" get an
    // answer instead of being treated as something a human has to take over — escalation
    // now means a person is genuinely needed, not that the classifier was unsure.
    const intent = classifyIntent(body);
    const reply = (text) => provider.sendSms({ to: from, body: text, tenantId: tenant.id });

    // Answered outright. No maintenance request, no escalation, and no conversation row —
    // the inbound SmsMessage above is the audit trail, and the landlord is not pinged for
    // someone saying hello.
    if (intent === INTENT.GREETING) {
      await reply(REPLY.GREETING);
      return res.status(200).json({ received: true });
    }

    if (intent === INTENT.CLARIFICATION_NEEDED) {
      // One reasonable attempt to clarify. A second unresolved message inside the window
      // is UNKNOWN — stop asking and get a human, which is a real escalation.
      if (await alreadyAskedToClarify(from)) {
        const lease = await loadActiveLease(tenant.id);
        await escalateWithHoldingText({
          provider, tenant, phoneNumber: from, lease, body,
          actionType: 'MESSAGE_RESPONSE',
          summary: `Could not determine what ${tenant.firstName} ${tenant.lastName} needs over SMS`,
        });
      } else {
        await reply(REPLY.CLARIFICATION);
      }
      return res.status(200).json({ received: true });
    }

    if (intent === INTENT.URGENT || intent === INTENT.MAINTENANCE) {
      const lease = await loadActiveLease(tenant.id);
      if (!lease) {
        // No unit to attach the repair to. Say so honestly rather than claiming a handoff.
        await reply(intent === INTENT.URGENT ? REPLY.URGENT_NO_CONTEXT : REPLY.TEMPORARY_FAILURE);
        return res.status(200).json({ received: true });
      }

      await openMaintenanceFromSms(tenant, lease, body);

      // The workflow talks to the tenant itself when it can — an emergency safety message
      // or diagnostic questions — so acknowledging here too would double-text them. When
      // it has no SMS channel (no consent yet), this is the only reply they will get.
      if (!canReceiveSms(tenant)) {
        await reply(intent === INTENT.URGENT ? REPLY.URGENT_ACK : REPLY.MAINTENANCE_LOGGED);
      }
      return res.status(200).json({ received: true });
    }

    if (intent === INTENT.HUMAN_REQUEST) {
      const lease = await loadActiveLease(tenant.id);
      await escalateWithHoldingText({
        provider, tenant, phoneNumber: from, lease, body,
        actionType: 'MESSAGE_RESPONSE',
        summary: `${tenant.firstName} ${tenant.lastName} asked to speak to a person`,
      });
      return res.status(200).json({ received: true });
    }

    // PROPERTY_INFO, and anything the rules could not place, goes to the AI — it is the
    // only path with the lease and payment data needed to answer from real values.
    let conversation = await prisma.conversation.findFirst({
      where: { participants: { some: { tenantId: tenant.id } } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({ data: { participants: { create: { tenantId: tenant.id } } } });
    }
    const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: tenant.userId, body } });
    // The tenant reached us by SMS, so the agent's reply goes back the same way rather
    // than only into the web conversation they may never open.
    agentService.handleTenantMessage(message, conversation.id, { smsReplyTo: from })
      .catch((err) => console.error('[Webhook] handleTenantMessage error:', err.message));

    return res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { handleInboundSms, findTenantByPhone, findVendorByPhone };
