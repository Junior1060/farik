const errorHandler = (err, req, res, next) => {
  console.error(err);

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
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
