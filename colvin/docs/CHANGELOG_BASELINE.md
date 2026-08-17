# Colvin Production Baseline Changelog

## v0.3 — Gates 1–3 foundation

### Product identity

- renamed root npm package to `colvin`
- renamed npm workspaces to `@colvin/*`
- changed visible product identity to Colvin
- changed browser session key and JWT issuer/audience to Colvin identifiers
- changed Go module paths to `colvin/*`
- changed Docker network and example PostgreSQL identity to Colvin names

### Formatting and developer experience

- added workspace-local format commands
- retained root canonical format command
- fixed `.gitignore` so shared `.vscode` formatter policy is actually committed
- added `npm run doctor` for deterministic prerequisite checks

### Testing

- added VIN decoder unit tests
- added VIN decoder HTTP boundary tests
- added API gateway smoke, standard-error, auth-boundary, and validation tests
- added internal response-contract tests
- added unified root `test`, `build`, and `quality` commands

### Backend correctness

- made auth/VIN request bodies strict
- bounded refresh-token request size
- fixed refresh-token persistence expiry to use JWT `exp`
- explicitly checks refresh-token type
- validates gateway-to-Go response contracts with Zod
- rejects internal redirects and converts internal 5xx responses to gateway errors

### Known blockers carried forward

- `package-lock.json` must be generated/committed from a network-enabled root `npm install`
- `apps/services-go/history-service/go.sum` must be generated/committed with `go mod tidy`
- a canonical full-tree `npm run format` still needs to be executed after dependencies are installed
- Node lint/test/build and history-service full tests must then be run through `npm run quality`
