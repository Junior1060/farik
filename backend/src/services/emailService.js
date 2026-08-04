const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:5174';

function baseTemplate({ badge, badgeColor, title, body, draftContent, ctaLabel, ctaUrl }) {
  const badgeBg = badgeColor === 'red' ? '#fee2e2' : badgeColor === 'amber' ? '#fef3c7' : '#dbeafe';
  const badgeFg = badgeColor === 'red' ? '#991b1b' : badgeColor === 'amber' ? '#92400e' : '#1e40af';
  const draftBlock = draftContent
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0;">
         <p style="color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;margin:0 0 8px;letter-spacing:.05em;">Draft action</p>
         <p style="color:#334155;white-space:pre-wrap;margin:0;font-size:13px;line-height:1.6;">${draftContent}</p>
       </div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:580px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
  <div style="background:#166534;padding:24px 28px;display:flex;align-items:center;gap:12px;">
    <div style="width:36px;height:36px;background:#16a34a;border-radius:10px;display:flex;align-items:center;justify-content:center;">
      <span style="color:white;font-size:18px;">⚡</span>
    </div>
    <div>
      <p style="color:white;font-weight:700;margin:0;font-size:16px;">Farik AI</p>
      <p style="color:#86efac;margin:0;font-size:12px;">Property Management Assistant</p>
    </div>
  </div>
  <div style="padding:28px;">
    <div style="display:inline-block;background:${badgeBg};color:${badgeFg};font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">${badge}</div>
    <h2 style="color:#0f172a;font-size:18px;font-weight:700;margin:0 0 10px;">${title}</h2>
    <p style="color:#475569;line-height:1.7;margin:0 0 4px;font-size:14px;">${body}</p>
    ${draftBlock}
    <a href="${ctaUrl}" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;margin-top:20px;">${ctaLabel}</a>
  </div>
  <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #f1f5f9;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">Farik AI · Automated escalation system · <a href="${APP_URL}/agent" style="color:#94a3b8;">Manage notifications</a></p>
  </div>
</div>
</body></html>`;
}

/**
 * Sends an email, never throwing — a failed notification must not fail the
 * request that triggered it.
 *
 * @returns {Promise<{sent: boolean, reason?: 'not_configured'|'send_failed'}>}
 */
async function send({ to, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email] (No SMTP configured) → ${to} | ${subject}`);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Farik" <noreply@farik.ca>',
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });
    return { sent: true };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { sent: false, reason: 'send_failed' };
  }
}

async function sendEscalationEmail({ to, title, description, draftContent, escalationId }) {
  const draft = draftContent ? parseDraftPreview(draftContent) : null;
  await send({
    to,
    subject: `Action Required: ${title}`,
    html: baseTemplate({
      badge: 'Action Required',
      badgeColor: 'amber',
      title,
      body: description,
      draftContent: draft,
      ctaLabel: 'Review & Approve in Farik',
      ctaUrl: `${APP_URL}/agent`,
    }),
  });
}

async function sendReminderEmail({ to, title, escalationId, hoursAgo }) {
  await send({
    to,
    subject: `Reminder: Still waiting for your input — ${title}`,
    html: baseTemplate({
      badge: '24-Hour Reminder',
      badgeColor: 'amber',
      title: `Reminder: ${title}`,
      body: `This escalation has been waiting ${hoursAgo} hours for your response. Please review and take action.`,
      draftContent: null,
      ctaLabel: 'Review Now',
      ctaUrl: `${APP_URL}/agent`,
    }),
  });
}

async function sendUrgentEmail({ to, title, escalationId }) {
  await send({
    to,
    subject: `URGENT: Immediate action required — ${title}`,
    html: baseTemplate({
      badge: 'Urgent — 48 Hours',
      badgeColor: 'red',
      title: `⚠️ Urgent: ${title}`,
      body: `This escalation has been waiting over 48 hours with no response. Immediate attention is required to avoid potential issues with your tenant or property.`,
      draftContent: null,
      ctaLabel: 'Act Now',
      ctaUrl: `${APP_URL}/agent`,
    }),
  });
}

function parseDraftPreview(draftContent) {
  try {
    const d = JSON.parse(draftContent);
    if (d.body) return d.body.substring(0, 400) + (d.body.length > 400 ? '...' : '');
    if (d.summary) return d.summary;
  } catch {
    return typeof draftContent === 'string' ? draftContent.substring(0, 400) : null;
  }
  return null;
}

// ─── Founding Landlord Pilot ──────────────────────────────────────────────────

