const crypto = require('crypto');
const prisma = require('../../lib/prisma');
const { isOptedOut } = require('./optOutGuard');
const { toE164 } = require('./phoneNumber');

async function sendSms({ to, body, tenantId, relatedWorkflowType, relatedWorkflowId }) {
  if (await isOptedOut(tenantId)) {
    console.log(`[SMS:mock] Skipped — tenant ${tenantId} has opted out of SMS`);
    return { providerMessageId: null, status: 'FAILED' };
  }

  const dialTo = toE164(to);
  if (!dialTo) {
    // Unsendable number (no area code, or an unknown country) — skip rather than let the
    // provider reject it, and record nothing, since no message ever existed.
    console.log(`[SMS:mock] Skipped — "${to}" is not a dialable number`);
    return { providerMessageId: null, status: 'FAILED' };
  }

  const providerMessageId = `mock_${crypto.randomUUID()}`;
  console.log(`[SMS:mock] -> ${dialTo}: ${body}`);
  await prisma.smsMessage.create({
    data: {
      tenantId: tenantId || null,
      phoneNumber: dialTo,
      direction: 'OUTBOUND',
      body,
      provider: 'mock',
      providerMessageId,
      status: 'SENT',
      relatedWorkflowType: relatedWorkflowType || null,
      relatedWorkflowId: relatedWorkflowId || null,
    },
  });
  return { providerMessageId, status: 'SENT' };
}

// The mock adapter has no real webhook caller to authenticate, so anything
// reaching it (only ever the dev simulator, never the public internet) is trusted.
function verifyWebhookSignature() {
  return true;
}

function parseInboundWebhook(req) {
  return {
    from: req.body.From || req.body.from,
    body: req.body.Body || req.body.body,
    providerMessageId: req.body.MessageSid || `mock_${crypto.randomUUID()}`,
  };
}

// Dev/demo-only helper: lets the simulation tool (Phase 5) inject an inbound
// SMS without a real phone or Twilio webhook. Not reachable from any public route.
async function simulateInboundSms({ from, body }) {
  return { From: from, Body: body, MessageSid: `mock_${crypto.randomUUID()}` };
}

module.exports = { sendSms, verifyWebhookSignature, parseInboundWebhook, simulateInboundSms };
