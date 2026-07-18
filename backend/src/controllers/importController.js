const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const onboardingAiService = require('../services/onboardingAiService');

// ─── Column mapping: spreadsheet header → internal key ────────────────────────
const COL_MAP = {
  'Property Name':         'propertyName',
  'Property Address':      'propertyAddress',
  'City':                  'propertyCity',
  'Province/State':        'propertyState',
  'Postal Code':           'propertyZip',
  'Unit Number':           'unitNumber',
  'Bedrooms':              'bedrooms',
  'Bathrooms':             'bathrooms',
  'Sqft':                  'sqft',
  'Tenant First Name':     'tenantFirstName',
  'Tenant Last Name':      'tenantLastName',
  'Tenant Email':          'tenantEmail',
  'Tenant Phone':          'tenantPhone',
  'Lease Start Date':      'leaseStartDate',
  'Lease End Date':        'leaseEndDate',
  'Monthly Rent ($)':      'monthlyRent',
  'Security Deposit ($)':  'securityDeposit',
  'Payment Due Day (1-31)':'paymentDueDay',
  'Lease Status':          'leaseStatus',
  'Notes':                 'notes',
  'Emergency Contact':     'emergencyContact',
  'Parking':               'parkingInfo',
  'Utilities Included':    'utilitiesIncluded',
};

const TEMPLATE_HEADERS = Object.keys(COL_MAP);

const SAMPLE_ROWS = [
  [
    'Maple Heights', '123 Main Street', 'Vancouver', 'BC', 'V6B 1A1',
    'Unit 101', '2', '1', '850',
    'Alice', 'Morgan', 'alice.morgan@email.com', '(604) 555-0101',
    '2024-02-01', '2025-02-01', '2200', '4400', '1', 'ACTIVE',
    '', 'Bob Morgan (604) 555-9999', 'Spot B12', 'Water, Heat',
  ],
  [
    'Maple Heights', '123 Main Street', 'Vancouver', 'BC', 'V6B 1A1',
    'Unit 102', '1', '1', '650',
    'James', 'Carter', 'james.carter@email.com', '(604) 555-0202',
    '2024-03-01', '2025-03-01', '1800', '3600', '1', 'ACTIVE',
    '', '', '', '',
  ],
];

// ─── GET /api/import/template ──────────────────────────────────────────────────
const getTemplate = (req, res) => {
  const wb = XLSX.utils.book_new();

  // Instructions sheet
  const instructions = [
    ['Farik Import Template — Instructions'],
    [''],
    ['1. Fill in the Properties sheet. Each ROW = one unit + tenant + lease.'],
    ['2. Required columns are marked with * in the header row.'],
    ['3. Date format: YYYY-MM-DD  (e.g. 2025-01-01)'],
    ['4. Lease Status: ACTIVE, PENDING, EXPIRED, or TERMINATED'],
    ['5. Payment Due Day: number between 1 and 31 (e.g. 1 = 1st of every month)'],
    ['6. Save as .xlsx or .csv before uploading.'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

  // Properties sheet
  const requiredMark = (key) => {
    const required = ['Property Name', 'Property Address', 'Unit Number', 'Tenant First Name',
      'Tenant Last Name', 'Tenant Email', 'Lease Start Date', 'Lease End Date',
      'Monthly Rent ($)', 'Payment Due Day (1-31)'];
    return required.includes(key) ? `${key} *` : key;
  };

  const headers = TEMPLATE_HEADERS.map(requiredMark);
  const wsData = [headers, ...SAMPLE_ROWS];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));

  XLSX.utils.book_append_sheet(wb, ws, 'Properties');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="farik-import-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

// ─── POST /api/import/spreadsheet ─────────────────────────────────────────────
const parseSpreadsheet = (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const buf = fs.readFileSync(req.file.path);
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: false, dateNF: 'yyyy-mm-dd' });
    const ws = wb.Sheets[wb.SheetNames[wb.SheetNames[0] === 'Instructions' ? 1 : 0]];

    if (!ws) return res.status(400).json({ error: 'No data sheet found in the file' });

    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });

    // Clean up temp file
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    if (rawRows.length < 2) return res.status(400).json({ error: 'File has no data rows' });

    // Parse headers — strip the " *" required markers from template
    const rawHeaders = rawRows[0].map((h) => String(h).replace(' *', '').trim());

    const dataRows = rawRows
      .slice(1)
      .filter((row) => row.some((cell) => String(cell).trim() !== ''));

    if (dataRows.length === 0) return res.status(400).json({ error: 'No data rows found' });

    const rows = dataRows.map((row, idx) => {
      const obj = { _id: `row-${idx}` };
      rawHeaders.forEach((h, i) => {
        const key = COL_MAP[h];
        if (key) obj[key] = String(row[i] || '').trim();
      });
      return obj;
    });

    res.json({ rows, count: rows.length });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/import/ai  (universal AI ingest — any file or pasted text) ──────
