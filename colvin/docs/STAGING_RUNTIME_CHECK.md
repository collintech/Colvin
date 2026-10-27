# Gate 8B — Read-only staging runtime check

Use this command after a deployment, and during a rollback that retains production mode, to replace repeated manual configuration and readiness commands. The live checkpoint before this change is recorded in [staging operations](STAGING_OPERATIONS.md).

## Run after deployment

Merge the reviewed runtime-check PR after Quality, Integration and Container Smoke pass. Wait for the new **staging → api-gateway** deployment to succeed, reconnect through Railway SSH, and run:

```bash
cd /app/apps/api-gateway
node scripts/check-staging-runtime.mjs
```

The output contains only validated project/environment/service/deployment IDs, a commit SHA when Railway provides it, and bounded check results. Compare the reported identity with the intended deployment:

| Field           | Colvin staging value                          |
| --------------- | --------------------------------------------- |
| `projectId`     | `a0803155-bc22-4311-ac90-43ab3582550e`        |
| `environmentId` | `ce8f6930-5c13-46f6-955c-8f62018223af`        |
| `serviceId`     | `461fb555-09f6-489c-bcc0-f92313a6f0f4`        |
| `deploymentId`  | The successful deployment being checked       |
| `commitSha`     | The deployed main-branch commit, when present |

Every check must have `passed: true`, the top-level `passed` must be `true`, and the final line must read:

```text
Staging runtime check passed.
```

A failing check or refused invocation exits with status 1. A passing run exits with status 0. Configuration validation may exit before producing a report when required application settings are invalid.

For acceptance tied to a specific deployment, optionally add `--expect-deployment` and/or `--expect-commit`, followed by the exact full deployment UUID and deployed commit SHA copied from the intended release. Mismatches fail before any request. Use the merged main commit rather than the earlier PR-head commit. A missing Git SHA is reported as `null` for deployments without Git-trigger metadata, and fails if `--expect-commit` was supplied.

## What the command checks

- It requires a deployed Railway environment named `staging`, a service named `api-gateway` and valid deployment identity. It refuses a Railway production environment even though the staging application itself runs in production mode.
- Production configuration must use `NODE_ENV=production`, HIBP screening, verified PostgreSQL TLS, secure refresh cookies, the Resend adapter and HTTPS browser/account URLs. The gateway port must be valid, and private Go-service URLs must use Railway internal hostnames without credentials, query strings, fragments or unexpected path prefixes.
- The running gateway's loopback `/ready` response must explicitly report both PostgreSQL and Redis as ready. HTTP 200 with degraded Redis fails acceptance.
- The configured history-service `/ready` must return `status: ready`, which checks its database connection.
- The configured VIN decoder `/health` must return `status: ok`. This is liveness, not provider or VIN-lookup acceptance.

The three GET requests run concurrently, each with a five-second timeout covering headers and body. Redirects are refused, each response body is limited to 16 KiB, and only HTTP 200 with the expected JSON state can pass. Results expose only fixed check names/reasons and optional numeric HTTP status; response bodies, exception messages, URLs and credentials are omitted.

The command loads application configuration but does not import database/cache clients, change accounts, send email, query HIBP or perform a VIN/provider lookup. The existing services perform their own read-only readiness queries. Production TLS/cookie/HIBP settings are configuration checks; browser cookie attributes, a live HIBP probe, email delivery and internal API-key enforcement remain separate evidence.

## Failure handling and scope

If identity or an expected deployment/commit fails, reconnect to the intended container. If configuration fails, the report names the settings without exposing their values and makes no network requests. For `http`, `network`, `timeout`, `invalid_json`, `response_too_large` or readiness-state failures, inspect bounded service diagnostics and resolve the reported issue before accepting the deployment.

Do not restore old credentials, disable TLS/HIBP or reset accounts to make this check pass. A deliberate emergency rollback to `NODE_ENV=development` will fail this production-mode acceptance command; use the existing loopback readiness command and the affected browser flow to validate that recovery. Older images without this script also require the existing readiness/browser checks.

This command is a point-in-time operator check. It does not configure continuous monitoring, verify alert delivery, establish historical log safety, perform a backup restore or complete a rollback rehearsal. Record the live result and continue the remaining operational gates in [staging operations](STAGING_OPERATIONS.md).
