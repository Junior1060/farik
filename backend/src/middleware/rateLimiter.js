const rateLimit = require('express-rate-limit');

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

module.exports = { authLimiter, costSensitiveLimiter };
