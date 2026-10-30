import { URL } from 'node:url';

import { probeJson } from '../../src/health/http-probe.js';

export { probeJson };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const COMMIT_SHA = /^[a-f0-9]{40}$/i;

export class RuntimeCheckError extends Error {}

export function stagingIdentity(runtime, { deployment, commit } = {}) {
  const fields = {
    projectId: runtime.RAILWAY_PROJECT_ID,
    environmentId: runtime.RAILWAY_ENVIRONMENT_ID,
    serviceId: runtime.RAILWAY_SERVICE_ID,
    deploymentId: runtime.RAILWAY_DEPLOYMENT_ID,
  };
  if (
    runtime.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
    runtime.RAILWAY_SERVICE_NAME !== 'api-gateway' ||
    Object.values(fields).some((value) => !UUID.test(value ?? ''))
  ) {
    throw new RuntimeCheckError('Run this check inside the deployed Railway staging api-gateway.');
  }
  const sha = runtime.RAILWAY_GIT_COMMIT_SHA;
  if (sha && !COMMIT_SHA.test(sha)) {
    throw new RuntimeCheckError('Deployment commit metadata is invalid.');
  }
  if (deployment !== undefined && (!UUID.test(deployment) || deployment !== fields.deploymentId)) {
    throw new RuntimeCheckError(
      'Deployment does not match --expect-deployment; reconnect to the intended container.',
    );
  }
  if (commit !== undefined && (!COMMIT_SHA.test(commit) || commit !== sha)) {
    throw new RuntimeCheckError(
      'Commit does not match --expect-commit; reconnect to the intended container.',
    );
  }
  return { ...fields, commitSha: sha || null };
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function privateServiceUrl(value) {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname.endsWith('.railway.internal') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function gatewayReadiness(body) {
  if (body?.dependencies?.postgres !== 'ready') return 'postgres_not_ready';
  if (body?.dependencies?.redis !== 'ready') return 'redis_not_ready';
  return body?.ready === true && body.status === 'ready' ? null : 'unexpected_response';
}

export async function checkStagingRuntime({
  runtime,
  config,
  expected,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
}) {
  const identity = stagingIdentity(runtime, expected);
  const history = privateServiceUrl(config.HISTORY_SERVICE_URL);
  const decoder = privateServiceUrl(config.VIN_DECODER_URL);
  const requirements = [
    ['NODE_ENV', config.NODE_ENV === 'production'],
    ['PASSWORD_COMPROMISE_CHECK', config.PASSWORD_COMPROMISE_CHECK === 'hibp'],
    ['DB_SSL_MODE', config.DB_SSL_MODE === 'verify-full'],
    ['REFRESH_COOKIE_SECURE', config.REFRESH_COOKIE_SECURE === true],
    ['EMAIL_PROVIDER', config.EMAIL_PROVIDER === 'resend'],
    ['WEB_ORIGIN', httpsUrl(config.WEB_ORIGIN)],
    ['ACCOUNT_WEB_URL', httpsUrl(config.ACCOUNT_WEB_URL)],
    [
      'API_PORT',
      Number.isInteger(config.API_PORT) && config.API_PORT > 0 && config.API_PORT <= 65535,
    ],
    ['HISTORY_SERVICE_URL', Boolean(history)],
    ['VIN_DECODER_URL', Boolean(decoder)],
  ];
  const failedSettings = requirements.filter(([, passed]) => !passed).map(([name]) => name);
  const checks = [
    {
      name: 'production configuration',
      passed: failedSettings.length === 0,
      ...(failedSettings.length ? { failedSettings } : {}),
    },
  ];
  if (!failedSettings.length) {
    checks.push(
      ...(await Promise.all([
        probeJson(
          'gateway PostgreSQL and Redis',
          `http://127.0.0.1:${config.API_PORT}/ready`,
          gatewayReadiness,
          { fetchImpl, timeoutMs },
        ),
        probeJson(
          'history-service readiness',
          new URL('/ready', history),
          (body) => (body?.status === 'ready' ? null : 'not_ready'),
          { fetchImpl, timeoutMs },
        ),
        probeJson(
          'VIN decoder liveness',
          new URL('/health', decoder),
          (body) => (body?.status === 'ok' ? null : 'unexpected_response'),
          { fetchImpl, timeoutMs },
        ),
      ])),
    );
  }
  return { ...identity, passed: checks.every((check) => check.passed), checks };
}
