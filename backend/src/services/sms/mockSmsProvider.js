const crypto = require('crypto');
const prisma = require('../../lib/prisma');

async function sendSms({ to, body, tenantId, relatedWorkflowType, relatedWorkflowId }) {
  const providerMessageId = `mock_${crypto.randomUUID()}`;
  console.log(`[SMS:mock] -> ${to}: ${body}`);
  await prisma.smsMessage.create({
    data: {
      tenantId: tenantId || null,
      phoneNumber: to,
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
