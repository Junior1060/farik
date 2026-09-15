/**
 * Public, non-secret configuration for the marketing site.
 *
 * This is a Vite SPA, so browser-visible variables use the VITE_ prefix (the
 * NEXT_PUBLIC_ convention does not apply here). Anything under VITE_ is inlined
 * into the bundle at build time — never put a secret behind one.
 */

/**
 * Support address shown as a fallback if a pilot application fails to submit.
 * Null when unset; the form simply omits the fallback line.
 */
export const PUBLIC_CONTACT_EMAIL = import.meta.env.VITE_PUBLIC_CONTACT_EMAIL || null;

/**
 * Optional build-time booking link. The server is the source of truth and
 * returns the configured link from GET /api/pilot-applications/config; this is
 * only a fallback for a frontend deployed before the API is reachable.
 */
export const FALLBACK_BOOKING_URL = import.meta.env.VITE_BOOKING_URL || null;

/** Demo credential shortcuts on /login. Set to 'false' to hide them in production. */
export const DEMO_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_DEMO_LOGIN !== 'false';