const aiExtract = async (req, res, next) => {
  try {
    const text = req.body?.text;
    if (!req.file && !(text && text.trim())) {
      return res.status(400).json({ error: 'Upload a file or paste your data to continue.' });
    }

    const result = await onboardingAiService.extractPortfolio({ file: req.file, text });

    if (!result.rows.length) {
      return res.status(422).json({
        error: 'I could not find any rental data in that. Try a clearer file, or paste your tenant list as text.',
        warnings: result.warnings,
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  } finally {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
  }
};

// ─── POST /api/import/preview  (duplicate detection) ──────────────────────────
const preview = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });

    const landlordId = req.user.landlordProfile.id;

    // Fetch existing data for duplicate detection
    const [existingProps, existingUsers] = await Promise.all([
      prisma.property.findMany({
        where: { landlordId },
        include: { units: true },
      }),
      prisma.user.findMany({
        where: { role: 'TENANT' },
        select: { email: true },
      }),
    ]);

    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    const checked = rows.map((row) => {
      const serverWarnings = row._serverWarnings || [];

      // Email already exists — tenant will be linked, not created
      if (row.tenantEmail && existingEmails.has(row.tenantEmail.toLowerCase())) {
        serverWarnings.push({ field: 'tenantEmail', msg: 'Existing tenant — will be linked' });
      }

      // Unit already exists in property
      const matchProp = existingProps.find(
        (p) => p.name.toLowerCase() === (row.propertyName || '').toLowerCase(),
      );
      if (matchProp) {
        const matchUnit = matchProp.units.find(
          (u) => u.name.toLowerCase() === (row.unitNumber || '').toLowerCase(),
        );
        if (matchUnit) {
          serverWarnings.push({ field: 'unitNumber', msg: 'Unit already exists — will be skipped' });
        }
      }

      return { ...row, _serverWarnings: serverWarnings };
    });

    res.json({ rows: checked });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/import/documents ───────────────────────────────────────────────
const uploadDocuments = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.json({ documents: [] });
    }

    const landlordId = req.user.landlordProfile.id;
    const documents = [];

    for (const f of req.files) {
      let extracted;
      try {
        extracted = await onboardingAiService.extractLeaseDocument(f);
      } catch (extractErr) {
        console.error(`Lease document extraction failed for ${f.originalname}:`, extractErr);
        extracted = { error: 'Could not read this document automatically.' };
      }

      const doc = await prisma.uploadedDocument.create({
        data: {
          landlordId,
          originalName: f.originalname,
          storedName: f.filename,
          mimeType: f.mimetype,
          sizeBytes: f.size,
          extracted,
        },
      });

      documents.push({
        id: doc.id,
        originalName: f.originalname,
        size: f.size,
        mimeType: f.mimetype,
        extracted,
      });
    }

    res.json({ documents });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/import/confirm ─────────────────────────────────────────────────
