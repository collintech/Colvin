# Gate 8B — Staging operations

## Verified checkpoint — November 4, 2026

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
- PR #17 merged/deployed after all three CI checks passed. Both external Colvin monitors were reported healthy. On November 2, the owner confirmed receipt of the temporary monitor's failure and recovery emails after changing/restoring only its URL, and paused that temporary monitor. Baseline external availability monitoring and email alert delivery are accepted. The assistant also directly verified both healthy endpoint bodies and the deliberate HTTP 404 test path.
- The compatible PR #17/PR #18 gateway rollback rehearsal passed on November 2. Both restored runtime reports passed all four checks; login, logout, refresh and VIN lookup succeeded. The owner confirmed PR #18 active at the end. Both reports lacked Git-trigger metadata, so the restored release identities were matched to GitHub deployment statuses. See the rollback guide for this acceptance's limits.
- After PR #20 passed all three CI jobs and merged, the owner completed the first encrypted live backup and isolated local PostgreSQL 18.6 restore on November 4. All five checks passed, including nine migration checksums, all 11 public tables and snapshot row counts. The restore took 21 seconds including decryption with networking disabled. Post-drill public `/healthz` and `/api/v1/status` requests independently returned HTTP 200 and expected bodies. See the backup guide for the run/archive identity and scope. The scheduled backup and off-device recovery checkpoint is recorded in the [scheduled backup guide](STAGING_SCHEDULED_BACKUPS.md).

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
| Accepted monitoring release commit                | `99df75addcdbfc7302b781aa0d26ff80c7c5ea5f`       |
| Accepted monitoring API Gateway deployment        | `c1b3c406-c807-40d1-8d0f-98c3763c7fec`           |
| Accepted monitoring web deployment                | `9e8eb752-638f-4e39-ae23-e85ed30f86bc`           |
| PR #18 merged release commit                      | `fabe97e689e561bc100905fd1d79717e75e87a3a`       |
| Restored PR #17 gateway, runtime checks passed    | `b26380aa-a724-42c0-abed-39743d26a3a6`           |
| Restored PR #18 gateway, active at acceptance     | `3f7d8856-6279-4758-a58c-2ad1ce2aaf91`           |
| Application environment                           | `NODE_ENV=production` within Railway `staging`   |
| Compromised-password screening                    | `PASSWORD_COMPROMISE_CHECK=hibp`                 |
| PostgreSQL TLS                                    | `DB_SSL_MODE=verify-full` with the configured CA |
| Secure refresh-cookie setting                     | `REFRESH_COOKIE_SECURE=true`                     |

PR #12 passed Quality, Integration and Container Smoke and deployed successfully. Cookie redaction was confirmed by the owner after login and refresh. The full production-mode acceptance reference is retained separately from this later log-verification reference; a deployment ID alone is not proof that every later deployment received all checks.

## Authentication logs

Gateway HTTP logs record the server-generated request ID, method, path without query, response status and timing. Request and response headers and bodies are omitted. Each proxied API request can be traced from Nginx's `upstream_request_id` to the gateway's `req.id` and the client's `X-Request-Id`. A caller-supplied ID is not used as the server's correlation ID. Separate application errors still retain bounded diagnostics, such as the email provider's failure code.

CI exercises the actual log serializers and correlates the two container logs using a synthetic request. Cookies and other headers continue to reach their normal destinations. After deployment, send an ordinary request to `/api/v1/status` and check that the gateway request ID matches the Nginx upstream request ID. The staging health response remains generic.

This covers normal access and completion logs. Historical records and Nginx error logs are outside this change; error messages may include raw request context. Keep unfiltered proxy logs out of external monitoring and log drains. Share bounded diagnostics, not headers, account-action URLs or variable dumps.

## Browser security headers

The container serves Colvin's HTML with an enforced Content Security Policy. The browser can load the built app and call its API from the same origin. Inline scripts and styles, plugins, embedded frames and injected base URLs are blocked. Docker Compose uses the Nginx API proxy as staging does; standalone Vite development still uses its own configured API URL. The reset and verification pages retain `no-store` and `no-referrer`. Successful static assets retain their cache policy; missing assets are not cacheable.

Container Smoke checks the built app's headers, asset delivery and API proxy. After a web-client rollout, open a fresh private window, sign in with a staging test account and run the usual VIN lookup. Check that the browser console shows no Content Security Policy violations. A live security-header check does not require sending another reset email.

