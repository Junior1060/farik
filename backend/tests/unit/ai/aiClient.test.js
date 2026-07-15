// These tests exercise the real (non-mock) provider path, so they override the
// global AI_PROVIDER=mock set in tests/setup/env.js and mock the Anthropic SDK
// itself instead.
describe('aiClient — real provider timeout/retry behavior', () => {
  let aiClient;
  let mockCreate;

  beforeEach(() => {
    jest.resetModules();
    process.env.AI_PROVIDER = 'anthropic';
    mockCreate = jest.fn();
    jest.doMock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })));
    aiClient = require('../../../src/services/ai/aiClient');
  });

  afterEach(() => {
    process.env.AI_PROVIDER = 'mock';
    jest.dontMock('@anthropic-ai/sdk');
    jest.resetModules();
  });

  it('times out using the default timeout when no override is given, for a call that never resolves', async () => {
    mockCreate.mockImplementation(() => new Promise(() => {})); // never resolves
    // Override just for this call so the test doesn't have to wait for the real default.
    await expect(aiClient.createMessage({ system: 's', messages: [], timeoutMs: 30, retries: 0 }))
      .rejects.toThrow(/timed out/);
  });

  it('respects a longer per-call timeoutMs override and succeeds instead of timing out', async () => {
    mockCreate.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ content: [{ type: 'text', text: 'ok' }] }), 40);
    }));

    const result = await aiClient.createMessage({ system: 's', messages: [], timeoutMs: 500, retries: 0 });
    expect(result).toBe('ok');
  });

  it('retries a timed-out call up to the given retries count before giving up', async () => {
    let attempts = 0;
    mockCreate.mockImplementation(() => {
      attempts += 1;
      return new Promise(() => {}); // always hangs — every attempt will time out
    });

    await expect(aiClient.createMessage({ system: 's', messages: [], timeoutMs: 20, retries: 2 }))
      .rejects.toThrow(/timed out/);
    expect(attempts).toBe(3); // initial attempt + 2 retries
  });
});
