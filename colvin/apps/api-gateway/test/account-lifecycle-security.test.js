import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.WEB_ORIGIN = 'http://localhost:5173';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/colvin_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-01234567890123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-012345678901234567';
process.env.INTERNAL_API_KEY = 'test-internal-key-01234567890123456789';
process.env.VIN_DECODER_URL = 'http://localhost:8081';
process.env.HISTORY_SERVICE_URL = 'http://localhost:8082';
process.env.LOG_LEVEL = 'silent';
process.env.EMAIL_PROVIDER = 'test';

const { changePasswordSchema, passwordResetConfirmSchema } =
  await import('../src/validators/auth.schemas.js');
const { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } =
  await import('../src/utils/tokens.js');

test('credential schemas enforce the bcrypt 72-byte boundary', () => {
  const valid = changePasswordSchema.safeParse({
    body: { currentPassword: 'current-password', newPassword: 'a'.repeat(72) },
  });
  assert.equal(valid.success, true);

  const oversized = passwordResetConfirmSchema.safeParse({
    body: { token: 't'.repeat(43), newPassword: 'é'.repeat(40) },
  });
  assert.equal(oversized.success, false);
});

test('access and refresh JWTs carry the account auth version', () => {
  const user = { id: '00000000-0000-4000-8000-000000000001', role: 'user', auth_version: 7 };
  const access = verifyAccessToken(signAccessToken(user));
  const refresh = verifyRefreshToken(signRefreshToken(user));

  assert.equal(access.av, 7);
  assert.equal(refresh.av, 7);
});
