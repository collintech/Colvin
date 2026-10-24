import { setTimeout as sleep } from 'node:timers/promises';
import { URL } from 'node:url';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

const PROVIDER_CODES = new Set([
  'validation_error',
  'missing_api_key',
  'restricted_api_key',
  'invalid_permission',
  'suspended_api_key',
  'rate_limit_exceeded',
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
  'application_error',
  'service_unavailable',
]);
const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function providerFailure(status, body) {
  const failure = { kind: 'http', httpStatus: status };
  if (PROVIDER_CODES.has(body?.name)) failure.providerCode = body.name;

  // Classify known messages without retaining recipients, keys, or raw response bodies.
  const message = typeof body?.message === 'string' ? body.message : '';
  if (/api key is invalid/i.test(message)) failure.reason = 'invalid_api_key';
  else if (/missing api key/i.test(message)) failure.reason = 'missing_api_key';
  else if (/api key is not active/i.test(message)) failure.reason = 'inactive_api_key';
  else if (/api key is suspended/i.test(message)) failure.reason = 'suspended_api_key';
  else if (/only send testing emails/i.test(message)) failure.reason = 'test_recipient_restricted';
  else if (/domain.*not verified/i.test(message)) failure.reason = 'sender_domain_unverified';
  return failure;
}

function networkFailure(error) {
  const failure = {
    kind: error?.name === 'TimeoutError' ? 'timeout' : 'network',
  };
  const code = error?.cause?.code ?? error?.code;
  if (NETWORK_CODES.has(code)) failure.networkCode = code;
  return failure;
}

function deliveryError(details) {
  return new AppError(503, 'EMAIL_DELIVERY_FAILED', 'Account email could not be delivered', {
    provider: 'resend',
    ...details,
  });
}

function actionUrl(purpose, token) {
  const path = purpose === 'password_reset' ? '/reset-password' : '/verify-email';
  const url = new URL(path, env.ACCOUNT_WEB_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

function messageFor(purpose, url) {
  if (purpose === 'password_reset') {
    return {
      subject: 'Reset your Colvin password',
      html: `<p>A password reset was requested for your Colvin account.</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    };
  }
  return {
    subject: 'Verify your Colvin email',
    html: `<p>Verify the email address for your Colvin account.</p><p><a href="${url}">Verify email</a></p>`,
  };
}

async function sendResendEmail({ email, message }) {
  const response = await globalThis.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: message.subject,
      html: message.html,
    }),
    signal: globalThis.AbortSignal.timeout(env.EMAIL_DELIVERY_TIMEOUT_MS),
  });

  if (response.ok) return;
  const body = await response.json().catch(() => null);
  const error = new Error(`Resend returned HTTP ${response.status}`);
  error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  error.deliveryFailure = providerFailure(response.status, body);
  throw error;
}

export async function deliverAccountAction({ email, purpose, token }) {
  if (env.EMAIL_PROVIDER === 'test') {
    if (env.NODE_ENV !== 'test') {
      throw new AppError(503, 'EMAIL_DELIVERY_NOT_CONFIGURED', 'Email delivery is not configured');
    }
    return { testToken: token };
  }

  const missing = ['RESEND_API_KEY', 'EMAIL_FROM'].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw deliveryError({ kind: 'configuration', missing, attempts: 0 });
  }

  const message = messageFor(purpose, actionUrl(purpose, token));
  let lastFailure;
  let attempts = 0;
  for (let attempt = 1; attempt <= env.EMAIL_DELIVERY_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    try {
      await sendResendEmail({ email, message });
      return { delivered: true };
    } catch (error) {
      lastFailure = error.deliveryFailure ?? networkFailure(error);
      if (error.retryable === false || attempt === env.EMAIL_DELIVERY_ATTEMPTS) break;
      await sleep(Math.min(250 * 2 ** (attempt - 1), 1000));
    }
  }

  throw deliveryError({ ...lastFailure, attempts });
}
