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

// A failure calling Claude itself (bad/missing API key, rate limited, Anthropic outage,
// our own request timeout) — distinct from "this file/text couldn't be parsed into rental
// data". Callers use this to avoid telling the landlord to fix their file when the problem
// is actually on our end.
function isServiceError(err) {
  const status = err?.status || err?.response?.status;
  return status === 401 || status === 403 || status === 429 || (status >= 500 && status < 600) || err?.code === 'ETIMEDOUT';
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

// The model hit max_tokens before finishing — the JSON is cut off mid-value and
// will fail to parse. Not retryable: the same input will truncate the same way
// every time, so retrying just wastes an attempt. Callers (onboardingAiService)
// use err.code to give the landlord an actionable message instead of a raw
// "Unexpected token" JSON parse error.
function throwTruncated() {
  const err = new Error('AI response was cut off — there is too much data for a single request.');
  err.code = 'MAX_TOKENS_TRUNCATED';
  throw err;
}

/**
 * Single entry point for every Claude call in the app.
 * @returns {Promise<string>} raw assistant text (content[0].text)
 */
async function createMessage({ system, messages, maxTokens = 1024, cachePrompt = true, retries = aiConfig.maxRetries, timeoutMs = aiConfig.timeoutMs }) {
  if (aiConfig.provider === 'mock') {
    if (!mockHandler) {
      throw new Error('AI_PROVIDER=mock but no mock handler registered. Call aiClient.setMockHandler() first.');
    }
    const result = await mockHandler({ system, messages, maxTokens });
    const { text, stopReason } = typeof result === 'string' ? { text: result, stopReason: 'end_turn' } : result;
    if (stopReason === 'max_tokens') throwTruncated();
    return text;
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
        timeoutMs,
      );
      const block = response.content?.[0];
      if (!block || block.type !== 'text') throw new Error('Unexpected AI response shape (no text block)');
      if (response.stop_reason === 'max_tokens') throwTruncated();
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

module.exports = { createMessage, setMockHandler, clearMockHandler, isServiceError };
