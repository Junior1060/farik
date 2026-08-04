/**
 * Public contact configuration for the marketing site.
 *
 * There is no pilot-application backend yet, so the pilot form composes a
 * mailto: instead of POSTing. When this is null the form renders disabled with
 * an explanatory banner — it never pretends to submit.
 *
 * TODO: replace the mailto flow with POST /api/pilot-applications once an
 * endpoint exists, and drop VITE_PILOT_CONTACT_EMAIL.
 */
export const PILOT_CONTACT_EMAIL = import.meta.env.VITE_PILOT_CONTACT_EMAIL || null;

/** Demo credential shortcuts on /login. Set to 'false' to hide them in production. */
export const DEMO_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_DEMO_LOGIN !== 'false';
