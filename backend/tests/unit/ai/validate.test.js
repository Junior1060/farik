const { z } = require('zod');
const aiClient = require('../../../src/services/ai/aiClient');
const { callAndValidate, AiValidationError } = require('../../../src/services/ai/validate');

const schema = z.object({ foo: z.enum(['A', 'B']), count: z.number() });

afterEach(() => aiClient.clearMockHandler());

describe('callAndValidate', () => {
  it('returns parsed + validated data on a clean JSON response', async () => {
    aiClient.setMockHandler(() => JSON.stringify({ foo: 'A', count: 3 }));
    const result = await callAndValidate({ system: 's', messages: [] }, schema);
    expect(result).toEqual({ foo: 'A', count: 3 });
  });

  it('strips markdown fences before parsing', async () => {
    aiClient.setMockHandler(() => '```json\n' + JSON.stringify({ foo: 'B', count: 1 }) + '\n```');
    const result = await callAndValidate({ system: 's', messages: [] }, schema);
    expect(result).toEqual({ foo: 'B', count: 1 });
  });

  it('retries once on invalid schema then succeeds', async () => {
    let call = 0;
    aiClient.setMockHandler(() => {
      call += 1;
      return call === 1 ? JSON.stringify({ foo: 'Z', count: 1 }) : JSON.stringify({ foo: 'A', count: 1 });
    });
    const result = await callAndValidate({ system: 's', messages: [] }, schema, { retries: 1 });
    expect(result).toEqual({ foo: 'A', count: 1 });
    expect(call).toBe(2);
  });

  it('throws AiValidationError after exhausting retries on bad JSON', async () => {
    aiClient.setMockHandler(() => 'not json at all');
    await expect(callAndValidate({ system: 's', messages: [] }, schema, { retries: 1 }))
      .rejects.toBeInstanceOf(AiValidationError);
  });

  it('throws AiValidationError after exhausting retries on schema mismatch', async () => {
    aiClient.setMockHandler(() => JSON.stringify({ foo: 'NOPE', count: 'not-a-number' }));
    await expect(callAndValidate({ system: 's', messages: [] }, schema, { retries: 0 }))
      .rejects.toBeInstanceOf(AiValidationError);
  });
});
