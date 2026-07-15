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

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

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

async function extractPortfolio({ file, text }) {
  const content = await buildContent({ file, text });

  const rawText = await aiClient.createMessage({
    system: SYSTEM_PROMPT,
    maxTokens: 8000,
    messages: [{ role: 'user', content }],
  });

  return parseResult(rawText);
}

module.exports = { extractPortfolio, TARGET_KEYS };
