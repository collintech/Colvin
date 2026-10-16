import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

const URL_TLS_PARAMETERS = ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey'];

export function postgresTlsOptions({ connectionString, mode, caBase64 }) {
  if (mode === 'disable') return false;
  if (mode !== 'verify-full') throw new Error('Unsupported PostgreSQL TLS mode');

  const url = new URL(connectionString);
  if (URL_TLS_PARAMETERS.some((parameter) => url.searchParams.has(parameter))) {
    throw new Error(
      'Remove SSL query parameters from DATABASE_URL; use DB_SSL_MODE and DB_SSL_CA_BASE64',
    );
  }

  // node-postgres must not override explicit TLS options with URL query parameters.
  // servername verifies the private service DNS name against the certificate SAN.
  const ca = caBase64 ? Buffer.from(caBase64, 'base64').toString('utf8') : null;
  if (
    ca &&
    (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----'))
  ) {
    throw new Error('DB_SSL_CA_BASE64 must contain a base64-encoded PEM CA certificate');
  }

  return {
    rejectUnauthorized: true,
    servername: url.hostname,
    ...(ca ? { ca } : {}),
  };
}
