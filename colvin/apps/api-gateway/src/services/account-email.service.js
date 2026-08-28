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

export async function deliverAccountAction({ email, purpose, token }) {
  if (env.EMAIL_PROVIDER === 'test') {
    if (env.NODE_ENV !== 'test') {
      throw new AppError(503, 'EMAIL_DELIVERY_NOT_CONFIGURED', 'Email delivery is not configured');
    }
    return { testToken: token };
  }

  const url = actionUrl(purpose, token);
  const message = messageFor(purpose, url);
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
    signal: globalThis.AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'Account email could not be delivered');
  }

  return { delivered: true };
}
