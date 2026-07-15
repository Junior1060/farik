const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate, requireLandlord } = require('../middleware/auth');
const ctrl = require('../controllers/invoiceController');

const INVOICES_DIR = path.join(__dirname, '../../uploads/invoices');
if (!fs.existsSync(INVOICES_DIR)) fs.mkdirSync(INVOICES_DIR, { recursive: true });

const invoiceStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, INVOICES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const invoiceUpload = multer({
  storage: invoiceStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF, JPG, PNG, or WEBP invoice files are allowed'));
  },
});

router.use(authenticate, requireLandlord);

router.get('/maintenance-request/:maintenanceRequestId', ctrl.getForRequest);
router.post('/', invoiceUpload.single('invoice'), ctrl.upload);
router.post('/:id/approve', ctrl.approve);
router.post('/:id/reject', ctrl.reject);

module.exports = router;
