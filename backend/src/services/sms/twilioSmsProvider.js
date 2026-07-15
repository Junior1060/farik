const twilio = require('twilio');
const prisma = require('../../lib/prisma');

let client = null;
function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

async function sendSms({ to, body, tenantId, relatedWorkflowType, relatedWorkflowId }) {
  const message = await getClient().messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to,
    body,
  });

  await prisma.smsMessage.create({
    data: {
      tenantId: tenantId || null,
      phoneNumber: to,
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
