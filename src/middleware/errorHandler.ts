import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.path} not found`, { status: 404, code: 'ROUTE_NOT_FOUND' }));
};

/** Our own AppErrors keep their status/code; anything unexpected is hidden behind a generic 500. */
function normalize(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError('An unexpected error occurred', { status: 500, code: 'INTERNAL_ERROR' });
}

/**
 * Every error leaves the API in the same shape: { error: { code, message, details?, requestId } }.
 * Stack traces are logged, never sent to the client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalize(err);

  if (appError.status >= 500) req.log.error({ err }, appError.message);
  else req.log.warn({ code: appError.code }, appError.message);

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details && { details: appError.details }),
      requestId: req.id,
    },
  });
};
