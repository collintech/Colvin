# Colvin Project Handoff

## Current baseline

Product name: **Colvin**

This file is the compact source of truth for continuing the production build in a new chat or development session.

## Current checkpoint — November 4, 2026

Railway **staging** now runs the API Gateway with `NODE_ENV=production` and `PASSWORD_COMPROMISE_CHECK=hibp`. The owner verified the live screening probe, browser breached-password rejection, production configuration validation, PostgreSQL/Redis readiness, login/refresh/logout/re-login, VIN lookup and password-reset email delivery. These completed checks should not be restarted.

PR #12's gateway cookie-log redaction also passed all three CI checks, deployed and was verified by the owner after login/refresh. On October 28, the owner ran PR #13's deployed [read-only runtime check](STAGING_RUNTIME_CHECK.md) and all four checks passed. PR #14's compatible-reader browser checks also passed. These completed gates should not be repeated.

PR #15 passed all three CI jobs, merged as `d50a3fd3ce3066c17982a7a6dda01dad7103a8a6` and deployed successfully. On October 29, the owner confirmed a fresh reset email with `/reset-password#token=...`, URL token removal, successful testing-account reset/sign-in and continued original-account access using its existing credentials. Live fragment-reset acceptance is complete. The accepted gateway deployment is `07fe2e97-724c-44cb-aede-cfb066862360`, with web deployment `f7dc3877-bc31-490e-9a1a-65dffaded034`. Do not repeat the reset or compatible-reader checks.

PR #17 passed all three CI checks, merged as `99df75addcdbfc7302b781aa0d26ff80c7c5ea5f` and deployed. The public frontend is `https://web-client-staging-1178.up.railway.app`; its `/healthz` and lowercase `/api/v1/status` endpoints returned HTTP 200 with their expected bodies. The accepted gateway deployment is `c1b3c406-c807-40d1-8d0f-98c3763c7fec`, with web deployment `9e8eb752-638f-4e39-ae23-e85ed30f86bc`.

The owner remains on Railway **Hobby** and configured both real Better Stack monitors. On November 2, the owner confirmed that both failure and recovery emails arrived after changing/restoring only a spare monitor's URL, and paused that test monitor. Baseline external availability monitoring and email delivery are complete. Keep the real monitors active. [Staging monitoring](STAGING_MONITORING.md) records the exact form mapping, strict dependency-health scope and remaining observability limits. Do not repeat the alert test or earlier authentication/email checks.

The [compatible staging API Gateway rollback](STAGING_ROLLBACK.md) passed on November 2. The initial healthy PR #18 deployment was `51398338-3f26-465e-a330-680a47160413`. Restored PR #17 deployment `b26380aa-a724-42c0-abed-39743d26a3a6` and restored PR #18 deployment `3f7d8856-6279-4758-a58c-2ad1ce2aaf91` both passed all four runtime checks. Login, logout, refresh and VIN lookup succeeded. The owner confirmed PR #18 active at the end. Both restored reports had `commitSha: null`; GitHub deployment statuses associated them with source commits `99df75addcdbfc7302b781aa0d26ff80c7c5ea5f` and `fabe97e689e561bc100905fd1d79717e75e87a3a` respectively. Do not repeat the rehearsal or reuse its historical IDs as current expectations after a later deployment.

The [first live encrypted PostgreSQL backup and isolated local restore](STAGING_BACKUP_RESTORE.md) passed on November 4 at 14:18 WAT. PR #20 passed all three CI jobs and merged as `0e6dcc888358292c797780161411517a1da2c529`. The owner supplied `passed: true` for all five checks: nine migration checksums, all 11 public tables/columns, constraints/indexes, extensions and snapshot row counts. Source/client/target were PostgreSQL 18.6; target networking was disabled. Run `9290d5e0-ddc3-4f87-a052-fe26d182c2bc` took 21 seconds including decryption. Its encrypted archive folder is `colvin-staging-20261104T131728Z-o0rZfPp6` under the owner's private backup directory. The assistant independently fetched `/healthz` and `/api/v1/status` after the drill; both returned HTTP 200 with expected bodies. The archive/digest/report stay with the owner; do not request the archive or repeat the accepted manual drill.

