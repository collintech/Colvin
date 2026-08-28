export function installTestRuntimeEnv() {
  const defaults = {
    NODE_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://colvin_test:colvin_test@127.0.0.1:5432/colvin_test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'test-access-secret-00000000000000000000000000000000',
    JWT_REFRESH_SECRET: 'test-refresh-secret-000000000000000000000000000000',
    INTERNAL_API_KEY: 'test-internal-api-key-0000000000000000',
    VIN_DECODER_URL: 'http://127.0.0.1:4101',
    HISTORY_SERVICE_URL: 'http://127.0.0.1:4102',
    PASSWORD_COMPROMISE_CHECK: 'disabled',
    EMAIL_PROVIDER: 'test',
    LOG_LEVEL: 'silent',
  };

  for (const [key, value] of Object.entries(defaults)) {
    process.env[key] ??= value;
  }
}
