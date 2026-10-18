const path = require('path');
const fs = require('fs');

// Every uploaded file lives under one base directory so a deployment can point
// UPLOADS_DIR at a persistent disk. Render's default filesystem is wiped on every
// deploy, so without a mounted disk every photo, invoice and lease document a
// landlord uploads is lost at the next release. Defaults to <backend>/uploads for
// local development.
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');

// Folders whose files are kept and served back to signed-in users (routes/uploads.js).
// Anything else under UPLOADS_DIR ("spreadsheets", "onboarding") is a temp file the
// import wizard deletes as soon as it has been parsed, and is never served.
const SERVED_FOLDERS = ['maintenance', 'invoices', 'documents'];

/** Absolute path of one upload folder, created on first use. */
function uploadDir(folder) {
  const dir = path.join(UPLOADS_DIR, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { UPLOADS_DIR, SERVED_FOLDERS, uploadDir };
