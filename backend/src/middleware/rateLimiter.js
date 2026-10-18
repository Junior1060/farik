const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// Tight window for login/register — blunts credential-stuffing/brute-force attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

// Looser window for routes that incur real per-request cost (SMS send, Anthropic API calls)
// or accept external/unauthenticated input at volume.
const costSensitiveLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

// Per-account cap for signed-in routes where one user can make Farik spend money on
// their behalf — a tenant message triggers an AI classification, a maintenance request
// triggers AI triage and vendor texts, the agent trigger runs every scheduled job.
// Keyed by user id so a whole office behind one IP is not throttled together; falls
// back to the client IP for anything that reaches it unauthenticated.
const perUserCostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
  message: { error: 'You are doing that too often. Please wait a few minutes and try again.' },
});

module.exports = { authLimiter, costSensitiveLimiter, perUserCostLimiter };
