jest.mock('fs', () => ({
  readFileSync: jest.fn(() => Buffer.from('fake-pdf-bytes')),
}));

const aiClient = require('../../src/services/ai/aiClient');
const { extractInvoiceData, exceedsApprovedEstimate } = require('../../src/services/invoiceExtractionService');

afterEach(() => aiClient.clearMockHandler());

describe('extractInvoiceData', () => {
  it('returns validated structured data for a clean AI response', async () => {
    aiClient.setMockHandler(() => JSON.stringify({
      vendorName: 'Bob Plumbing', invoiceNumber: 'INV-001', invoiceDate: '2026-07-01',
      lineItems: [{ description: 'Labor', amount: 150 }], tax: 12, total: 162,
      serviceDescription: 'Fixed kitchen leak',
    }));

    const result = await extractInvoiceData('/fake/path/invoice.pdf');

    expect(result.vendorName).toBe('Bob Plumbing');
    expect(result.total).toBe(162);
  });

  it('returns null (never throws) when the AI response fails schema validation', async () => {
    aiClient.setMockHandler(() => 'not valid json at all');
    const result = await extractInvoiceData('/fake/path/invoice.pdf');
    expect(result).toBeNull();
  });

  it('rejects unsupported file types before calling the AI', async () => {
    await expect(extractInvoiceData('/fake/path/invoice.docx')).rejects.toThrow(/Unsupported invoice file type/);
  });
});

describe('exceedsApprovedEstimate', () => {
  it('flags an extracted total above the approved estimate', () => {
    expect(exceedsApprovedEstimate(900, 500)).toBe(true);
  });

  it('does not flag a total within the approved estimate', () => {
    expect(exceedsApprovedEstimate(400, 500)).toBe(false);
  });

  it('does not flag when either value is missing', () => {
    expect(exceedsApprovedEstimate(null, 500)).toBe(false);
    expect(exceedsApprovedEstimate(900, null)).toBe(false);
  });
});
