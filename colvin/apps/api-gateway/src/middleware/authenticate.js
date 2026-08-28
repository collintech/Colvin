import { AppError } from '../errors/AppError.js';
import { findUserById } from '../repositories/user.repository.js';
import { verifyAccessToken } from '../utils/tokens.js';

export async function authenticate(req, _res, next) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = await findUserById(payload.sub);
    if (!user || Number(payload.av) !== Number(user.auth_version)) {
      return next(new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired'));
    }

    req.user = { id: user.id, role: user.role, authVersion: user.auth_version };
    return next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired'));
  }
}
