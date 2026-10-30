import { performance } from 'node:perf_hooks';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';

import { probeJson } from './http-probe.js';

export function createAvailabilityCheck({
  readiness,
  historyUrl,
  decoderUrl,
  fetchImpl = globalThis.fetch,
  cacheTtlMs = 10000,
  timeoutMs = 4000,
  now = () => performance.now(),
}) {
  const history = new URL('/ready', historyUrl);
  const decoder = new URL('/health', decoderUrl);
  let cached;
  let running;

  async function probeDependencies() {
    const [gateway, historyResult, decoderResult] = await Promise.allSettled([
      Promise.resolve().then(readiness),
      probeJson('history', history, (body) => (body?.status === 'ready' ? null : 'not_ready'), {
        fetchImpl,
        timeoutMs,
      }),
      probeJson('decoder', decoder, (body) => (body?.status === 'ok' ? null : 'not_ready'), {
        fetchImpl,
        timeoutMs,
      }),
    ]);
    const state = gateway.status === 'fulfilled' ? gateway.value : null;
    return (
      state?.ready === true &&
      state.status === 'ready' &&
      state.dependencies?.postgres === 'ready' &&
      state.dependencies?.redis === 'ready' &&
      historyResult.status === 'fulfilled' &&
      historyResult.value.passed === true &&
      decoderResult.status === 'fulfilled' &&
      decoderResult.value.passed === true
    );
  }

  return function checkAvailability() {
    if (cached && now() - cached.at < cacheTtlMs) return Promise.resolve(cached.available);
    if (running) return running;

    let respond;
    let responded = false;
    const result = new Promise((resolve) => {
      respond = resolve;
    });
    running = result;

    function publish(available) {
      if (responded) return;
      responded = true;
      cached = { available, at: now() };
      respond(available);
    }

    const deadline = setTimeout(() => publish(false), timeoutMs);
    Promise.resolve()
      .then(probeDependencies)
      .then(publish, () => publish(false))
      .finally(() => {
        clearTimeout(deadline);
        // Retain the single flight until the underlying work finishes, even
        // when the public response has already timed out.
        running = undefined;
      });
    return result;
  };
}

export function createAvailabilityHandler(check) {
  return async (_req, res) => {
    let available = false;
    try {
      available = (await check()) === true;
    } catch {
      // A public health response never includes dependency errors or details.
    }
    res.set('Cache-Control', 'no-store');
    res.status(available ? 200 : 503).json({ status: available ? 'ok' : 'unavailable' });
  };
}
