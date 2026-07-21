jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
}));
jest.mock('word-extractor', () => jest.fn());
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => Buffer.from('fake-bytes')),
}));

const fs = require('fs');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const aiClient = require('../../src/services/ai/aiClient');
const onboardingAiService = require('../../src/services/onboardingAiService');

// Build a real .xlsx buffer with `rowCount` data rows so XLSX.read can parse it for real.
function buildXlsxBuffer(rowCount) {
  const header = ['Property Name', 'Unit Number', 'Tenant First Name', 'Tenant Last Name', 'Tenant Email', 'Monthly Rent ($)'];
  const rows = [header];
  for (let i = 1; i <= rowCount; i++) {
    rows.push([`Property ${i}`, `Unit ${i}`, `First${i}`, `Last${i}`, `tenant${i}@example.com`, `${1000 + i}`]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Properties');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

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

describe('extractPortfolio — spreadsheet batching for large ("enterprise") imports', () => {
  // A single Claude call truncates around ~100 units (verified: 150 rows hit
  // stop_reason "max_tokens"). Anything over SPREADSHEET_BATCH_SIZE (60) data rows
  // must be split into batches and merged instead of sent in one request.
  it('keeps a small spreadsheet on the single-call path (no batching)', async () => {
    fs.readFileSync.mockReturnValue(buildXlsxBuffer(5));
    let callCount = 0;
    aiClient.setMockHandler(() => {
      callCount += 1;
      return JSON.stringify({ rows: [{ propertyName: 'Small' }], summary: 'ok', warnings: [] });
    });

    const result = await onboardingAiService.extractPortfolio({ file: { originalname: 'small.xlsx', path: '/fake/small.xlsx' } });

    expect(callCount).toBe(1);
    expect(result.rows).toHaveLength(1);
  });

  it('splits a 130-row spreadsheet into 5 batched AI calls (30/batch) and merges the results with unique ids', async () => {
    fs.readFileSync.mockReturnValue(buildXlsxBuffer(130)); // batches of 30 -> 30/30/30/30/10 = 5 calls
    let callCount = 0;
    aiClient.setMockHandler(({ messages }) => {
      callCount += 1;
      const text = messages[0].content[0].text;
      const firstRow = text.match(/Property (\d+)/)[1];
      return JSON.stringify({ rows: [{ propertyName: `Batch-${firstRow}` }], summary: '', warnings: [] });
    });

    const result = await onboardingAiService.extractPortfolio({ file: { originalname: 'big.xlsx', path: '/fake/big.xlsx' } });

    expect(callCount).toBe(5);
    expect(result.rows).toHaveLength(5);
    expect(result.rows.map((r) => r._id)).toEqual(['ai-0', 'ai-1', 'ai-2', 'ai-3', 'ai-4']);
    expect(result.rows.map((r) => r.propertyName).sort()).toEqual(['Batch-1', 'Batch-121', 'Batch-31', 'Batch-61', 'Batch-91']);
    expect(result.summary).toMatch(/Found 5 propert/);
  });

  it('skips a batch that gets truncated instead of failing the whole import', async () => {
    fs.readFileSync.mockReturnValue(buildXlsxBuffer(130));
    aiClient.setMockHandler(({ messages }) => {
      const text = messages[0].content[0].text;
      if (text.includes('Property 61')) return { text: '', stopReason: 'max_tokens' };
      const firstRow = text.match(/Property (\d+)/)[1];
      return JSON.stringify({ rows: [{ propertyName: `Batch-${firstRow}` }], summary: '', warnings: [] });
    });

    const result = await onboardingAiService.extractPortfolio({ file: { originalname: 'big.xlsx', path: '/fake/big.xlsx' } });

    expect(result.rows).toHaveLength(4); // 5 batches, the one truncated batch is skipped, not fatal
    expect(result.warnings.some((w) => w.includes('too much data'))).toBe(true);
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
