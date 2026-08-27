import { AppError } from '../errors/AppError.js';

export function authorizeRoles(...roles) {
  const allowed = new Set(roles);

  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
    }
    if (!allowed.has(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action'));
    }
    return next();
  };
}
