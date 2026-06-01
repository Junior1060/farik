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

async function send({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email] (No SMTP configured) → ${to} | ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Farik AI" <noreply@farik.com>',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
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

module.exports = { sendEscalationEmail, sendReminderEmail, sendUrgentEmail };
