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
  }).slice(1)); // extractPortfolio prefixes the '{' itself via the assistant prefill
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
