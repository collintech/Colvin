# Gate 4C — Persistence Hardening

Gate 4C closes the first production persistence baseline for Colvin.

## Guarantees added

- PostgreSQL work that spans multiple writes can use `withTransaction` for explicit BEGIN/COMMIT/ROLLBACK behavior.
- PostgreSQL and Redis have explicit shutdown helpers used during API Gateway termination.
- Redis cache deletion is best-effort and cannot take the authoritative request path offline.
- Vehicle cache keys remain versioned under `colvin:v1:vehicle:<VIN>`.
- Concurrent requests for the same uncached VIN are coalesced within one API Gateway process, reducing duplicate decoder/provider work.
- Failed coalesced work is removed immediately so a later request can retry.
- Integration tests prove transaction commit/rollback behavior and Redis invalidation against real infrastructure.
- The Go history repository is tested for cancelled contexts and closed-pool failures.

## Important boundary

The single-flight mechanism is process-local. It prevents duplicate work inside one API Gateway process. When Colvin later runs multiple API Gateway replicas, provider-level idempotency or a distributed coordination strategy may be added if real provider cost/rate limits justify it.

## Cache policy

PostgreSQL remains authoritative. Redis is disposable acceleration only.

- Cache read error → treat as cache miss.
- Cache write error → return authoritative response normally.
- Cache invalidation error → log and continue.
- Redis readiness failure → degraded service, not offline.
- PostgreSQL readiness failure → service is not ready.

## Verification

Run:

```bash
npm run format
npm run quality
npm run infra:up
npm run db:migrate
npm run test:integration
```

Gate 4C is complete only when both `npm run quality` and `npm run test:integration` are green.
