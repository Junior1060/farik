const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { authenticate, requireLandlord } = require('../middleware/auth');
const { costSensitiveLimiter } = require('../middleware/rateLimiter');
const { uploadDir } = require('../config/uploads');
const ctrl = require('../controllers/importController');

const router = express.Router();

// Spreadsheets and AI-ingest files are temp files, deleted by the controller as soon
// as they are parsed. Documents (lease PDFs etc.) are kept and served back to the
// landlord who uploaded them through routes/uploads.js.
const ONBOARDING_DIR = uploadDir('onboarding');
const SPREADSHEETS_DIR = uploadDir('spreadsheets');
const DOCUMENTS_DIR = uploadDir('documents');

const randomName = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, `${crypto.randomUUID()}${ext}`);
};

// ── Universal AI ingest upload (any single file, or text-only) ────────────────
const onboardingUpload = multer({
  storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, ONBOARDING_DIR), filename: randomName }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.docx', '.doc'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(Object.assign(new Error('Please upload a spreadsheet, Word document, PDF, or image (or paste your data as text).'), { status: 400 }));
  },
});

// ── Spreadsheet upload (single file) ──────────────────────────────────────────
const spreadsheetUpload = multer({
  storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, SPREADSHEETS_DIR), filename: randomName }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(Object.assign(new Error('Only .xlsx, .xls, and .csv files are allowed'), { status: 400 }));
  },
});

// ── Document upload (multiple files) ──────────────────────────────────────────
const documentUpload = multer({
  storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, DOCUMENTS_DIR), filename: randomName }),
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
  costSensitiveLimiter,
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
