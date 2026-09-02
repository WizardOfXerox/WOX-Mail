import pino from 'pino';

const logger = pino({ name: 'woxmail' });

/**
 * Global error handler middleware.
 * Logs errors with pino and returns sanitized JSON responses.
 * Must be registered LAST in the middleware chain.
 */
export function errorHandler(err, req, res, _next) {
  // Default to 500 if no status set
  const status = err.status || err.statusCode || 500;

  // Log server errors with full details, client errors with minimal info
  if (status >= 500) {
    logger.error({
      err,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userId: req.userId || null,
    }, 'Server error');
  } else {
    logger.warn({
      status,
      message: err.message,
      method: req.method,
      url: req.originalUrl,
    }, 'Client error');
  }

  // Never leak stack traces or internal details in production
  const response = {
    error: status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error',
  };

  if (err.code) {
    response.code = err.code;
  }

  // Include validation details if present
  if (err.details) {
    response.details = err.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && status >= 500) {
    response.stack = err.stack;
  }

  res.status(status).json(response);
}

/**
 * 404 handler for unmatched routes.
 * Must be registered AFTER all routes but BEFORE errorHandler.
 */
export function notFoundHandler(req, res) {
  // If the request accepts HTML (browser navigation), render 404 page
  if (req.accepts('html')) {
    return res.status(404).render('404', { title: '404 — Not Found' });
  }

  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}