Source/tool inventory is complete: PostgreSQL `180006`, approximately 9.09 MB; Railway 5.64.0, Docker client/server 29.9.2, GnuPG 2.4.9 and OpenSSH 10.6p1. Railway Hobby's actual Backups page had **No Backups** and requires Pro for native backup creation/schedules/PITR. Keep Hobby and current credentials/security settings. Next is **recurring backups, private off-device storage, retention and recovery-key custody**. The successful manual run still displayed SSH-key and GPG passphrase prompts; it does not prove agent caching or unattended operation. Select an available runner and private storage before automating, without storing passphrases in scripts/task arguments. No recurring schedule, verified secondary copy, bucket/PITR enablement or additional Railway database has been performed. Final security/launch acceptance remains pending.

Follow [staging operations](STAGING_OPERATIONS.md) for deployment references, the current security patch and the remaining monitoring, rollback, backup/restore and final acceptance work. The gate descriptions below preserve earlier implementation history; they are not the current work queue.

## Architecture kept

- React/Vite web client
- Node/Express public API gateway
- Go VIN decoder service
- Go history service
- PostgreSQL
- Redis
- Docker Compose for local integration

`VIN` remains a domain term. `Colvin` is the product/repository identity.

## Completed work

### Gate 0 — repository hygiene

- repository-level Prettier configuration
- ESLint remains responsible for JS/JSX correctness
- `gofmt` remains responsible for Go formatting
- VS Code workspace formatting configuration
- root and workspace `format` / `format:check` commands
- product identity changed to Colvin in root package, browser identity, token storage, JWT issuer/audience, and Go module names
- developer verified repository-wide Prettier formatting successfully

### Gate 1 — dependency reproducibility

In progress. The Windows npm detection false-negative in `npm run doctor` is fixed in v0.4.

Required generated artifacts:

- `package-lock.json` generated by `npm install` at repository root
- `apps/services-go/history-service/go.sum` generated by `go mod tidy`

Run `npm run doctor` from the root to verify these prerequisites.

### Gate 2 — executable quality baseline

In progress.

Implemented:

- VIN decoder unit tests
- VIN decoder HTTP contract/security tests
- API gateway smoke/validation/auth-boundary tests
- unified `npm test`, `npm run build`, and `npm run quality` entry points

Verified in the build environment:

- VIN decoder tests pass.

Not yet verified here because external dependency installation is unavailable:

- Node test/lint/build suite — developer run reached lint; v0.4 fixes the reported gateway error and React warnings
- history-service compile/test after `go.sum` generation

## Exact local verification sequence

From the Colvin root:

```bash
npm install
cd apps/services-go/history-service
go mod tidy
cd ../../..
npm run doctor
npm run format
npm run quality
```

For v0.4, keep the `package-lock.json` and `apps/services-go/history-service/go.sum` generated on the developer workstation. Do not overwrite or delete them when applying the patch.

Commit both generated lockfiles after they are produced.

## Next engineering gates

1. Finish Gate 1/2 verification on a network-enabled development machine.
2. Gate 3: stabilize public/internal API contracts and backend error semantics.
3. Gate 4: introduce explicit database migrations and integration testing for PostgreSQL/Redis.
4. Gate 5: harden authentication, authorization, refresh-token transport, and account security.
5. Gate 6+: real VIN/history providers, frontend completion, security testing, Docker hardening, CI/CD, staging, observability, backup/restore, disaster recovery, and production launch.

## v0.7 / Gate 4B

- PostgreSQL remains authoritative; Redis is explicitly degradable.
- API readiness distinguishes PostgreSQL failure (`not_ready`) from Redis failure (`degraded`).
- Added versioned vehicle-cache keys and configurable cache TTL.
- Added configurable PostgreSQL pool limits/timeouts.
- Added real PostgreSQL/Redis integration test runner (`npm run test:integration`).
- Added Go history repository integration tests using the migrated local PostgreSQL database.

## Gate 5D authentication hardening

Gate 5D adds short refresh-rotation race tolerance, production HIBP Pwned Passwords screening, password-reset response padding, bounded account-email retry/token revocation, and 5xx detail suppression. MFA remains an explicit pre-admin-console requirement rather than a partially implemented flag.
