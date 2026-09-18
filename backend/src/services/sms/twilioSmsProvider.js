const twilio = require('twilio');
const prisma = require('../../lib/prisma');
const { isOptedOut } = require('./optOutGuard');
const { toE164 } = require('./phoneNumber');

let client = null;
function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

async function sendSms({ to, body, tenantId, relatedWorkflowType, relatedWorkflowId }) {
  if (await isOptedOut(tenantId)) {
    console.log(`[SMS:twilio] Skipped — tenant ${tenantId} has opted out of SMS`);
    return { providerMessageId: null, status: 'FAILED' };
  }

  const dialTo = toE164(to);
  if (!dialTo) {
    // Unsendable number (no area code, or an unknown country) — skip rather than let the
    // provider reject it, and record nothing, since no message ever existed.
    console.log(`[SMS:twilio] Skipped — "${to}" is not a dialable number`);
    return { providerMessageId: null, status: 'FAILED' };
  }

  const message = await getClient().messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to: dialTo,
    body,
  });

  await prisma.smsMessage.create({
    data: {
      tenantId: tenantId || null,
      phoneNumber: dialTo,
      direction: 'OUTBOUND',
      body,
      provider: 'twilio',
      providerMessageId: message.sid,
      status: 'SENT',
      relatedWorkflowType: relatedWorkflowType || null,
      relatedWorkflowId: relatedWorkflowId || null,
    },
  });

  return { providerMessageId: message.sid, status: 'SENT' };
}

// Non-negotiable: verified before any DB write in the webhook controller.
// Twilio signs each webhook request with HMAC-SHA1 over the full URL + sorted params.
function verifyWebhookSignature(req) {
  const signature = req.headers['x-twilio-signature'];
  if (!signature || !process.env.TWILIO_AUTH_TOKEN) return false;

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;

  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, fullUrl, req.body);
}

function parseInboundWebhook(req) {
  return {
    from: req.body.From,
    body: req.body.Body,
    providerMessageId: req.body.MessageSid,
  };
}

module.exports = { sendSms, verifyWebhookSignature, parseInboundWebhook };
