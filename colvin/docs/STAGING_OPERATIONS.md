# Gate 8B — Staging operations

## Verified checkpoint — October 29, 2026

The owner reported these checks passing on Railway **staging**:

- The persistent live HIBP probe rejected its known breached sample and accepted its generated sample.
- Browser registration rejected the public breached password with the expected message.
- The production configuration preflight passed, and a fresh SSH session confirmed the deployed `NODE_ENV` is `production`.
- The running gateway's `/ready` response was `ready: true`, `status: ready`, with both PostgreSQL and Redis explicitly `ready`.
- Browser login, page refresh, logout/re-login, VIN lookup and password-reset email delivery succeeded.
- After PR #12 deployed, the owner signed in/refreshed and confirmed cookie fields were redacted in new API Gateway HTTP logs.
- On October 28, the owner ran PR #13's deployed runtime command: production configuration, gateway PostgreSQL/Redis readiness, history readiness and VIN-decoder liveness all passed.
- After PR #14 merged/deployed on October 28, the owner again reported all four runtime checks passing. On October 29, the owner confirmed that both fragment-page browser tests had already passed and had also been repeated successfully. Reader acceptance is complete.
- PR #15 subsequently merged and all four staging deployments reported success. The owner received a fresh reset email, confirmed `/reset-password#token=...`, observed the token disappear, reset the testing-account password and signed in successfully. The original account still accepted its existing credentials. Live fragment-reset acceptance is complete; no further reset is needed for this gate.

The custom sending domain remains postponed. Resend's temporary sender still restricts delivery to the permitted Resend test recipient; successful staging delivery is not acceptance of general-user email delivery.

| Reference                                         | Value                                            |
| ------------------------------------------------- | ------------------------------------------------ |
| Repository commit                                 | `45d9fe961ccba50a0ec91e7fde77b9d85c3c89ff`       |
| Verified production-mode API Gateway deployment   | `3e5a35f9-caac-41e3-b760-99f01999beda`           |
| Earlier development-mode API Gateway baseline     | `fb50c36b-dfa2-433f-bd1d-7b5a8e7de2bf`           |
| Cookie-redaction commit                           | `d13d51ac3ffafcf549c86611009b9fe70e3b0748`       |
| API Gateway deployment with live log verification | `c78a94fc-05a6-4b36-abfb-25400dd5ca9d`           |
| Runtime-check release commit                      | `f984088e24b246ae3a580a3944e22fe5620bd983`       |
| Successful runtime-check API Gateway deployment   | `8d66eb43-f1eb-4073-815b-31cfad7f9776`           |
| Compatible-reader/privacy commit                  | `bd1f3f6eebc1939f149ab97f02d4a1523f41cc56`       |
| Compatible-reader web deployment                  | `5f66f2c4-cd2a-4c93-85ff-f0ee22783d5a`           |
| Privacy release API Gateway deployment            | `1c657c38-6274-4ef0-904f-c10a493c0506`           |
| Accepted fragment-sender release commit           | `d50a3fd3ce3066c17982a7a6dda01dad7103a8a6`       |
| Accepted fragment-sender API Gateway deployment   | `07fe2e97-724c-44cb-aede-cfb066862360`           |
| Accepted fragment-sender web deployment           | `f7dc3877-bc31-490e-9a1a-65dffaded034`           |
| Application environment                           | `NODE_ENV=production` within Railway `staging`   |
| Compromised-password screening                    | `PASSWORD_COMPROMISE_CHECK=hibp`                 |
| PostgreSQL TLS                                    | `DB_SSL_MODE=verify-full` with the configured CA |
| Secure refresh-cookie setting                     | `REFRESH_COOKIE_SECURE=true`                     |

PR #12 passed Quality, Integration and Container Smoke and deployed successfully. Cookie redaction was confirmed by the owner after login and refresh. The full production-mode acceptance reference is retained separately from this later log-verification reference; a deployment ID alone is not proof that every later deployment received all checks.

## Authentication logs

The gateway logger redacts incoming authorization, cookie and internal-API-key headers and outgoing `Set-Cookie` headers. Existing top-level password, password-hash and refresh-token redaction remains. HTTP status, route, request ID and response timing remain available for diagnosis.

Regression tests use synthetic credentials with actual Pino HTTP serializers. They verify that cookies reach the HTTP client unchanged while their values do not reach the captured log stream. Safe email-provider failure codes and request correlation remain visible.

This is a gateway-header logging fix. It does not rewrite historical logs or establish that all log sources are safe. Review Nginx access/error logs and account-action tokens in URLs before attaching external monitoring or a log drain. Share bounded diagnostics, not full headers, cookies, reset links, passwords or variable dumps. No credential rotation is part of this patch.

## Password-manager account separation

A password-reset token identifies one Colvin user. The reset service updates that user's password and revokes that user's refresh sessions. Editing a saved Chrome entry changes the saved login details rather than another user's database password.

Keep separate saved entries for the original Colvin email and the Resend testing email. Before accepting a browser password update, check the selected username/email. If it selects the wrong account, dismiss the prompt and edit the testing account's entry in Google Password Manager. There is no need to reverse a successful test-account password change just to protect the original account.

## Recovery if the mode change causes a regression

The targeted mode rollback is to set only `NODE_ENV` back to `development` in **staging → api-gateway → Variables**, then apply/deploy. Retain the current HIBP setting, verified TLS configuration and current credentials. Reconnect to the new container and check both readiness dependencies and the affected browser flow.

A full Railway deployment rollback can restore older variables along with the code/image. Inspect its variable effects before using it after credential rotations. Recording the deployment references above does not constitute a completed rollback rehearsal.

## Remaining operational gates

1. Configure monitoring and alert delivery and verify an alert using a controlled staging exercise. The [account-link privacy rollout](ACCOUNT_ACTION_LINK_PRIVACY.md) has passed its live reset acceptance; do not repeat completed reader or reset checks.
2. Rehearse a controlled deployment rollback and record the recovered deployment and post-rollback checks.
3. Configure backup retention and restore into an isolated target. Verify restored data without replacing the working staging database.
4. Complete final security and deployment acceptance, including general-user email delivery before launch.

These are pending tasks. The verified staging production-mode transition is not a production launch or completion of the remaining operational gates.

## Next gate — monitoring and alert delivery

Status: **pending configuration and delivery acceptance**. The next setup decision needs the current Railway workspace plan and an owner-controlled alert destination. Retain the existing plan and services while assessing the available options; this checkpoint makes no billing, credential, service or notification changes.

[Railway healthchecks](https://docs.railway.com/deployments/healthchecks) run during deployment and do not continuously check a deployed service. [Railway resource monitors](https://docs.railway.com/observability) support CPU, RAM, disk and network thresholds with email/in-app notifications, and require Pro. Do not assume access to those monitors or upgrade the workspace to complete this gate. The existing runtime command remains an operator-run check.

The current frontend exposes `/healthz`, which returns a static Nginx response and does not check the gateway or databases. Gateway `/ready` and the private service checks are exercised by the runtime script. The frontend only proxies `/api/`; using its `/ready` path would fall back to the React HTML page and could produce a misleading HTTP 200. Choose actual endpoint contracts and expected response bodies before configuring continuous availability checks. Broader application/dependency coverage may need a focused implementation after the monitoring route is selected.

Acceptance must record the monitor target/scope, interval, alert destination, observed failure notification and observed recovery notification. Test using an isolated monitor or controlled staging exercise, and distinguish a notification test from proof that an outage detector works. Keep credentials, cookies and action tokens out of monitor URLs and exported telemetry. Monitoring remains pending until those results are reported.
