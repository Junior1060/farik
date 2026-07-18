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

describe('extractLeaseDocument — single lease-document extraction', () => {
  it('extracts lease fields from a .docx lease file', async () => {
    mammoth.extractRawText.mockResolvedValue({ value: 'Lease for Alice Morgan, Unit 101, $2200/mo' });
    aiClient.setMockHandler(() => JSON.stringify({
      tenantName: 'Alice Morgan',
      unitNumber: '101',
      propertyName: 'Maple Court',
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      monthlyRent: '2200',
      deposit: '2200',
      notes: '',
      warnings: [],
    }));

    const result = await onboardingAiService.extractLeaseDocument({ originalname: 'lease.docx', path: '/fake/lease.docx' });

    expect(result.tenantName).toBe('Alice Morgan');
    expect(result.unitNumber).toBe('101');
    expect(result.monthlyRent).toBe('2200');
    expect(result.warnings).toEqual([]);
  });

  it('normalizes missing fields to empty strings rather than throwing', async () => {
    mammoth.extractRawText.mockResolvedValue({ value: 'illegible scan' });
    aiClient.setMockHandler(() => JSON.stringify({ warnings: ['Could not read the document clearly'] }));

    const result = await onboardingAiService.extractLeaseDocument({ originalname: 'lease.docx', path: '/fake/lease.docx' });

    expect(result.tenantName).toBe('');
    expect(result.unitNumber).toBe('');
    expect(result.warnings).toEqual(['Could not read the document clearly']);
  });

  it('strips markdown fences the same way portfolio extraction does', async () => {
    mammoth.extractRawText.mockResolvedValue({ value: 'some text' });
    aiClient.setMockHandler(() => '```json\n' + JSON.stringify({ tenantName: 'Fenced', unitNumber: '', propertyName: '', startDate: '', endDate: '', monthlyRent: '', deposit: '', notes: '', warnings: [] }) + '\n```');

    const result = await onboardingAiService.extractLeaseDocument({ originalname: 'x.docx', path: '/fake/x.docx' });

    expect(result.tenantName).toBe('Fenced');
  });

  it('propagates unsupported file type errors so the controller can catch them per-file', async () => {
    await expect(onboardingAiService.extractLeaseDocument({ originalname: 'lease.txt', path: '/fake/lease.txt' }))
      .rejects.toThrow(/Unsupported file type/);
  });
});
