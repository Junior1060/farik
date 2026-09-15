/**
 * Public, non-secret build-time configuration.
 *
 * This is a Vite SPA, so browser-visible variables use the VITE_ prefix and are
 * inlined into the bundle at build time — never put a secret behind one.
 */

/**
 * Demo-credential shortcut buttons on /login. Opt-in: only a deployment that
 * explicitly sets VITE_ENABLE_DEMO_LOGIN=true (a seeded demo environment) shows
 * them. A production deployment never does.
 */
export const DEMO_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';
