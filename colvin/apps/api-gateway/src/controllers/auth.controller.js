import { Buffer } from 'node:buffer';

import * as authService from '../services/auth.service.js';
import * as accountLifecycle from '../services/account-lifecycle.service.js';
import { recordAuthAudit } from '../services/auth-audit.service.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../utils/auth-cookie.js';

function cookieMaxAgeSeconds(refreshToken) {
  const [, payload] = refreshToken.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
}

function sendAuthenticated(res, status, result) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
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
    if (error.code !== 'REFRESH_ALREADY_ROTATED') clearRefreshCookie(res);
    await recordAuthAudit({
      req,
      eventType: 'auth.refresh',
      outcome: 'failure',
      metadata: {
        code: error.code ?? 'UNKNOWN',
        ...(error.code === 'REFRESH_ALREADY_ROTATED' ? { recoverableRace: true } : {}),
      },
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

export async function changePassword(req, res) {
  try {
    await accountLifecycle.changePassword(req.user.id, req.body);
    await recordAuthAudit({
      req,
      eventType: 'auth.password.change',
      outcome: 'success',
      userId: req.user.id,
    });
    clearRefreshCookie(res);
    return res.status(204).send();
  } catch (error) {
    await recordAuthAudit({
      req,
      eventType: 'auth.password.change',
      outcome: 'failure',
      userId: req.user.id,
      metadata: { code: error.code ?? 'UNKNOWN' },
    });
    throw error;
  }
}

export async function requestPasswordReset(req, res) {
  const result = await accountLifecycle.requestPasswordReset(req.body.email);
  await recordAuthAudit({
    req,
    eventType: 'auth.password_reset.request',
    outcome: result.deliveryFailed ? 'failure' : 'success',
    userId: result.userId,
    subject: req.body.email,
    metadata: result.deliveryFailed ? { code: 'EMAIL_DELIVERY_FAILED' } : undefined,
  });
  const data = { accepted: true };
  if (result.token) data.testToken = result.token;
  return res.status(202).json({ success: true, data });
}

export async function resetPassword(req, res) {
  try {
    const result = await accountLifecycle.resetPassword(req.body);
    await recordAuthAudit({
      req,
      eventType: 'auth.password_reset.complete',
      outcome: 'success',
      userId: result.userId,
    });
    clearRefreshCookie(res);
    return res.status(204).send();
  } catch (error) {
    await recordAuthAudit({
      req,
      eventType: 'auth.password_reset.complete',
      outcome: 'failure',
      metadata: { code: error.code ?? 'UNKNOWN' },
    });
    throw error;
  }
}

export async function requestEmailVerification(req, res) {
  try {
    const result = await accountLifecycle.requestEmailVerification(req.user.id);
    await recordAuthAudit({
      req,
      eventType: 'auth.email_verification.request',
      outcome: 'success',
      userId: req.user.id,
    });
    const data = { accepted: true, alreadyVerified: result.alreadyVerified };
    if (result.token) data.testToken = result.token;
    return res.status(202).json({ success: true, data });
  } catch (error) {
    await recordAuthAudit({
      req,
      eventType: 'auth.email_verification.request',
      outcome: 'failure',
      userId: req.user.id,
      metadata: { code: error.code ?? 'UNKNOWN' },
    });
    throw error;
  }
}

export async function verifyEmail(req, res) {
  try {
    const result = await accountLifecycle.verifyEmail(req.body.token);
    await recordAuthAudit({
      req,
      eventType: 'auth.email_verification.complete',
      outcome: 'success',
      userId: result.userId,
    });
    return res.status(204).send();
  } catch (error) {
    await recordAuthAudit({
      req,
      eventType: 'auth.email_verification.complete',
      outcome: 'failure',
      metadata: { code: error.code ?? 'UNKNOWN' },
    });
    throw error;
  }
}
