import { setTimeout as sleep } from 'node:timers/promises';
import { URL } from 'node:url';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

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
  const error = new Error(`Resend returned HTTP ${response.status}`);
  error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  throw error;
}

export async function deliverAccountAction({ email, purpose, token }) {
  if (env.EMAIL_PROVIDER === 'test') {
    if (env.NODE_ENV !== 'test') {
      throw new AppError(503, 'EMAIL_DELIVERY_NOT_CONFIGURED', 'Email delivery is not configured');
    }
    return { testToken: token };
  }

  const message = messageFor(purpose, actionUrl(purpose, token));
  for (let attempt = 1; attempt <= env.EMAIL_DELIVERY_ATTEMPTS; attempt += 1) {
    try {
      await sendResendEmail({ email, message });
      return { delivered: true };
    } catch (error) {
      if (error.retryable === false || attempt === env.EMAIL_DELIVERY_ATTEMPTS) break;
      await sleep(Math.min(250 * 2 ** (attempt - 1), 1000));
    }
  }

  throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'Account email could not be delivered');
}
