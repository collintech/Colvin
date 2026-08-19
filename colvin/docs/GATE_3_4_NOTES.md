# Gates 3–4: Backend Correctness and Data Foundations

## Added in v0.5

- History-service handler tests for liveness, readiness, internal authentication, VIN validation/normalization, successful responses, and repository failures.
- Separate `/health` (process liveness) and `/ready` (database readiness) endpoints in the history service.
- Repository `Ping` contract so readiness is testable without a real database.
- Versioned migration runner (`npm run db:migrate`) with SHA-256 checksums and transactional application.
- `schema_migrations` ledger prevents silently editing an already-applied migration.
- Operational indexes for active refresh-token expiry and vehicle-history ordering.

## Migration rule

After a migration has been applied to a shared/staging/production database, never edit it. Add the next numbered migration instead.

## Local verification

Run the normal quality gate first:

    npm run quality

With PostgreSQL running and `DATABASE_URL` pointing at it:

    npm run db:migrate

Run it a second time. Existing migrations should print `skip`, proving idempotent migration bookkeeping.