On November 13, the public staging frontend returned the enforced policy and the owner confirmed the VIN report loaded in a private Chrome window after PR #28. The reported console showed HTTP 401 responses from authentication and a separate form-field notice, with no Content Security Policy violation shown.

## General-user email before launch

The existing Resend test sender is sufficient for the accepted staging test account. For general-user delivery, [verify a sending domain you control](https://resend.com/docs/dashboard/domains/introduction); the [default test sender](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain) is restricted to the Resend account address. A dedicated authentication subdomain is suitable if an owned domain is available. Leave click and open tracking off for authentication mail.

When ready, apply the verified `EMAIL_FROM` and a sending key scoped to that domain in staging. Keep `ACCOUNT_WEB_URL` pointing to the intended staging web origin. With a fresh test account whose inbox is not the Resend account address, verify actual receipt of both the verification and password-reset messages. Check that each link points directly to the staging site and carries a fragment token, complete both flows and confirm sign-in after reset. Record delivery and browser outcomes without storing the links or tokens. A verified domain or provider delivery status alone does not prove that both flows work.

## Password-manager account separation

A password-reset token identifies one Colvin user. The reset service updates that user's password and revokes that user's refresh sessions. Editing a saved Chrome entry changes the saved login details rather than another user's database password.

Keep separate saved entries for the original Colvin email and the Resend testing email. Before accepting a browser password update, check the selected username/email. If it selects the wrong account, dismiss the prompt and edit the testing account's entry in Google Password Manager. There is no need to reverse a successful test-account password change just to protect the original account.

## Recovery if the mode change causes a regression

The targeted mode rollback is to set only `NODE_ENV` back to `development` in **staging → api-gateway → Variables**, then apply/deploy. Retain the current HIBP setting, verified TLS configuration and current credentials. Reconnect to the new container and check both readiness dependencies and the affected browser flow.

A full Railway deployment rollback can restore older variables along with the code/image. Inspect its variable effects before using it after credential rotations. The compatible gateway rehearsal is now accepted in [staging rollback](STAGING_ROLLBACK.md); future deployments require their own current identity and compatibility checks.

## Remaining operational gates

1. Review [staging retention candidates](STAGING_SCHEDULED_BACKUPS.md) with deletion disabled. The Railway cron, encrypted Drive readback, isolated restore of a worker archive and missed-heartbeat email test were verified on November 10–11. Keep Railway Hobby. Review real eligible folders before authorizing cleanup; no need to repeat the accepted manual restore or interrupt the schedule.
2. Complete final security and deployment acceptance, including general-user email delivery before launch and the remaining observability scope.

These are pending tasks. The verified staging production-mode transition is not a production launch or completion of the remaining operational gates.

## Accepted monitoring baseline

Status: **baseline accepted on November 2**. The owner remains on Railway **Hobby**, configured the two real Better Stack monitors, confirmed failure/recovery email delivery using a spare monitor and paused the test monitor. See [staging monitoring](STAGING_MONITORING.md) for the reported evidence, endpoint scope and exact form mapping. Keep the two real monitors active.

[Railway healthchecks](https://docs.railway.com/deployments/healthchecks) run during deployment and do not continuously check a deployed service. [Railway resource monitors](https://docs.railway.com/observability) support CPU, RAM, disk and network thresholds with email/in-app notifications, and require Pro. Do not assume access to those monitors or upgrade the workspace to complete this gate. The existing runtime command remains an operator-run check.

The frontend `/healthz` returns a static Nginx response and does not check the gateway or databases. The new `/api/v1/status` route uses the existing API proxy and returns only generic HTTP 200/503 status after bounded dependency checks; see the monitoring guide for its exact scope and Redis-degradation behavior. Gateway `/ready` and the private service checks remain available to the runtime script. The frontend only proxies `/api/`; using its `/ready` path would fall back to the React HTML page and could produce a misleading HTTP 200.

The completed test exercised a real HTTP 404 detector and recovery, with both emails received. It did not interrupt the databases or simulate provider failures. Resource alert thresholds, application latency/error telemetry and broader production observability remain separate work. Keep credentials, cookies and action tokens out of monitor URLs and exported telemetry.
