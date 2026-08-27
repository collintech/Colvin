import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { pool } from '../database/postgres.js';
import { withTransaction } from '../database/transaction.js';
import { AppError } from '../errors/AppError.js';
import {
  createUser,
  findRefreshTokenForUpdate,
  findUserByEmail,
  findUserById,
  revokeAllUserRefreshTokens,
  revokeRefreshFamily,
  rotateRefreshToken,
  saveRefreshToken,
} from '../repositories/user.repository.js';
import { sha256 } from '../utils/hash.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';

const DUMMY_PASSWORD_HASH = '$2b$12$6mYJm7v5F6XgS6Rj1f4FkeSx7QqL0XWQ1fd2xXfFB0uRHWJKlC2sK';

function refreshTokenExpiry(refreshToken) {
  const payload = jwt.decode(refreshToken);
  if (!payload || typeof payload === 'string' || !payload.exp) {
    throw new AppError(
      500,
      'TOKEN_CONFIGURATION_ERROR',
      'Refresh token expiry could not be determined',
    );
  }
  return new Date(payload.exp * 1000);
}

function publicUser(record) {
  return {
    id: record.id,
    email: record.email,
    role: record.role,
    created_at: record.created_at,
  };
}

function createTokenPair(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

async function issueInitialTokens(user, executor) {
  const tokens = createTokenPair(user);
  await saveRefreshToken(
    {
      userId: user.id,
      tokenHash: sha256(tokens.refreshToken),
      expiresAt: refreshTokenExpiry(tokens.refreshToken),
      familyId: crypto.randomUUID(),
    },
    executor,
  );
  return tokens;
}

export async function register(input) {
  if (await findUserByEmail(input.email)) {
    throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email');
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const user = await createUser({ email: input.email, passwordHash });
  return { user, ...(await issueInitialTokens(user)) };
}

export async function login(input) {
  const record = await findUserByEmail(input.email);
  const passwordHash = record?.password_hash ?? DUMMY_PASSWORD_HASH;
  const passwordMatches = await bcrypt.compare(input.password, passwordHash).catch(() => false);

  if (!record || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  const user = publicUser(record);
  return { user, ...(await issueInitialTokens(user)) };
}

export async function refresh(refreshToken) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  if (payload.type !== 'refresh' || !payload.sub) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  const tokenHash = sha256(refreshToken);

  const outcome = await withTransaction(pool, async (client) => {
    const stored = await findRefreshTokenForUpdate(tokenHash, client);

    if (!stored) return { error: 'INVALID_REFRESH_TOKEN' };

    if (stored.revoked_at) {
      await revokeRefreshFamily(stored.family_id, client);
      return { error: 'REFRESH_TOKEN_REUSED' };
    }

    if (new Date(stored.expires_at) <= new Date() || stored.user_id !== payload.sub) {
      await revokeRefreshFamily(stored.family_id, client);
      return { error: 'INVALID_REFRESH_TOKEN' };
    }

    const user = await findUserById(payload.sub, client);
    if (!user) {
      await revokeRefreshFamily(stored.family_id, client);
      return { error: 'INVALID_REFRESH_TOKEN' };
    }

    const tokens = createTokenPair(user);
    await rotateRefreshToken(
      {
        tokenHash,
        replacementHash: sha256(tokens.refreshToken),
        replacementExpiresAt: refreshTokenExpiry(tokens.refreshToken),
        userId: user.id,
        familyId: stored.family_id,
      },
      client,
    );

    return { user, ...tokens };
  });

  if (outcome.error === 'REFRESH_TOKEN_REUSED') {
    throw new AppError(401, 'REFRESH_TOKEN_REUSED', 'Session is no longer valid');
  }
  if (outcome.error) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  return outcome;
}

export async function logout(refreshToken) {
  if (!refreshToken) return;

  const tokenHash = sha256(refreshToken);
  await withTransaction(pool, async (client) => {
    const stored = await findRefreshTokenForUpdate(tokenHash, client);
    if (stored) await revokeRefreshFamily(stored.family_id, client);
  });
}

export async function logoutAll(userId) {
  await revokeAllUserRefreshTokens(userId);
}

export async function getCurrentUser(userId) {
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User no longer exists');
  return user;
}
