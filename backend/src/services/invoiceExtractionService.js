const fs = require('fs');
const path = require('path');
const { callAndValidate, AiValidationError } = require('./ai/validate');
const { invoiceExtractionSchema } = require('./ai/schemas');

const SYSTEM_PROMPT = 'You extract structured data from vendor invoices for a property management system. '
  + 'Always respond with valid JSON only. Never invent numbers — if a field is not present, use null.';

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function buildContent(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  const data = fs.readFileSync(filePath).toString('base64');

  if (ext === '.pdf') {
    return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }];
  }
  if (IMAGE_TYPES[ext]) {
    return [{ type: 'image', source: { type: 'base64', media_type: IMAGE_TYPES[ext], data } }];
  }
  throw new Error(`Unsupported invoice file type: ${ext}`);
}

/**
 * Best-effort AI extraction of invoice fields. Never blocks the upload flow —
 * on failure, returns null and the invoice stays PENDING_REVIEW for manual entry.
 */
async function extractInvoiceData(filePath) {
  try {
    const content = buildContent(filePath);
    const result = await callAndValidate(
      {
        system: SYSTEM_PROMPT,
        maxTokens: 1024,
        messages: [{
          role: 'user',
          content: [
            ...content,
            { type: 'text', text: 'Extract this invoice. Return JSON: { "vendorName", "invoiceNumber", "invoiceDate" (YYYY-MM-DD), "lineItems": [{"description","amount"}], "tax", "total", "serviceDescription" }' },
          ],
        }],
      },
      invoiceExtractionSchema,
    );
    return result;
  } catch (err) {
    if (err instanceof AiValidationError) return null;
    throw err;
  }
}

/** True when the extracted total exceeds the workflow's approved estimate. */
function exceedsApprovedEstimate(extractedTotal, approvedEstimateMax) {
  if (extractedTotal == null || approvedEstimateMax == null) return false;
  return extractedTotal > approvedEstimateMax;
}

module.exports = { extractInvoiceData, exceedsApprovedEstimate };