/** Escape user-supplied text before it goes anywhere near an HTML template. */
function esc(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CONTACT_METHOD_LABELS = { EMAIL: 'Email', PHONE: 'Phone', TEXT: 'Text message' };

function pilotShell(innerHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;">
<div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#4F46E5;padding:22px 28px;">
    <p style="color:#ffffff;font-weight:700;margin:0;font-size:17px;letter-spacing:-0.01em;">Farik</p>
    <p style="color:#C7D2FE;margin:4px 0 0;font-size:12px;">Founding Landlord Pilot</p>
  </div>
  <div style="padding:28px;">${innerHtml}</div>
  <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;">
    <p style="color:#64748b;font-size:12px;margin:0;">Farik · Built in Saskatchewan for independent landlords</p>
  </div>
</div>
</body></html>`;
}

/**
 * Notifies the Farik team that an application arrived.
 * Returns { sent:false, reason:'not_configured' } when no recipient is set —
 * the caller logs it; the applicant never sees a configuration problem.
 */
async function sendPilotTeamNotification({ to, application, adminUrl }) {
  if (!to) return { sent: false, reason: 'not_configured' };

  const rows = [
    ['Name', application.fullName],
    ['Email', application.email],
    ['Phone', application.phone],
    ['City', application.city],
    ['Units managed', application.unitsManaged],
    ['Preferred contact', CONTACT_METHOD_LABELS[application.preferredContactMethod] || application.preferredContactMethod],
    ['Company / property', application.companyName || '—'],
    ['Current method', application.currentManagementMethod || '—'],
    ['Source', application.source],
    ['Submitted', new Date(application.createdAt).toLocaleString('en-CA', { timeZone: 'America/Regina', timeZoneName: 'short' })],
  ];

  const rowsHtml = rows
    .map(([label, value]) => `<tr>
        <td style="padding:7px 12px 7px 0;color:#64748b;font-size:13px;vertical-align:top;white-space:nowrap;">${esc(label)}</td>
        <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;">${esc(value)}</td>
      </tr>`)
    .join('');

  const block = (title, body) => `
    <p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:22px 0 6px;">${esc(title)}</p>
    <p style="color:#334155;font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;">${esc(body)}</p>`;

  const html = pilotShell(`
    <h1 style="color:#0f172a;font-size:19px;font-weight:700;margin:0 0 4px;">New pilot application</h1>
    <p style="color:#64748b;font-size:14px;margin:0 0 20px;">${esc(application.fullName)} · ${esc(application.city)} · ${esc(application.unitsManaged)} unit${application.unitsManaged === 1 ? '' : 's'}</p>
    <table style="border-collapse:collapse;width:100%;">${rowsHtml}</table>
    ${block('What takes the most time', application.biggestProblem)}
    ${application.additionalNotes ? block('Anything else', application.additionalNotes) : ''}
    ${adminUrl
      ? `<a href="${esc(adminUrl)}" style="display:inline-block;background:#4F46E5;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;margin-top:24px;">Open in Farik admin</a>`
      : ''}
  `);

  const text = [
    `New Farik pilot application — ${application.fullName}`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'What takes the most time:',
    application.biggestProblem,
    ...(application.additionalNotes ? ['', 'Anything else:', application.additionalNotes] : []),
    ...(adminUrl ? ['', `Open in Farik admin: ${adminUrl}`] : []),
  ].join('\n');

  return send({ to, subject: `New Farik pilot application — ${application.fullName}`, html, text });
}

/**
 * Confirms receipt to the applicant. The booking button is rendered only when a
 * scheduling link is configured; otherwise the copy promises a follow-up
 * instead, and never mentions configuration.
 */
async function sendPilotApplicantConfirmation({ to, firstName, bookingUrl }) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const agenda = [
    'How many units you manage',
    'How tenants currently contact you',
    'Rent follow-up and maintenance challenges',
    'Whether Farik is a good fit for your workflow',
  ];

  const nextStepHtml = bookingUrl
    ? `<p style="color:#334155;font-size:14px;line-height:1.7;margin:0 0 4px;">The next step is to book a short introductory call with the Farik team.</p>
       <a href="${esc(bookingUrl)}" style="display:inline-block;background:#4F46E5;color:#ffffff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;margin:18px 0 6px;">Book a 15-minute call</a>`
    : `<p style="color:#334155;font-size:14px;line-height:1.7;margin:0;">The next step is a short introductory call. Someone from the Farik team will be in touch within one business day to arrange a time that suits you.</p>`;

  const html = pilotShell(`
    <p style="color:#0f172a;font-size:15px;line-height:1.7;margin:0 0 14px;">${esc(greeting)}</p>
    <p style="color:#334155;font-size:14px;line-height:1.7;margin:0 0 14px;">Thanks for applying to the Farik Founding Landlord Pilot.</p>
    <p style="color:#334155;font-size:14px;line-height:1.7;margin:0 0 18px;">We have received your information and would like to learn more about how you currently manage your properties.</p>
    ${nextStepHtml}
    <p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:26px 0 8px;">During the call, we will discuss</p>
    <ul style="color:#334155;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
      ${agenda.map((item) => `<li>${esc(item)}</li>`).join('')}
    </ul>
    <p style="color:#64748b;font-size:13px;line-height:1.7;margin:26px 0 0;">No sales pressure — we will learn about your workflow, answer questions, and work out together whether the pilot is a good fit.</p>
  `);

  const text = [
    greeting,
    '',
    'Thanks for applying to the Farik Founding Landlord Pilot.',
    '',
    'We have received your information and would like to learn more about how you currently manage your properties.',
    '',
    bookingUrl
      ? `The next step is to book a short introductory call with the Farik team:\n${bookingUrl}`
      : 'The next step is a short introductory call. Someone from the Farik team will be in touch within one business day to arrange a time that suits you.',
    '',
    'During the call, we will discuss:',
    ...agenda.map((item) => `- ${item}`),
    '',
    'Farik',
    'Built in Saskatchewan for independent landlords',
  ].join('\n');

  return send({ to, subject: 'We received your Farik pilot application', html, text });
}

module.exports = {
  sendEscalationEmail,
  sendReminderEmail,
  sendUrgentEmail,
  sendPilotTeamNotification,
  sendPilotApplicantConfirmation,
};
