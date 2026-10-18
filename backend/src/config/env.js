// Values that have shipped in example files or docs. Any of them in production means
// the secret was never generated, and every session token can be forged.
const PLACEHOLDER_SECRETS = new Set([
  'REPLACE_ME_GENERATE_YOUR_OWN_SECRET',
  'super-secret-key-change-in-production',
  'generate-a-long-random-string-here',
  'secret',
  'changeme',
]);
const MIN_JWT_SECRET_LENGTH = 32;

/** Human-readable reason this JWT secret is unsafe, or null when it is acceptable. */
function jwtSecretProblem(secret) {
  if (!secret) return 'JWT_SECRET is not set';
  if (PLACEHOLDER_SECRETS.has(secret)) return 'JWT_SECRET is still the placeholder from .env.example';
  if (secret.length < MIN_JWT_SECRET_LENGTH) return `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (generate one with: openssl rand -base64 48)`;
  return null;
}

/**
 * Refuses to start a production process that could never be safe. Sessions, tenant
 * invitation links and nothing else are signed with JWT_SECRET, so a guessable or
 * missing secret lets anyone mint a login for any account; a missing FRONTEND_URL
 * would make CORS admit only localhost and send Stripe/email links to the wrong
 * place. Development and tests are not gated.
 */
function assertProductionEnv(env = process.env) {
  if (env.NODE_ENV !== 'production') return;

  const problems = [];
  const secretProblem = jwtSecretProblem(env.JWT_SECRET);
  if (secretProblem) problems.push(secretProblem);
  if (!env.FRONTEND_URL) problems.push('FRONTEND_URL is not set (CORS, Stripe redirects and invitation links all need it)');

  if (problems.length) {
    throw new Error(`Refusing to start in production: ${problems.join('; ')}`);
  }
}

module.exports = { assertProductionEnv, jwtSecretProblem, MIN_JWT_SECRET_LENGTH };
