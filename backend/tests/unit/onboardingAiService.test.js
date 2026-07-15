jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
}));
jest.mock('word-extractor', () => jest.fn());
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => Buffer.from('fake-bytes')),
}));

const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const aiClient = require('../../src/services/ai/aiClient');
const onboardingAiService = require('../../src/services/onboardingAiService');

afterEach(() => {
  aiClient.clearMockHandler();
  jest.clearAllMocks();
});

function mockAiRowsResponse() {
  aiClient.setMockHandler(() => JSON.stringify({
    rows: [{ propertyName: 'Maple Court', tenantFirstName: 'Alice', tenantLastName: 'Morgan' }],
    summary: 'Found 1 tenant',
    warnings: [],
  }));
}

describe('extractPortfolio — Word document support', () => {
  it('extracts text from a .docx file via mammoth and feeds it to the AI', async () => {
    mammoth.extractRawText.mockResolvedValue({ value: 'Maple Court, Alice Morgan, alice@example.com' });
    mockAiRowsResponse();

    const result = await onboardingAiService.extractPortfolio({
      file: { originalname: 'tenants.docx', path: '/fake/tenants.docx' },
    });

    expect(mammoth.extractRawText).toHaveBeenCalledWith({ path: '/fake/tenants.docx' });
    expect(result.rows[0].propertyName).toBe('Maple Court');
  });

  it('extracts text from a legacy .doc file via word-extractor', async () => {
    const extractMock = jest.fn().mockResolvedValue({ getBody: () => 'Maple Court, Alice Morgan' });
    WordExtractor.mockImplementation(() => ({ extract: extractMock }));
    mockAiRowsResponse();

    const result = await onboardingAiService.extractPortfolio({
      file: { originalname: 'tenants.doc', path: '/fake/tenants.doc' },
    });

    expect(extractMock).toHaveBeenCalledWith('/fake/tenants.doc');
    expect(result.rows[0].propertyName).toBe('Maple Court');
  });

  it('still throws a clear error for a genuinely unsupported file type', async () => {
    await expect(onboardingAiService.extractPortfolio({
      file: { originalname: 'tenants.txt', path: '/fake/tenants.txt' },
    })).rejects.toThrow(/Unsupported file type/);
  });
});

describe('extractPortfolio — JSON parsing without assistant prefill', () => {
  // claude-sonnet-4-6 rejects assistant-message prefill outright, so the service
  // must parse a complete, un-prefilled JSON response from the model.
  it('parses a clean JSON response with no leading "{" added by us', async () => {
    mammoth.extractRawText.mockResolvedValue({ value: 'some text' });
    aiClient.setMockHandler(() => JSON.stringify({ rows: [{ propertyName: 'Oak St' }], summary: '', warnings: [] }));

    const result = await onboardingAiService.extractPortfolio({ file: { originalname: 'x.docx', path: '/fake/x.docx' } });

    expect(result.rows[0].propertyName).toBe('Oak St');
  });

  it('strips markdown fences if the model adds them despite instructions', async () => {
    mammoth.extractRawText.mockResolvedValue({ value: 'some text' });
    aiClient.setMockHandler(() => '```json\n' + JSON.stringify({ rows: [{ propertyName: 'Fenced' }], summary: '', warnings: [] }) + '\n```');

    const result = await onboardingAiService.extractPortfolio({ file: { originalname: 'x.docx', path: '/fake/x.docx' } });

    expect(result.rows[0].propertyName).toBe('Fenced');
  });

  it('recovers a JSON object even if the model adds a short preamble', async () => {
    mammoth.extractRawText.mockResolvedValue({ value: 'some text' });
    aiClient.setMockHandler(() => 'Sure, here is the data:\n' + JSON.stringify({ rows: [{ propertyName: 'Preamble' }], summary: '', warnings: [] }));

    const result = await onboardingAiService.extractPortfolio({ file: { originalname: 'x.docx', path: '/fake/x.docx' } });

    expect(result.rows[0].propertyName).toBe('Preamble');
  });
});
