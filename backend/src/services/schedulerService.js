const cron = require('node-cron');
const agentService = require('./agentService');
const escalationService = require('./escalationService');
const vendorDispatchService = require('./vendorDispatchService');

function startScheduler() {
  // Rent reminders: daily at 8:00 AM
  cron.schedule('0 8 * * *', () => {
    agentService.runRentReminderCheck().catch(console.error);
  });

  // Lease renewal check: daily at 9:00 AM
  cron.schedule('0 9 * * *', () => {
    agentService.runLeaseRenewalCheck().catch(console.error);
  });

  // Escalation 24h/48h reminders: every hour
  cron.schedule('0 * * * *', () => {
    escalationService.checkEscalationReminders().catch(console.error);
  });

  // Vendor contact timeouts: every 30 minutes (retries or escalates unanswered dispatches)
  cron.schedule('*/30 * * * *', () => {
    vendorDispatchService.checkVendorTimeouts().catch(console.error);
  });

  console.log('[Scheduler] Agent scheduler started — reminders 8AM, renewals 9AM, escalation check hourly, vendor timeouts every 30min');
}

module.exports = { startScheduler };
