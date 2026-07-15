const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getAll, getOne, create, update, approveWorkflow, cancelWorkflow } = require('../controllers/maintenanceController');
const { authenticate, requireLandlord, requireTenant } = require('../middleware/auth');

// ── Maintenance photo upload ──────────────────────────────────────────────────
const PHOTOS_DIR = path.join(__dirname, '../../uploads/maintenance');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

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
    else cb(new Error('Only image files (JPG, PNG, WEBP, HEIC) are allowed'));
  },
});

router.get('/', authenticate, getAll);
router.get('/:id', authenticate, getOne);
router.post('/', authenticate, requireTenant, photoUpload.array('photos', 8), create);
router.put('/:id', authenticate, requireLandlord, update);
router.post('/:id/approve-workflow', authenticate, requireLandlord, approveWorkflow);
router.post('/:id/cancel-workflow', authenticate, requireLandlord, cancelWorkflow);

module.exports = router;
