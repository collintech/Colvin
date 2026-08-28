import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import bcrypt from 'bcryptjs';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { pool } from '../database/postgres.js';
import { withTransaction } from '../database/transaction.js';
import { AppError } from '../errors/AppError.js';
import {
  createAccountActionToken,
  revokeActiveAccountActionTokens,
  findAccountActionTokenForUpdate,
  markAccountActionTokenUsed,
} from '../repositories/account-action.repository.js';
import {
  changeUserPassword,
  findUserAuthRecordByEmail,
  findUserAuthRecordById,
  markUserEmailVerified,
  revokeAllUserRefreshTokens,
} from '../repositories/user.repository.js';
import { sha256 } from '../utils/hash.js';
import { deliverAccountAction } from './account-email.service.js';
import { assertPasswordNotCompromised } from './password-security.service.js';

const PASSWORD_RESET_PURPOSE = 'password_reset';
const EMAIL_VERIFY_PURPOSE = 'email_verify';

function expiryFromNow(amount, unitMs) {
  return new Date(Date.now() + amount * unitMs);
}

function newOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function issueActionToken({ userId, purpose, expiresAt }) {
  const token = newOpaqueToken();
  await createAccountActionToken({
    userId,
    purpose,
    tokenHash: sha256(token),
    expiresAt,
  });
  return token;
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const record = await findUserAuthRecordById(userId);
  if (!record || !(await bcrypt.compare(currentPassword, record.password_hash))) {
    throw new AppError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
  }

  if (await bcrypt.compare(newPassword, record.password_hash)) {
    throw new AppError(400, 'PASSWORD_REUSE', 'New password must differ from the current password');
  }

  await assertPasswordNotCompromised(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await withTransaction(pool, async (client) => {
    await changeUserPassword(userId, passwordHash, client);
    await revokeAllUserRefreshTokens(userId, client);
    await revokeActiveAccountActionTokens(userId, PASSWORD_RESET_PURPOSE, client);
  });
}

export async function requestPasswordReset(email) {
  const startedAt = Date.now();
  let result = { accepted: true, token: null, userId: null, deliveryFailed: false };

  try {
    const record = await findUserAuthRecordByEmail(email);
    if (record) {
      const token = await issueActionToken({
        userId: record.id,
        purpose: PASSWORD_RESET_PURPOSE,
        expiresAt: expiryFromNow(env.PASSWORD_RESET_TTL_MINUTES, 60_000),
      });

      try {
        const delivery = await deliverAccountAction({
          email: record.email,
          purpose: PASSWORD_RESET_PURPOSE,
          token,
        });
        result = {
          accepted: true,
          token: delivery.testToken ?? null,
          userId: record.id,
          deliveryFailed: false,
        };
      } catch (error) {
        await revokeActiveAccountActionTokens(record.id, PASSWORD_RESET_PURPOSE).catch(() => {});
        logger.error({ error, userId: record.id }, 'Password reset delivery failed');
        result = { accepted: true, token: null, userId: record.id, deliveryFailed: true };
      }
    }
  } finally {
    const remaining = env.PASSWORD_RESET_MIN_RESPONSE_MS - (Date.now() - startedAt);
    if (remaining > 0) await sleep(remaining);
  }

  return result;
}

export async function resetPassword({ token, newPassword }) {
  await assertPasswordNotCompromised(newPassword);
  const tokenHash = sha256(token);

  const outcome = await withTransaction(pool, async (client) => {
    const stored = await findAccountActionTokenForUpdate(tokenHash, PASSWORD_RESET_PURPOSE, client);

    if (!stored || stored.used_at || new Date(stored.expires_at) <= new Date()) {
      return { error: 'INVALID_ACCOUNT_TOKEN' };
    }

    const user = await findUserAuthRecordById(stored.user_id, client);
    if (!user) return { error: 'INVALID_ACCOUNT_TOKEN' };

    if (await bcrypt.compare(newPassword, user.password_hash)) {
      return { error: 'PASSWORD_REUSE' };
    }

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    await changeUserPassword(user.id, passwordHash, client);
    await revokeAllUserRefreshTokens(user.id, client);
    await markAccountActionTokenUsed(stored.id, client);
    return { userId: user.id };
  });

  if (outcome.error === 'PASSWORD_REUSE') {
    throw new AppError(400, 'PASSWORD_REUSE', 'New password must differ from the current password');
  }
  if (outcome.error) {
    throw new AppError(400, 'INVALID_ACCOUNT_TOKEN', 'Account action token is invalid or expired');
  }
  return outcome;
}

export async function requestEmailVerification(userId) {
  const record = await findUserAuthRecordById(userId);
  if (!record) throw new AppError(404, 'USER_NOT_FOUND', 'User no longer exists');
  if (record.email_verified_at) return { accepted: true, token: null, alreadyVerified: true };

  const token = await issueActionToken({
    userId,
    purpose: EMAIL_VERIFY_PURPOSE,
    expiresAt: expiryFromNow(env.EMAIL_VERIFY_TTL_HOURS, 3_600_000),
  });
  try {
    const delivery = await deliverAccountAction({
      email: record.email,
      purpose: EMAIL_VERIFY_PURPOSE,
      token,
    });
    return { accepted: true, token: delivery.testToken ?? null, alreadyVerified: false };
  } catch (error) {
    await revokeActiveAccountActionTokens(userId, EMAIL_VERIFY_PURPOSE).catch(() => {});
    throw error;
  }
}

export async function verifyEmail(token) {
  const tokenHash = sha256(token);
  const outcome = await withTransaction(pool, async (client) => {
    const stored = await findAccountActionTokenForUpdate(tokenHash, EMAIL_VERIFY_PURPOSE, client);
    if (!stored || stored.used_at || new Date(stored.expires_at) <= new Date()) {
      return { error: 'INVALID_ACCOUNT_TOKEN' };
    }

    await markUserEmailVerified(stored.user_id, client);
    await markAccountActionTokenUsed(stored.id, client);
    return { userId: stored.user_id };
  });

  if (outcome.error) {
    throw new AppError(400, 'INVALID_ACCOUNT_TOKEN', 'Account action token is invalid or expired');
  }
  return outcome;
}
