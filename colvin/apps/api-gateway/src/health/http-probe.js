import { Buffer } from 'node:buffer';

const MAX_RESPONSE_BYTES = 16 * 1024;

class ProbeError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

async function readJson(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE_BYTES) throw new ProbeError('response_too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } catch {
    throw new ProbeError('invalid_json');
  }
}

// Only bounded reasons and an HTTP status leave this function, never a URL,
// raw response, exception message, header or credential.
export async function probeJson(
  name,
  url,
  validate,
  { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {},
) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      return { name, passed: false, reason: 'http', httpStatus: response.status };
    }
    const reason = validate(await readJson(response));
    return { name, passed: !reason, ...(reason ? { reason } : {}), httpStatus: 200 };
  } catch (error) {
    const reason =
      error instanceof ProbeError
        ? error.reason
        : ['TimeoutError', 'AbortError'].includes(error?.name)
          ? 'timeout'
          : 'network';
    return { name, passed: false, reason };
  }
}
