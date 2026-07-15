const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate, requireLandlord } = require('../middleware/auth');
const ctrl = require('../controllers/importController');

const router = express.Router();

const UPLOADS_BASE = path.join(__dirname, '../../uploads');

// Ensure upload subdirs exist
['spreadsheets', 'documents', 'onboarding'].forEach((sub) => {
  const dir = path.join(UPLOADS_BASE, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Universal AI ingest upload (any single file, or text-only) ────────────────
const onboardingStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOADS_BASE, 'onboarding')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const onboardingUpload = multer({
  storage: onboardingStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.docx', '.doc'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(Object.assign(new Error('Please upload a spreadsheet, Word document, PDF, or image (or paste your data as text).'), { status: 400 }));
  },
});

// ── Spreadsheet upload (single file) ──────────────────────────────────────────
const spreadsheetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOADS_BASE, 'spreadsheets')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const spreadsheetUpload = multer({
  storage: spreadsheetStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(Object.assign(new Error('Only .xlsx, .xls, and .csv files are allowed'), { status: 400 }));
  },
});

// ── Document upload (multiple files) ──────────────────────────────────────────
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOADS_BASE, 'documents')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(Object.assign(new Error('Only PDF, DOCX, and image files are allowed'), { status: 400 }));
  },
});

// ── Routes ────────────────────────────────────────────────────────────────────
router.get('/template', authenticate, requireLandlord, ctrl.getTemplate);

router.post(
  '/spreadsheet',
  authenticate,
  requireLandlord,
  spreadsheetUpload.single('file'),
  ctrl.parseSpreadsheet,
);

router.post(
  '/ai',
  authenticate,
  requireLandlord,
  onboardingUpload.single('file'),
  ctrl.aiExtract,
);

router.post('/preview', authenticate, requireLandlord, ctrl.preview);

router.post(
  '/documents',
  authenticate,
  requireLandlord,
  documentUpload.array('files', 30),
  ctrl.uploadDocuments,
);

router.post('/confirm', authenticate, requireLandlord, ctrl.confirm);

module.exports = router;
