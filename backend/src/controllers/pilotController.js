const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const emailService = require('../services/emailService');
const {
  getBookingUrl, getNotificationEmail, getAppUrl, buildBookingUrl, getAdminEmails,
} = require('../config/pilot');

const CONTACT_METHODS = ['EMAIL', 'PHONE', 'TEXT'];
const STATUSES = ['NEW', 'CONTACTED', 'CALL_BOOKED', 'PILOT_ACCEPTED', 'PILOT_DECLINED'];

// A second submission from the same address inside this window is treated as the
// same application — covers double-clicks, impatient retries, and network retries.
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

// A missing key and an empty string must produce the same applicant-facing
// message — otherwise an absent field falls back to zod's bare "Required".
const trimmed = (max, requiredError) =>
  z.string({ required_error: requiredError, invalid_type_error: requiredError })
    .transform((s) => s.trim())
    .pipe(z.string().max(max));
const optionalText = (max) =>
  z.string().optional().nullable()
    .transform((s) => {
      const t = (s ?? '').trim();
      return t === '' ? null : t.slice(0, max);
    });

const applicationSchema = z.object({
  fullName: trimmed(120, 'Please enter your full name.')
    .pipe(z.string().min(1, 'Please enter your full name.')),
  email: trimmed(200, 'Please enter your email address.')
    .pipe(z.string().min(1, 'Please enter your email address.').email('Please enter a valid email address.'))
    .transform((s) => s.toLowerCase()),
  phone: trimmed(40, 'Please enter a phone number.')
    .pipe(z.string().min(1, 'Please enter a phone number.')),
  city: trimmed(120, 'Please enter your city.')
    .pipe(z.string().min(1, 'Please enter your city.')),
  unitsManaged: z.coerce
    .number({
      required_error: 'Enter the number of units you manage.',
      invalid_type_error: 'Enter the number of units you manage.',
    })
    .int('Enter a whole number of units.')
    .positive('Enter at least 1 unit.')
    .max(100000, 'That number looks too large.'),
  biggestProblem: trimmed(4000, 'Tell us what takes the most of your time.')
    .pipe(z.string().min(10, 'Please give us at least a sentence — 10 characters or more.')),
  preferredContactMethod: z.enum(CONTACT_METHODS, {
    errorMap: () => ({ message: 'Choose how you would like us to reach you.' }),
  }),
  companyName: optionalText(200),
  currentManagementMethod: optionalText(500),
  additionalNotes: optionalText(4000),
  source: optionalText(60),
  // Honeypot: hidden from real users, irresistible to naive bots.
  website: z.string().optional(),
});

