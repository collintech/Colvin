import { Buffer } from 'node:buffer';

import * as authService from '../services/auth.service.js';
import { recordAuthAudit } from '../services/auth-audit.service.js';
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
  try {
    const result = await authService.register(req.body);
    await recordAuthAudit({
      req,
      eventType: 'auth.register',
      outcome: 'success',
      userId: result.user.id,
      subject: req.body.email,
    });
    return sendAuthenticated(res, 201, result);
  } catch (error) {
    await recordAuthAudit({
      req,
      eventType: 'auth.register',
      outcome: 'failure',
      subject: req.body.email,
      metadata: { code: error.code ?? 'UNKNOWN' },
    });
    throw error;
  }
}

export async function login(req, res) {
  try {
    const result = await authService.login(req.body);
    await recordAuthAudit({
      req,
      eventType: 'auth.login',
      outcome: 'success',
      userId: result.user.id,
      subject: req.body.email,
    });
    return sendAuthenticated(res, 200, result);
  } catch (error) {
    await recordAuthAudit({
      req,
      eventType: 'auth.login',
      outcome: 'failure',
      subject: req.body.email,
      metadata: { code: error.code ?? 'UNKNOWN' },
    });
    throw error;
  }
}

export async function refresh(req, res) {
  const token = readRefreshCookie(req);
  if (!token) {
    clearRefreshCookie(res);
    await recordAuthAudit({
      req,
      eventType: 'auth.refresh',
      outcome: 'failure',
      metadata: { code: 'REFRESH_REQUIRED' },
    });
    return res.status(401).json({
      success: false,
      error: { code: 'REFRESH_REQUIRED', message: 'Refresh session is required' },
      requestId: req.id,
    });
  }

  try {
    const result = await authService.refresh(token);
    await recordAuthAudit({
      req,
      eventType: 'auth.refresh',
      outcome: 'success',
      userId: result.user.id,
    });
    return sendAuthenticated(res, 200, result);
  } catch (error) {
    clearRefreshCookie(res);
    await recordAuthAudit({
      req,
      eventType: 'auth.refresh',
      outcome: 'failure',
      metadata: { code: error.code ?? 'UNKNOWN' },
    });
    throw error;
  }
}

export async function logout(req, res) {
  await authService.logout(readRefreshCookie(req));
  await recordAuthAudit({ req, eventType: 'auth.logout', outcome: 'success' });
  clearRefreshCookie(res);
  return res.status(204).send();
}

export async function logoutAll(req, res) {
  await authService.logoutAll(req.user.id);
  await recordAuthAudit({
    req,
    eventType: 'auth.logout_all',
    outcome: 'success',
    userId: req.user.id,
  });
  clearRefreshCookie(res);
  return res.status(204).send();
}

export async function me(req, res) {
  return res.json({ success: true, data: { user: await authService.getCurrentUser(req.user.id) } });
}
