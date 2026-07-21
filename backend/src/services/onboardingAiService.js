const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const aiClient = require('./ai/aiClient');

// Internal row keys the import `confirm`/`validateRows` pipeline consumes.
const TARGET_KEYS = [
  'propertyName', 'propertyAddress', 'propertyCity', 'propertyState', 'propertyZip',
  'unitNumber', 'bedrooms', 'bathrooms', 'sqft',
  'tenantFirstName', 'tenantLastName', 'tenantEmail', 'tenantPhone',
  'leaseStartDate', 'leaseEndDate', 'monthlyRent', 'securityDeposit',
  'paymentDueDay', 'leaseStatus', 'notes', 'parkingInfo', 'utilitiesIncluded',
];

const SYSTEM_PROMPT = `You are Farik's onboarding AI. A landlord has handed you their rental portfolio data in some raw form — a spreadsheet dump, a PDF rent roll, a photo of a table, or free-form text. Your job is to extract it into a strict, structured list Farik can import.

Output ONLY a single JSON object (no markdown, no prose) of the form:
{
  "rows": [ { ...one object per unit/tenant/lease... } ],
  "summary": "one short sentence, e.g. 'Found Maple Court — 8 units, 7 tenants, $9,400/mo total'",
  "warnings": [ "short notes about anything unclear or missing" ]
}

Each row object may use ONLY these keys:
${TARGET_KEYS.map((k) => `- ${k}`).join('\n')}

Rules:
- One row per unit + tenant + lease. If a property has multiple units, emit multiple rows sharing the same property fields.
- Dates MUST be normalized to YYYY-MM-DD. If only a start date + term (e.g. "12-month") is given, compute leaseEndDate; otherwise leave it "".
- Money fields (monthlyRent, securityDeposit) are plain numbers — strip "$", commas, and "/mo".
- paymentDueDay is a number 1–31 (the day of month rent is due). Default to 1 only if a due day is clearly implied; otherwise leave "".
- leaseStatus is one of ACTIVE, PENDING, EXPIRED, TERMINATED (default ACTIVE when a tenant is clearly currently living there).
- NEVER invent data. If a value is genuinely not present (especially tenantEmail or monthlyRent), set it to "" and add a warning. Do not fabricate emails, phone numbers, or rent amounts.
- Every key must be present on every row; use "" for unknowns.
- If the input is unreadable or clearly not rental data, return "rows": [] with an explanatory warning.`;

const DOCUMENT_TARGET_KEYS = [
  'tenantName', 'unitNumber', 'propertyName',
  'startDate', 'endDate', 'monthlyRent', 'deposit', 'notes',
];

const SYSTEM_PROMPT_DOCUMENT = `You are Farik's onboarding AI. A landlord has uploaded a single lease-related document (a signed lease agreement, a rental application, or similar) during import. Your job is to extract key lease details from it, if present.

Output ONLY a single JSON object (no markdown, no prose) of the form:
{
  "tenantName": "", "unitNumber": "", "propertyName": "",
  "startDate": "", "endDate": "", "monthlyRent": "", "deposit": "", "notes": "",
  "warnings": [ "short notes about anything unclear or missing" ]
}

Rules:
- Dates MUST be normalized to YYYY-MM-DD.
- monthlyRent and deposit are plain numbers — strip "$", commas, and "/mo".
- NEVER invent data. If a value is genuinely not present, set it to "" and add a warning. Do not fabricate names, dates, or amounts.
- Every key must be present; use "" for unknowns.
- If the document is unreadable or clearly not lease-related, return all fields as "" with an explanatory warning.`;

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// Verified empirically against the real 21-key schema: 30 rows/batch uses ~5500 of
// the 8000-token output budget (safe margin), 40 rows hits ~7300 (too close given
// real-world data has longer notes/addresses than synthetic test rows), and 50 rows
// truncates outright (stop_reason "max_tokens"). Past this many data rows, split the
// spreadsheet into batches and merge the results instead of sending it all in one
// request — this is what lets "enterprise" imports (hundreds of units) actually
// complete instead of always truncating.
const SPREADSHEET_BATCH_SIZE = 30;
const BATCH_CONCURRENCY = 3;

function isSpreadsheetExt(ext) {
  return ['.xlsx', '.xls', '.csv'].includes(ext);
}

// Split every sheet's data rows into batches of SPREADSHEET_BATCH_SIZE, each carrying
// its own copy of the header row so Claude can still make sense of the columns.
function buildSpreadsheetChunks(file) {
  const wb = XLSX.read(fs.readFileSync(file.path), { type: 'buffer', raw: false });
  const chunks = [];

  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    const lines = csv.split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) continue;

    const [header, ...dataLines] = lines;
    for (let i = 0; i < dataLines.length; i += SPREADSHEET_BATCH_SIZE) {
      const batchLines = dataLines.slice(i, i + SPREADSHEET_BATCH_SIZE);
      chunks.push(`--- Sheet: ${name} ---\n${header}\n${batchLines.join('\n')}`);
    }
  }

  return chunks;
}

async function runWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const current = next++;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function callPortfolioAI(content) {
  const rawText = await aiClient.createMessage({
    system: SYSTEM_PROMPT,
    maxTokens: 8000,
    // Document/image extraction + a large max_tokens generation genuinely takes
    // longer than routine triage calls — give it more room, but only one retry
    // so a slow request doesn't compound into a multi-minute wait.
    timeoutMs: 90000,
    retries: 1,
    messages: [{ role: 'user', content }],
  });
  return parseResult(rawText);
}

