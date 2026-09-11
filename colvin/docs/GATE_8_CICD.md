# Gate 8 — CI/CD Foundation

Gate 8A moves Colvin's proven local quality, persistence, integration, and container checks into GitHub Actions.

## Pipeline

The workflow is `.github/workflows/ci.yml` and runs on pull requests, pushes to `main`, and manual dispatches.

### Quality

- Node.js 24
- Go 1.27.1
- `npm ci`
- `npm run quality`

This preserves the existing Colvin quality gate: formatting, linting, API tests, Go tests, and the web build.

### Integration

The job uses disposable PostgreSQL 16 and Redis 7 GitHub Actions service containers. It creates a test-only `.env`, applies every SQL migration, applies the migration command a second time to prove idempotency, and runs `npm run test:integration`.

No production credentials are required. All JWT, internal-service, database, and cache values in this job are synthetic and exist only for the lifetime of the runner.

### Container smoke

After quality and integration pass, CI:

1. validates `docker compose`;
2. builds all Colvin application images;
3. retries the image build once for transient registry/network failures;
4. starts the full Compose stack with readiness waiting;
5. verifies the NGINX web-edge health endpoint;
6. prints logs automatically on failure; and
7. tears down containers and volumes on every run.

This is intentionally the same runtime topology proven in Gate 7.

## Security decisions

- Workflow token permissions are read-only (`contents: read`).
- Checkout does not persist Git credentials.
- Pull-request CI does not require production repository secrets.
- Provider modes remain local, so CI never spends Vincario credits.
- Production email and HIBP credentials are not weakened or faked; the CI runtime uses test/development mode only.
- GitHub Actions dependencies are tracked by Dependabot.

## Repository protection

After the first successful workflow run appears in GitHub, protect the production branch and require these checks before merge:

- `Quality`
- `Integration`
- `Container Smoke`

Also require pull requests before merging and block force pushes to the production branch.

## Gate boundary

Gate 8A is CI and build verification only. It does not deploy Colvin.

Gate 8B should add staging delivery using a protected GitHub Environment, environment-scoped secrets, an explicit deployment target, and rollback/health verification. Production promotion should remain a separate controlled step after staging is proven.

