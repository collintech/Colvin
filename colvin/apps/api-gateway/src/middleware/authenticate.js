import { AppError } from '../errors/AppError.js';
import { verifyAccessToken } from '../utils/tokens.js';
export function authenticate(req, _res, next) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer '))
    return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired'));
  }
}
