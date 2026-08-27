import { URL } from 'node:url';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireTrustedOrigin(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    return next(new AppError(403, 'UNTRUSTED_ORIGIN', 'Request origin is not trusted'));
  }

  const origin = req.get('origin');
  if (origin && origin !== env.WEB_ORIGIN) {
    return next(new AppError(403, 'UNTRUSTED_ORIGIN', 'Request origin is not trusted'));
  }

  const referer = req.get('referer');
  if (!origin && !referer && !fetchSite && env.NODE_ENV === 'production') {
    return next(new AppError(403, 'UNTRUSTED_ORIGIN', 'Request origin is not trusted'));
  }
  if (!origin && referer) {
    try {
      if (new URL(referer).origin !== env.WEB_ORIGIN) {
        return next(new AppError(403, 'UNTRUSTED_ORIGIN', 'Request origin is not trusted'));
      }
    } catch {
      return next(new AppError(403, 'UNTRUSTED_ORIGIN', 'Request origin is not trusted'));
    }
  }

  return next();
}
