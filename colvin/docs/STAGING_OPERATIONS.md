# Gate 8B — Staging operations

## Verified checkpoint — October 27, 2026

The owner reported these checks passing on Railway **staging**:

- The persistent live HIBP probe rejected its known breached sample and accepted its generated sample.
- Browser registration rejected the public breached password with the expected message.
- The production configuration preflight passed, and a fresh SSH session confirmed the deployed `NODE_ENV` is `production`.
- The running gateway's `/ready` response was `ready: true`, `status: ready`, with both PostgreSQL and Redis explicitly `ready`.
- Browser login, page refresh, logout/re-login, VIN lookup and password-reset email delivery succeeded.
- After PR #12 deployed, the owner signed in/refreshed and confirmed cookie fields were redacted in new API Gateway HTTP logs.

The custom sending domain remains postponed. Resend's temporary sender still restricts delivery to the permitted Resend test recipient; successful staging delivery is not acceptance of general-user email delivery.

| Reference                                         | Value                                            |
| ------------------------------------------------- | ------------------------------------------------ |
| Repository commit                                 | `45d9fe961ccba50a0ec91e7fde77b9d85c3c89ff`       |
| Verified production-mode API Gateway deployment   | `3e5a35f9-caac-41e3-b760-99f01999beda`           |
| Earlier development-mode API Gateway baseline     | `fb50c36b-dfa2-433f-bd1d-7b5a8e7de2bf`           |
| Cookie-redaction commit                           | `d13d51ac3ffafcf549c86611009b9fe70e3b0748`       |
| API Gateway deployment with live log verification | `c78a94fc-05a6-4b36-abfb-25400dd5ca9d`           |
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

1. Merge/deploy the reviewed [runtime check](STAGING_RUNTIME_CHECK.md) after Quality, Integration and Container Smoke pass, then run it in a fresh SSH session. Implementation and fixture tests do not replace this live run.
2. Review token handling in frontend/proxy logs, then configure monitoring and alert delivery and verify an alert using a controlled staging exercise.
3. Rehearse a controlled deployment rollback and record the recovered deployment and post-rollback checks.
4. Configure backup retention and restore into an isolated target. Verify restored data without replacing the working staging database.
5. Complete final security and deployment acceptance, including general-user email delivery before launch.

These are pending tasks. The verified staging production-mode transition is not a production launch or completion of the remaining operational gates.
