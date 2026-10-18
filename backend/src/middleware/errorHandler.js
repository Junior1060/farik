const multer = require('multer');

const errorHandler = (err, req, res, next) => {
  console.error(err);

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  // Multer's own limit errors carry no status, so without this a 12 MB photo would
  // surface as a generic 500 in production instead of telling the person what to fix.
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'That file is too large.'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Too many files were attached.'
        : 'The upload could not be processed.';
    return res.status(400).json({ error: message });
  }

  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'A record with this value already exists' });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  const status = err.status || 500;

  // Never let an unexpected server-side failure leak driver/provider/database
  // detail to a client. 4xx errors are ones we raised deliberately, so their
  // messages are safe to pass through; 5xx messages are not.
  if (status >= 500 && process.env.NODE_ENV === 'production') {
    return res.status(status).json({ error: 'Something went wrong on our end. Please try again.' });
  }

  res.status(status).json({ error: err.message || 'Internal server error' });
};

module.exports = errorHandler;
