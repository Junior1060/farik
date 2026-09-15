/**
 * Founding Landlord Pilot configuration.
 *
 * Every value is read at call time (not module load) so tests and deployments
 * can change the environment without re-importing modules.
 */

/** Public scheduling link (Cal.com / Calendly / anything). Null when unset. */
function getBookingUrl() {
  const raw = (process.env.BOOKING_URL || '').trim();
  if (!raw) return null;
  // Only ever hand the browser an absolute https/http link.
  if (!/^https?:\/\//i.test(raw)) {
    console.warn('[pilot] BOOKING_URL is set but is not an absolute http(s) URL — ignoring it.');
    return null;
  }
  return raw;
}

/** Where team notifications go. Null when unset (the app still accepts applications). */
function getNotificationEmail() {
  return (process.env.PILOT_NOTIFICATION_EMAIL || '').trim() || null;
}

/** Publicly advertisable support address, shown as a fallback if submission fails. */
function getPublicContactEmail() {
  return (process.env.PUBLIC_CONTACT_EMAIL || '').trim() || null;
}

/** Marketing/app origin used to build links inside emails. */
function getAppUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

/**
 * Emails allowed to read and manage pilot applications, as a comma-separated
 * allowlist. Empty means nobody — the admin API stays closed rather than open.
 */
function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  if (!email) return false;
  return getAdminEmails().includes(String(email).trim().toLowerCase());
}

/**
 * Append the applicant's details to a scheduling link so the booking is tied to
 * the person who applied. Cal.com and Calendly both read `name`/`email` from the
 * query string; the rest ride along as prefilled custom answers where supported
 * and are harmless where not.
 */
function buildBookingUrl(application, baseUrl = getBookingUrl()) {
  if (!baseUrl) return null;
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    console.warn('[pilot] BOOKING_URL could not be parsed as a URL — ignoring it.');
    return null;
  }
  if (!application) return url.toString();

  const params = {
    name: application.fullName,
    email: application.email,
    phone: application.phone,
    city: application.city,
    units: application.unitsManaged != null ? String(application.unitsManaged) : undefined,
    // Correlate the booking back to the stored application.
    pilot_ref: application.id,
  };
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

module.exports = {
  getBookingUrl,
  getNotificationEmail,
  getPublicContactEmail,
  getAppUrl,
  getAdminEmails,
  isAdminEmail,
  buildBookingUrl,
};
