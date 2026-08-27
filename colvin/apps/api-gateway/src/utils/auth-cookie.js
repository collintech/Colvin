import { env } from '../config/env.js';

export const REFRESH_COOKIE_NAME =
  env.NODE_ENV === 'production' ? '__Host-colvin_refresh' : 'colvin_refresh';

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

export function setRefreshCookie(res, token, maxAgeSeconds) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: maxAgeSeconds,
    }),
  );
}

export function clearRefreshCookie(res) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(REFRESH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 0,
    }),
  );
}

export function readRefreshCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const segment of header.split(';')) {
    const [rawName, ...rawValue] = segment.trim().split('=');
    if (rawName === REFRESH_COOKIE_NAME) {
      try {
        return decodeURIComponent(rawValue.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}
