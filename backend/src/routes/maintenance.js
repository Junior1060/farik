const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { getAll, getOne, create, update, approveWorkflow, cancelWorkflow } = require('../controllers/maintenanceController');
const { authenticate, requireLandlord, requireTenant } = require('../middleware/auth');
const { perUserCostLimiter } = require('../middleware/rateLimiter');
const { uploadDir } = require('../config/uploads');

// ── Maintenance photo upload ──────────────────────────────────────────────────
const PHOTOS_DIR = uploadDir('maintenance');

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(Object.assign(new Error('Only image files (JPG, PNG, WEBP, HEIC) are allowed'), { status: 400 }));
  },
});

router.get('/', authenticate, getAll);
router.get('/:id', authenticate, getOne);
// A new request can start AI triage and vendor texts, so it is capped per tenant.
router.post('/', authenticate, requireTenant, perUserCostLimiter, photoUpload.array('photos', 8), create);
router.put('/:id', authenticate, requireLandlord, update);
router.post('/:id/approve-workflow', authenticate, requireLandlord, approveWorkflow);
router.post('/:id/cancel-workflow', authenticate, requireLandlord, cancelWorkflow);

module.exports = router;
