const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { UPLOADS_DIR, SERVED_FOLDERS } = require('../config/uploads');

/**
 * Whether the signed-in user may read one stored file. Each folder is scoped exactly
 * the way the controller that created the record scopes it, so a file is visible to
 * the same people who can already see the record it belongs to, and nobody else.
 */
async function canAccess(user, folder, file) {
  const landlordId = user.landlordProfile?.id;
  const tenantId = user.tenantProfile?.id;

  if (folder === 'maintenance') {
    // Photos are stored on the request as "/uploads/maintenance/<file>" paths.
    const where = { photos: { has: `/uploads/maintenance/${file}` } };
    if (user.role === 'LANDLORD' && landlordId) where.unit = { property: { landlordId } };
    else if (user.role === 'TENANT' && tenantId) where.tenantId = tenantId;
    else return false;
    return Boolean(await prisma.maintenanceRequest.findFirst({ where, select: { id: true } }));
  }

  if (folder === 'invoices') {
    // Vendor bills are the landlord's business; tenants never see them.
    if (user.role !== 'LANDLORD' || !landlordId) return false;
    return Boolean(await prisma.maintenanceInvoice.findFirst({
      where: { storedName: file, maintenanceRequest: { unit: { property: { landlordId } } } },
      select: { id: true },
    }));
  }

  if (folder === 'documents') {
    if (user.role !== 'LANDLORD' || !landlordId) return false;
    return Boolean(await prisma.uploadedDocument.findFirst({
      where: { storedName: file, landlordId },
      select: { id: true },
    }));
  }

  return false;
}

const notFound = (res) => res.status(404).json({ error: 'File not found' });

/**
 * GET /uploads/:folder/:file — replaces the old public express.static mount.
 *
 * A session and an ownership match are both required. Every refusal is a 404, never a
 * 403, so the response cannot confirm that a file exists. Stored names are random
 * UUIDs, which already defeats guessing; this makes a leaked or shared link useless
 * to anyone who is not entitled to the record.
 */
router.get('/:folder/:file', authenticate, async (req, res, next) => {
  try {
    const { folder } = req.params;
    const file = path.basename(req.params.file);

    // basename() strips any directory part a decoded "%2F" could smuggle in; a name
    // that changed under it, or that starts with a dot ("..", dotfiles), is refused.
    if (!SERVED_FOLDERS.includes(folder) || file !== req.params.file || file.startsWith('.')) {
      return notFound(res);
    }
    if (!(await canAccess(req.user, folder, file))) return notFound(res);

    const dir = path.join(UPLOADS_DIR, folder);
    const abs = path.join(dir, file);
    if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) return notFound(res);

    // Private: a shared cache must never hand one user's file to another.
    res.sendFile(abs, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
