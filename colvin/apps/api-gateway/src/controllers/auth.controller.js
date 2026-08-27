import { Buffer } from 'node:buffer';

import * as authService from '../services/auth.service.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../utils/auth-cookie.js';

function cookieMaxAgeSeconds(refreshToken) {
  const [, payload] = refreshToken.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
}

function sendAuthenticated(res, status, result) {
  setRefreshCookie(res, result.refreshToken, cookieMaxAgeSeconds(result.refreshToken));
  return res.status(status).json({
    success: true,
    data: { user: result.user, accessToken: result.accessToken },
  });
}

export async function register(req, res) {
  return sendAuthenticated(res, 201, await authService.register(req.body));
}

export async function login(req, res) {
  return sendAuthenticated(res, 200, await authService.login(req.body));
}

export async function refresh(req, res) {
  const token = readRefreshCookie(req);
  if (!token) {
    clearRefreshCookie(res);
    return res.status(401).json({
      success: false,
      error: { code: 'REFRESH_REQUIRED', message: 'Refresh session is required' },
      requestId: req.id,
    });
  }

  try {
    return sendAuthenticated(res, 200, await authService.refresh(token));
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
}

export async function logout(req, res) {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  return res.status(204).send();
}

export async function logoutAll(req, res) {
  await authService.logoutAll(req.user.id);
  clearRefreshCookie(res);
  return res.status(204).send();
}

export async function me(req, res) {
  return res.json({ success: true, data: { user: await authService.getCurrentUser(req.user.id) } });
}
