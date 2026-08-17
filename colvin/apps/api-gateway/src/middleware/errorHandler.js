import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';

export function notFound(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} was not found`));
}

export function errorHandler(error, req, res, _next) {
  const status = error.statusCode ?? 500;

  if (status >= 500) {
    logger.error({ error, requestId: req.id }, 'Unhandled request error');
  }

  res.status(status).json({
    success: false,
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: status >= 500 ? 'An unexpected error occurred' : error.message,
      ...(error.details ? { details: error.details } : {}),
    },
    requestId: req.id,
  });
}