const confirm = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });

    const landlordId = req.user.landlordProfile.id;
    const results = { properties: 0, units: 0, tenants: 0, leases: 0, payments: 0, skipped: 0, errors: [] };

    // Group rows by property name (case-insensitive)
    const propGroups = new Map();
    for (const row of rows) {
      if (!row._valid) { results.skipped++; continue; }
      const key = (row.propertyName || '').toLowerCase();
      if (!propGroups.has(key)) propGroups.set(key, []);
      propGroups.get(key).push(row);
    }

    for (const [, unitRows] of propGroups) {
      const firstRow = unitRows[0];

      // ── Find or create Property ──────────────────────────────────────────
      let property = await prisma.property.findFirst({
        where: { landlordId, name: { equals: firstRow.propertyName, mode: 'insensitive' } },
      });

      if (!property) {
        property = await prisma.property.create({
          data: {
            landlordId,
            name: firstRow.propertyName,
            address: firstRow.propertyAddress || '',
            city: firstRow.propertyCity || '',
            state: firstRow.propertyState || '',
            zip: firstRow.propertyZip || '',
          },
        });
        results.properties++;
      }

      for (const row of unitRows) {
        try {
          // ── Find or create Unit ────────────────────────────────────────────
          let unit = await prisma.unit.findFirst({
            where: { propertyId: property.id, name: { equals: row.unitNumber, mode: 'insensitive' } },
          });

          if (!unit) {
            unit = await prisma.unit.create({
              data: {
                propertyId: property.id,
                name: row.unitNumber,
                bedrooms: parseInt(row.bedrooms) || 1,
                bathrooms: parseFloat(row.bathrooms) || 1,
                sqft: row.sqft ? parseInt(row.sqft) : null,
                rentAmount: parseFloat(row.monthlyRent) || 0,
              },
            });
            results.units++;
          } else {
            // Unit already exists — skip this row
            results.skipped++;
            continue;
          }

          // ── Find or create User + TenantProfile ────────────────────────────
          let user = await prisma.user.findUnique({ where: { email: row.tenantEmail.toLowerCase() } });

          if (!user) {
            const tempPw = await bcrypt.hash(Math.random().toString(36).slice(2) + Date.now(), 10);
            user = await prisma.user.create({
              data: { email: row.tenantEmail.toLowerCase(), password: tempPw, role: 'TENANT' },
            });
          }

          let tenant = await prisma.tenantProfile.findUnique({ where: { userId: user.id } });
          if (!tenant) {
            tenant = await prisma.tenantProfile.create({
              data: {
                userId: user.id,
                firstName: row.tenantFirstName,
                lastName: row.tenantLastName,
                phone: row.tenantPhone || null,
              },
            });
            results.tenants++;
          }

          // ── Create Lease ───────────────────────────────────────────────────
          const validStatuses = ['ACTIVE', 'PENDING', 'EXPIRED', 'TERMINATED'];
          const leaseStatus = validStatuses.includes(row.leaseStatus) ? row.leaseStatus : 'ACTIVE';

          const lease = await prisma.lease.create({
            data: {
              tenantId: tenant.id,
              unitId: unit.id,
              startDate: new Date(row.leaseStartDate),
              endDate: new Date(row.leaseEndDate),
              monthlyRent: parseFloat(row.monthlyRent),
              deposit: parseFloat(row.securityDeposit) || 0,
              status: leaseStatus,
              notes: [row.notes, row.parkingInfo && `Parking: ${row.parkingInfo}`, row.utilitiesIncluded && `Utilities: ${row.utilitiesIncluded}`]
                .filter(Boolean).join('\n') || null,
            },
          });
          results.leases++;

          // Link an uploaded lease document to this lease, if the frontend matched one
          if (row._documentId) {
            await prisma.uploadedDocument.updateMany({
              where: { id: row._documentId, landlordId },
              data: { leaseId: lease.id },
            });
          }

          // Mark unit occupied for active leases
          if (leaseStatus === 'ACTIVE') {
            await prisma.unit.update({ where: { id: unit.id }, data: { isOccupied: true } });
          }

          // ── Create first Payment ───────────────────────────────────────────
          const dueDay = Math.min(Math.max(parseInt(row.paymentDueDay) || 1, 1), 28);
          const now = new Date();
          let dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
          if (dueDate < now) dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);

          await prisma.payment.create({
            data: {
              leaseId: lease.id,
              tenantId: tenant.id,
              amount: parseFloat(row.monthlyRent),
              dueDate,
              status: 'PENDING',
              description: `Rent — ${dueDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
            },
          });
          results.payments++;
        } catch (rowErr) {
          results.errors.push({ row: row._id, message: rowErr.message });
        }
      }
    }

    // ── Log import batch ───────────────────────────────────────────────────────
    await prisma.importBatch.create({
      data: { landlordId, rowCount: rows.filter((r) => r._valid).length, metadata: results },
    });

    await prisma.activityLog.create({
      data: {
        landlordId,
        type: 'IMPORT',
        title: 'Property import completed',
        description: `${results.properties} propert${results.properties !== 1 ? 'ies' : 'y'}, ${results.units} units, ${results.tenants} tenants imported`,
      },
    });

    res.json({ results });
  } catch (err) {
    next(err);
  }
};

module.exports = { getTemplate, parseSpreadsheet, aiExtract, preview, uploadDocuments, confirm };
