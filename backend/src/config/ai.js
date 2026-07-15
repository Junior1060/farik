// Central AI configuration. Switch AI_PROVIDER=mock (no ANTHROPIC_API_KEY needed) for local dev/tests.
module.exports = {
  provider: process.env.AI_PROVIDER === 'mock' ? 'mock' : 'anthropic',
  model: process.env.AI_MODEL || 'claude-sonnet-4-6',
  maxRetries: Number(process.env.AI_MAX_RETRIES || 2),
  timeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000),
};
