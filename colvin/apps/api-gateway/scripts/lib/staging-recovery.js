import process from 'node:process';

export class RecoveryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecoveryError';
  }
}

export function assertStagingTarget(runtime, target) {
  if (
    runtime.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
    runtime.RAILWAY_SERVICE_NAME !== 'api-gateway' ||
    !runtime.RAILWAY_DEPLOYMENT_ID ||
    !target.projectId ||
    !target.environmentId ||
    !target.serviceId ||
    runtime.RAILWAY_PROJECT_ID !== target.projectId ||
    runtime.RAILWAY_ENVIRONMENT_ID !== target.environmentId ||
    runtime.RAILWAY_SERVICE_ID !== target.serviceId
  ) {
    throw new RecoveryError(
      'Recovery requires the deployed staging api-gateway and matching project, environment and service IDs.',
    );
  }
}

// Loaded only after the CLI has checked the target and interactive terminal.
export async function openStagingRecovery(target) {
  assertStagingTarget(process.env, target);
  const [
    database,
    transaction,
    users,
    actions,
    audit,
    authAudit,
    security,
    validators,
    config,
    bcryptModule,
  ] = await Promise.all([
    import('../../src/database/postgres.js'),
    import('../../src/database/transaction.js'),
    import('../../src/repositories/user.repository.js'),
    import('../../src/repositories/account-action.repository.js'),
    import('../../src/repositories/auth-audit.repository.js'),
    import('../../src/services/auth-audit.service.js'),
    import('../../src/services/password-security.service.js'),
    import('../../src/validators/auth.schemas.js'),
    import('../../src/config/env.js'),
    import('bcryptjs'),
  ]);
  const bcrypt = bcryptModule.default;
  const { pool } = database;

  return {
    async findAccount(email) {
      const parsed = validators.registerSchema.shape.body.shape.email.safeParse(email);
      if (!parsed.success) throw new RecoveryError('Enter a valid account email.');
      const record = await users.findUserAuthRecordByEmail(parsed.data);
      if (!record) {
        throw new RecoveryError('Account not found in this staging database. No changes made.');
      }
      return { id: record.id, email: record.email, authVersion: record.auth_version };
    },

    async resetPassword({ userId, email, newPassword }) {
      assertStagingTarget(process.env, target);
      const parsed = validators.registerSchema.safeParse({
        body: { email, password: newPassword },
      });
      if (!parsed.success) {
        throw new RecoveryError(
          'Use a valid email and a password of 12–128 characters, at most 72 UTF-8 bytes.',
        );
      }
      await security.assertPasswordNotCompromised(newPassword);
      const passwordHash = await bcrypt.hash(newPassword, config.env.BCRYPT_ROUNDS);

      return transaction.withTransaction(pool, async (client) => {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '10s'");
        const { rows } = await client.query(
          'SELECT id, password_hash FROM users WHERE id = $1 AND email = $2 FOR UPDATE',
          [userId, parsed.data.body.email],
        );
        const record = rows[0];
        if (!record)
          throw new RecoveryError('The confirmed account changed. No recovery performed.');
        if (await bcrypt.compare(newPassword, record.password_hash).catch(() => false)) {
          throw new RecoveryError(
            'The new password matches the stored password. No recovery performed; investigate the login request instead.',
          );
        }

        const user = await users.changeUserPassword(userId, passwordHash, client);
        await users.revokeAllUserRefreshTokens(userId, client);
        await actions.revokeActiveAccountActionTokens(userId, 'password_reset', client);
        await audit.insertAuthAuditEvent(
          authAudit.buildAuthAuditEvent({
            userId,
            subject: email,
            eventType: 'auth.password_reset.operator',
            outcome: 'success',
            metadata: {
              channel: 'staging-cli',
              environmentId: target.environmentId,
              serviceId: target.serviceId,
              deploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
            },
          }),
          client,
        );
        return { id: user.id, authVersion: user.auth_version };
      });
    },

    close: () => pool.end(),
  };
}