async function extractSpreadsheetPortfolioBatched(file) {
  const chunks = buildSpreadsheetChunks(file);
  if (chunks.length === 0) return { rows: [], summary: '', warnings: [] };

  const batchResults = await runWithConcurrency(chunks, BATCH_CONCURRENCY, async (chunk, i) => {
    try {
      return await callPortfolioAI([{ type: 'text', text: `Here is a portion of the landlord's spreadsheet:\n\n${chunk}` }]);
    } catch (err) {
      if (err.code === 'MAX_TOKENS_TRUNCATED') {
        return { rows: [], summary: '', warnings: [`Batch ${i + 1} had too much data to process and was skipped — try splitting this file into smaller sheets.`] };
      }
      throw err;
    }
  });

  const rows = [];
  const warnings = [];
  for (const r of batchResults) {
    rows.push(...r.rows);
    warnings.push(...r.warnings);
  }
  // Re-tag ids so they're unique across merged batches (each batch independently starts at "ai-0").
  rows.forEach((row, idx) => { row._id = `ai-${idx}`; });

  const properties = new Set(rows.map((r) => r.propertyName).filter(Boolean));
  const totalRent = rows.reduce((sum, r) => sum + (parseFloat(r.monthlyRent) || 0), 0);
  const summary = rows.length
    ? `Found ${properties.size} propert${properties.size === 1 ? 'y' : 'ies'} — ${rows.length} units, $${totalRent.toLocaleString()}/mo total`
    : '';

  return { rows, summary, warnings };
}

// Build the Claude content block(s) for whatever the landlord gave us.
async function buildContent({ file, text }) {
  if (text && text.trim()) {
    return [{ type: 'text', text: `Here is the landlord's data (pasted text):\n\n${text.trim()}` }];
  }
  if (!file) throw new Error('No file or text provided');

  const ext = path.extname(file.originalname || file.path).toLowerCase();

  // Spreadsheets → flatten all sheets to CSV text (cheaper + more reliable than vision).
  if (['.xlsx', '.xls', '.csv'].includes(ext)) {
    const wb = XLSX.read(fs.readFileSync(file.path), { type: 'buffer', raw: false });
    const chunks = wb.SheetNames.map((name) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      return `--- Sheet: ${name} ---\n${csv}`;
    });
    return [{ type: 'text', text: `Here is the landlord's spreadsheet:\n\n${chunks.join('\n\n')}` }];
  }

  // Word documents → extract raw text (.docx via mammoth, legacy .doc via word-extractor).
  if (ext === '.docx') {
    const { value: docText } = await mammoth.extractRawText({ path: file.path });
    return [{ type: 'text', text: `Here is the landlord's document:\n\n${docText}` }];
  }
  if (ext === '.doc') {
    const doc = await new WordExtractor().extract(file.path);
    return [{ type: 'text', text: `Here is the landlord's document:\n\n${doc.getBody()}` }];
  }

  const data = fs.readFileSync(file.path).toString('base64');

  // PDF → document block (Claude reads PDFs natively).
  if (ext === '.pdf') {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
      { type: 'text', text: 'This PDF is the landlord\'s rental data. Extract it.' },
    ];
  }

  // Image → vision block.
  if (IMAGE_TYPES[ext]) {
    return [
      { type: 'image', source: { type: 'base64', media_type: IMAGE_TYPES[ext], data } },
      { type: 'text', text: 'This image shows the landlord\'s rental data. Read and extract it.' },
    ];
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

function parseResult(rawText) {
  let jsonText = rawText.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonText = fence[1].trim();

  // Defensive: some models occasionally add a short preamble despite instructions
  // not to. If the text doesn't already start with '{', extract the first
  // top-level JSON object rather than failing outright.
  if (!jsonText.startsWith('{')) {
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1) jsonText = jsonText.slice(start, end + 1);
  }

  const parsed = JSON.parse(jsonText);
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

  // Normalize: guarantee every target key exists as a trimmed string, tag with a client id.
  const cleanRows = rows.map((row, idx) => {
    const out = { _id: `ai-${idx}` };
    for (const key of TARGET_KEYS) {
      out[key] = row[key] == null ? '' : String(row[key]).trim();
    }
    return out;
  });

  return {
    rows: cleanRows,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((w) => typeof w === 'string') : [],
  };
}

function parseDocumentResult(rawText) {
  let jsonText = rawText.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonText = fence[1].trim();

  if (!jsonText.startsWith('{')) {
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1) jsonText = jsonText.slice(start, end + 1);
  }

  const parsed = JSON.parse(jsonText);

  const out = {};
  for (const key of DOCUMENT_TARGET_KEYS) {
    out[key] = parsed[key] == null ? '' : String(parsed[key]).trim();
  }
  out.warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((w) => typeof w === 'string') : [];

  return out;
}

async function extractLeaseDocument(file) {
  const content = await buildContent({ file });

  const rawText = await aiClient.createMessage({
    system: SYSTEM_PROMPT_DOCUMENT,
    maxTokens: 2000,
    timeoutMs: 90000,
    retries: 1,
    messages: [{ role: 'user', content }],
  });

  return parseDocumentResult(rawText);
}

async function extractPortfolio({ file, text }) {
  if (file && !(text && text.trim())) {
    const ext = path.extname(file.originalname || file.path).toLowerCase();
    if (isSpreadsheetExt(ext)) {
      const chunks = buildSpreadsheetChunks(file);
      if (chunks.length > 1) return extractSpreadsheetPortfolioBatched(file);
    }
  }

  const content = await buildContent({ file, text });
  return callPortfolioAI(content);
}

module.exports = { extractPortfolio, TARGET_KEYS, extractLeaseDocument, DOCUMENT_TARGET_KEYS };
