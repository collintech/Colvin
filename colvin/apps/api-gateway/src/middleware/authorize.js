import { PERMISSIONS, roleHasPermission } from '../authz/policy.js';
import { AppError } from '../errors/AppError.js';

export { PERMISSIONS };

export function authorizePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
    }
    if (!roleHasPermission(req.user.role, permission)) {
      return next(new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action'));
    }
    return next();
  };
}

// Compatibility helper for routes that still need direct role checks. New code
// should prefer permission-based authorization from the central policy map.
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
