# Gate 4B — Persistence and Cache Verification

Gate 4B treats PostgreSQL as Colvin's authoritative persistence layer and Redis as an optional performance layer.

## Runtime policy

- PostgreSQL failure makes the API Gateway **not ready**.
- Redis failure makes the API Gateway **degraded**, not unavailable.
- Vehicle cache keys use `colvin:v1:vehicle:<VIN>`.
- Vehicle cache TTL is configured with `VEHICLE_CACHE_TTL_SECONDS` and defaults to one hour.
- Cache read/write failures are logged and treated as cache misses; authoritative database/provider behavior continues.
- PostgreSQL pool sizing and timeouts are environment-configurable.

## Local infrastructure

Add these values to the local `.env` (use local development secrets, not production secrets):

```env
REDIS_PASSWORD=your-local-redis-password
REDIS_PORT=6379
INTEGRATION_REDIS_URL=redis://:your-local-redis-password@localhost:6379
VEHICLE_CACHE_TTL_SECONDS=3600

DB_POOL_MAX=10
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECT_TIMEOUT_MS=5000
```

`DATABASE_URL` remains the Docker-internal PostgreSQL URL. `MIGRATION_DATABASE_URL` remains the host-side PostgreSQL URL.

Start the persistence services:

```bash
npm run infra:up
npm run infra:ps
```

Run migrations before integration tests:

```bash
npm run db:migrate
```

Then run the persistence integration suite:

```bash
npm run test:integration
```

The integration suite verifies the migration ledger/core schema, real Redis set/get/TTL behavior, and the Go history repository against PostgreSQL.

## Test separation

`npm run quality` remains the fast code-quality gate and does not require Docker infrastructure. `npm run test:integration` is the runtime persistence gate and requires local PostgreSQL and Redis containers.
