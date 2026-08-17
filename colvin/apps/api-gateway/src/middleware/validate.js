import { AppError } from '../errors/AppError.js';

export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!result.success) {
    return next(
      new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', result.error.flatten()),
    );
  }

  Object.assign(req, result.data);
  next();
};