/** Never store a raw IP; a salted hash is enough to spot repeat abuse. */
function hashIp(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '';
  if (!ip) return null;
  const salt = process.env.JWT_SECRET || 'farik-pilot';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/** Only ever hand the browser fields that are safe to show the applicant. */
function publicView(application, bookingUrl) {
  return {
    id: application.id,
    fullName: application.fullName,
    firstName: application.fullName.split(/\s+/)[0] || application.fullName,
    email: application.email,
    createdAt: application.createdAt,
    bookingUrl: bookingUrl || null,
  };
}

// POST /api/pilot-applications — public, unauthenticated.
const submit = async (req, res, next) => {
  try {
    const parsed = applicationSchema.safeParse(req.body || {});

    if (!parsed.success) {
      // Field-keyed messages so the form can render them inline.
      const fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return res.status(400).json({
        error: 'Please check the highlighted fields and try again.',
        fieldErrors,
      });
    }

    const data = parsed.data;

    // Honeypot tripped: accept quietly so the bot learns nothing, store nothing.
    if (data.website && data.website.trim() !== '') {
      console.warn('[pilot] Discarded a submission that filled the honeypot field.');
      return res.status(202).json({ ok: true, application: null, bookingUrl: getBookingUrl() });
    }

    const bookingUrlBase = getBookingUrl();
    if (!bookingUrlBase) {
      console.warn(
        '[pilot] BOOKING_URL is not configured — applications are still accepted, but applicants ' +
        'cannot self-book. Set BOOKING_URL to a Cal.com/Calendly link to enable the booking step.',
      );
    }

    // Idempotency: return the existing row instead of creating a duplicate, and
    // do not re-send the emails.
    const recent = await prisma.pilotApplication.findFirst({
      where: { email: data.email, createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      console.log(`[pilot] Duplicate submission within the dedupe window (application ${recent.id}) — reusing it.`);
      return res.status(200).json({
        ok: true,
        duplicate: true,
        application: publicView(recent, buildBookingUrl(recent, bookingUrlBase)),
        bookingUrl: buildBookingUrl(recent, bookingUrlBase),
      });
    }

    const application = await prisma.pilotApplication.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        city: data.city,
        unitsManaged: data.unitsManaged,
        companyName: data.companyName,
        currentManagementMethod: data.currentManagementMethod,
        biggestProblem: data.biggestProblem,
        preferredContactMethod: data.preferredContactMethod,
        additionalNotes: data.additionalNotes,
        source: data.source || 'website',
        submitterIpHash: hashIp(req),
      },
    });

    const bookingUrl = buildBookingUrl(application, bookingUrlBase);

    // Emails are best-effort. The application is already saved; a mail outage
    // must never turn into a failed submission for the applicant.
    const adminUrl = getAdminEmails().length > 0
      ? `${getAppUrl()}/admin/pilot-applications`
      : null;

    const [teamResult, applicantResult] = await Promise.all([
      emailService.sendPilotTeamNotification({
        to: getNotificationEmail(),
        application,
        adminUrl,
      }).catch((err) => ({ sent: false, reason: err.message })),
      emailService.sendPilotApplicantConfirmation({
        to: application.email,
        firstName: application.fullName.split(/\s+/)[0],
        bookingUrl,
      }).catch((err) => ({ sent: false, reason: err.message })),
    ]);

    // Log outcomes without echoing applicant PII into the log stream.
    console.log(
      `[pilot] Application ${application.id} stored. ` +
      `team_email=${teamResult?.sent ? 'sent' : `skipped(${teamResult?.reason || 'unknown'})`} ` +
      `applicant_email=${applicantResult?.sent ? 'sent' : `skipped(${applicantResult?.reason || 'unknown'})`} ` +
      `booking=${bookingUrlBase ? 'configured' : 'not_configured'}`,
    );
    if (!getNotificationEmail()) {
      console.warn('[pilot] PILOT_NOTIFICATION_EMAIL is not configured — no team notification was sent.');
    }

    return res.status(201).json({
      ok: true,
      duplicate: false,
      application: publicView(application, bookingUrl),
      bookingUrl,
    });
  } catch (err) {
    // The applicant gets a generic message from the error handler; the detail
    // stays server-side.
    console.error('[pilot] Submission failed:', err.message);
    return next(err);
  }
};

// GET /api/pilot-applications/config — public booking availability, no secrets.
const getConfig = async (req, res, next) => {
  try {
    res.json({ bookingUrl: getBookingUrl() });
  } catch (err) {
    next(err);
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

// GET /api/pilot-applications — admin only.
const list = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status && STATUSES.includes(status) ? { status } : {};
    const applications = await prisma.pilotApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ applications });
  } catch (err) {
    next(err);
  }
};

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  internalNotes: z.string().max(8000).optional().nullable(),
  bookedCallAt: z.string().datetime().optional().nullable(),
  bookingReference: z.string().max(200).optional().nullable(),
});

// PATCH /api/pilot-applications/:id — admin only.
const update = async (req, res, next) => {
  try {
    const existing = await prisma.pilotApplication.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Application not found' });

    const data = updateSchema.parse(req.body);
    const updateData = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.internalNotes !== undefined) updateData.internalNotes = data.internalNotes;
    if (data.bookingReference !== undefined) updateData.bookingReference = data.bookingReference;
    if (data.bookedCallAt !== undefined) {
      updateData.bookedCallAt = data.bookedCallAt ? new Date(data.bookedCallAt) : null;
      // Marking a call booked implies the status, unless one was set explicitly.
      if (updateData.bookedCallAt && data.status === undefined && existing.status === 'NEW') {
        updateData.status = 'CALL_BOOKED';
      }
    }

    const application = await prisma.pilotApplication.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json({ application });
  } catch (err) {
    next(err);
  }
};

module.exports = { submit, getConfig, list, update, DEDUPE_WINDOW_MS };
