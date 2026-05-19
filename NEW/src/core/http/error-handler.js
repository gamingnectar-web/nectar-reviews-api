function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.statusCode || error.status || 500;
  const payload = {
    error: error.publicMessage || error.message || 'Internal server error'
  };
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = error.stack;
  }
  console.error('API error:', error);
  res.status(status).json(payload);
}

module.exports = { notFoundHandler, errorHandler };
