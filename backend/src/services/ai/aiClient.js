const Anthropic = require('@anthropic-ai/sdk');
const aiConfig = require('../../config/ai');

let anthropic = null;
function getAnthropicClient() {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

// Tests / demo (AI_PROVIDER=mock) register a handler instead of hitting the real API.
// Signature: (params) => string | Promise<string>  — returns the raw assistant text.
let mockHandler = null;
function setMockHandler(fn) {
  mockHandler = fn;
}
function clearMockHandler() {
  mockHandler = null;
}

function isRetryableError(err) {
  const status = err?.status || err?.response?.status;
  return status === 429 || (status >= 500 && status < 600) || err?.code === 'ETIMEDOUT';
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('AI request timed out'), { code: 'ETIMEDOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single entry point for every Claude call in the app.
 * @returns {Promise<string>} raw assistant text (content[0].text)
 */
async function createMessage({ system, messages, maxTokens = 1024, cachePrompt = true, retries = aiConfig.maxRetries }) {
  if (aiConfig.provider === 'mock') {
    if (!mockHandler) {
      throw new Error('AI_PROVIDER=mock but no mock handler registered. Call aiClient.setMockHandler() first.');
    }
    return mockHandler({ system, messages, maxTokens });
  }

  const client = getAnthropicClient();
  const systemBlocks = typeof system === 'string'
    ? [{ type: 'text', text: system, ...(cachePrompt ? { cache_control: { type: 'ephemeral' } } : {}) }]
    : system;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await withTimeout(
        client.messages.create({ model: aiConfig.model, max_tokens: maxTokens, system: systemBlocks, messages }),
        aiConfig.timeoutMs,
      );
      const block = response.content?.[0];
      if (!block || block.type !== 'text') throw new Error('Unexpected AI response shape (no text block)');
      return block.text;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetryableError(err)) {
        await sleep(2 ** attempt * 300);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

module.exports = { createMessage, setMockHandler, clearMockHandler };
