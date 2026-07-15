// Contract every SMS adapter implements:
//   sendSms({ to, body }) -> Promise<{ providerMessageId, status }>
//   verifyWebhookSignature(req) -> boolean
//   parseInboundWebhook(req) -> { from, body, providerMessageId }
//
// Selects the adapter via SMS_PROVIDER env var. Defaults to mock so the app
// runs fully (demo/dev/tests) without Twilio credentials configured.
function getSmsProvider() {
  if (process.env.SMS_PROVIDER === 'twilio') {
    return require('./twilioSmsProvider');
  }
  return require('./mockSmsProvider');
}

module.exports = { getSmsProvider };
