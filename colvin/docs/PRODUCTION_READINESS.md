# Colvin Production Readiness

Status: **Production build in progress**

This document is conservative by design. A component is not marked ready merely because source files exist; every gate must be executable and verified.

## Gate 0 — Repository hygiene and deterministic formatting

Status: **Implemented; final full-tree Prettier pass must run on a machine with installed npm dependencies**

Implemented:

- root-pinned Prettier configuration
- `.prettierignore`, `.editorconfig`, and `.gitattributes`
- committed VS Code workspace formatter settings and extension recommendations
- ESLint for JavaScript/JSX correctness
- `gofmt` plus a non-mutating Go formatting check
- root `format`, `format:check`, `format:web`, `format:api`, and `quality` scripts
- workspace-local `format` and `format:check` scripts, so formatting also works when invoked through an npm workspace
- Colvin product/repository identity while retaining VIN as a domain term

Important usage rule: run `npm run format` from the repository root. If working inside a workspace, run its local `npm run format` instead.

## Gate 1 — Deterministic dependency baseline

Status: **Partially implemented; generated lock data remains required**

Implemented:

- root `npm run doctor` prerequisite checker
- dependency checks for Node/npm/Go, local Prettier, `package-lock.json`, and history-service `go.sum`

Required generated artifacts:

- `package-lock.json` from a root `npm install`
- `apps/services-go/history-service/go.sum` from `go mod tidy`

These files must be committed before CI is considered reproducible.

## Gate 2 — Executable build, lint, format, and test baseline

Status: **Partially verified**

Implemented:

- unified root `npm test`
- unified root `npm run build`
- unified root `npm run quality`
- VIN decoder unit tests
- VIN decoder HTTP authentication/body-contract tests
- API gateway smoke, error-envelope, authentication-boundary, and request-validation tests
- static JavaScript syntax verification performed during this build

Verified in this build environment:

- Go formatting check passes
- VIN decoder tests pass

Pending local verification after dependency lock generation:

- API gateway tests
- ESLint across web and gateway
- Vite production build
- history-service full compile/test
- repository-wide Prettier pass/check

## Gate 3 — Backend correctness and service contracts

Status: **Started**

Implemented:

- strict request-body validation for auth and VIN endpoints
- bounded refresh-token request length
- refresh-token database expiry now derives from the signed JWT `exp` claim rather than approximating the TTL with `parseInt`
- refresh-token `type` claim is explicitly checked during rotation
- gateway validates VIN decoder and history-service response bodies with Zod
- unexpected internal response shapes fail as a controlled `502` contract error
- internal HTTP client refuses redirects and normalizes internal 5xx responses through the gateway

Still required before Gate 3 is complete:

- tests for token issue/rotation/revocation behavior
- stable public API error taxonomy and API contract documentation
- graceful internal network/timeout error mapping
- readiness endpoints distinct from liveness endpoints
- repository/service shutdown behavior validation

## Next gates

1. Finish Gate 1 and Gate 2 on a network-enabled development machine and commit generated lockfiles.
2. Complete Gate 3 backend contract/error semantics.
3. Gate 4: explicit migration workflow plus PostgreSQL/Redis integration tests.
4. Gate 5: production authentication/authorization and browser token transport.
5. Gate 6+: real VIN/history providers, frontend completion, security hardening, Docker production images, CI/CD, staging, observability, backup/restore, disaster recovery, and production launch.
