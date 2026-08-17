import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

const ISSUER = 'colvin-api';
const WEB_AUDIENCE = 'colvin-web';

export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: ISSUER,
    audience: WEB_AUDIENCE,
  });

export const signRefreshToken = (user) =>
  jwt.sign({ sub: user.id, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
    issuer: ISSUER,
    audience: WEB_AUDIENCE,
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: ISSUER,
    audience: WEB_AUDIENCE,
  });

export const verifyRefreshToken = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: ISSUER,
    audience: WEB_AUDIENCE,
  });
