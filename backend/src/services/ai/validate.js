const aiClient = require('./aiClient');

class AiValidationError extends Error {
  constructor(message, { issues, rawText } = {}) {
    super(message);
    this.name = 'AiValidationError';
    this.issues = issues;
    this.rawText = rawText;
  }
}

// Strips markdown code fences some models add despite instructions not to.
function extractJson(rawText) {
  const trimmed = rawText.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fence ? fence[1].trim() : trimmed;
}

/**
 * Calls the AI, parses JSON, validates against a zod schema. On invalid output,
 * retries once with an error-correction follow-up before giving up.
 * Callers MUST catch AiValidationError and fall back to manual/escalation handling —
 * never execute an action derived from unvalidated AI output.
 *
 * @param {{system: string, messages: Array, maxTokens?: number}} request
 * @param {import('zod').ZodSchema} schema
 * @param {{retries?: number}} [options]
 */
async function callAndValidate(request, schema, { retries = 1 } = {}) {
  let messages = [...request.messages];
  let lastIssues;
  let lastRawText;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const rawText = await aiClient.createMessage({ ...request, messages });
    lastRawText = rawText;

    let parsed;
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch (err) {
      lastIssues = [`Response was not valid JSON: ${err.message}`];
      messages = [
        ...messages,
        { role: 'assistant', content: rawText },
        { role: 'user', content: 'That was not valid JSON. Respond again with ONLY a valid JSON object, no markdown fences, no explanation.' },
      ];
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;

    lastIssues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    messages = [
      ...messages,
      { role: 'assistant', content: rawText },
      { role: 'user', content: `That JSON did not match the required schema (${lastIssues.join('; ')}). Respond again with a corrected JSON object only.` },
    ];
  }

  throw new AiValidationError(`AI output failed schema validation after ${retries + 1} attempt(s)`, {
    issues: lastIssues,
    rawText: lastRawText,
  });
}

module.exports = { callAndValidate, AiValidationError, extractJson };
