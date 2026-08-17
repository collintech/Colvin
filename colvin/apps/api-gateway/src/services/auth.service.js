import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import {
  createUser,
  findRefreshToken,
  findUserByEmail,
  findUserById,
  revokeRefreshToken,
  saveRefreshToken,
} from '../repositories/user.repository.js';
import { sha256 } from '../utils/hash.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';

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

async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await saveRefreshToken({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt: refreshTokenExpiry(refreshToken),
  });

  return { accessToken, refreshToken };
}

export async function register(input) {
  if (await findUserByEmail(input.email)) {
    throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email');
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const user = await createUser({ email: input.email, passwordHash });
  return { user, ...(await issueTokens(user)) };
}

export async function login(input) {
  const record = await findUserByEmail(input.email);
  const authenticated = record && (await bcrypt.compare(input.password, record.password_hash));

  if (!authenticated) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  const user = {
    id: record.id,
    email: record.email,
    role: record.role,
    created_at: record.created_at,
  };

  return { user, ...(await issueTokens(user)) };
}

export async function refresh(refreshToken) {
  let payload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  if (payload.type !== 'refresh') {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  const tokenHash = sha256(refreshToken);
  const stored = await findRefreshToken(tokenHash);

  if (!stored || stored.revoked_at || new Date(stored.expires_at) <= new Date()) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  await revokeRefreshToken(tokenHash);

  const user = await findUserById(payload.sub);
  if (!user) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token user no longer exists');
  }

  return { user, ...(await issueTokens(user)) };
}

export async function logout(refreshToken) {
  await revokeRefreshToken(sha256(refreshToken));
}
