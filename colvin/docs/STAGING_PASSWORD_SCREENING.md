# Gate 8B — Staging compromised-password screening

**Completed checkpoint — October 27, 2026:** the owner verified the temporary and persistent live HIBP probes, browser rejection of the public breached sample, production configuration preflight, the deployed `NODE_ENV=production`, live PostgreSQL/Redis readiness and browser authentication/VIN/password-reset email checks. The production-mode deployment is recorded in [staging operations](STAGING_OPERATIONS.md). The procedures below are retained for reference; continue with the remaining operational gates rather than repeating this rollout.

Account recovery and the terminal prompt repair were verified by the owner: original-account login, refresh, logout and a VIN lookup succeeded. Continue from that checkpoint; do not repeat credential rotations or rebuild completed infrastructure gates.

## Screening behavior

Registration, password change, password reset and the staging operator recovery command use the shared password-screening service. The local common-password deny-list always applies. Setting `PASSWORD_COMPROMISE_CHECK=hibp` additionally checks the submitted new password against Pwned Passwords. Login and session refresh do not depend on HIBP availability, and enabling screening does not change existing account passwords or revoke sessions.

The [Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords) is free and requires no API key. Colvin sends only the first five hexadecimal characters of a SHA-1 hash over HTTPS, requests padding and matches the remaining suffix locally. It checks complete submitted passwords on the server, rather than querying while the user types. SHA-1 here is a range-lookup protocol; bcrypt remains the password-storage algorithm.

Only HTTP 200 with a valid, nonempty suffix/count range is accepted. Malformed counts, unsafe integers, malformed rows, oversized responses, redirects, timeouts and network failures cannot become a clean result. The streamed response is limited to 1 MiB. The request and body read use the existing `PASSWORD_COMPROMISE_TIMEOUT_MS` timeout (default 4000 ms). Zero-count padding is not a breached match. Logs contain only the provider, failure kind and optional HTTP status; no password, full hash, suffix or raw provider error/body is logged.

A positive match returns `400 COMPROMISED_PASSWORD`. Provider failure returns `503 PASSWORD_SCREENING_UNAVAILABLE` without saving the proposed password. Existing generic 5xx response envelopes remain in effect.

## Enable in Railway staging

1. Merge the reviewed screening PR after all three CI checks pass. Wait for the staging **api-gateway** deployment containing that merge to succeed.
2. Reconnect to the deployed staging gateway with `railway ssh` so the check runs in the current container. First test live connectivity and screening in a separate process, without changing the running gateway's setting:

   ```bash
   cd /app/apps/api-gateway
   PASSWORD_COMPROMISE_CHECK=hibp node scripts/check-password-screening.mjs
   ```

   Expected output:

   ```text
   Known breached sample: rejected.
   Generated sample: accepted.
   HIBP password screening check passed.
   ```

   This noninteractive probe uses a public breached sample and an ephemeral random sample. It neither reads nor changes any account, sends email, or prints a password/hash. A failed probe exits nonzero; investigate the bounded HIBP diagnostic before changing the persistent setting or accepting this gate.

3. Only after the live probe passes, in **staging → api-gateway → Variables**, set `PASSWORD_COMPROMISE_CHECK=hibp`. Keep `NODE_ENV=development` for this checkpoint. Apply the variable change and let the new deployment complete.
4. Reconnect to the new deployment and run `node scripts/check-password-screening.mjs` from `/app/apps/api-gateway`, without an environment override. Expect the same success output; this confirms the persistent setting is active.
5. Through the staging website's registration form, submit the unused address `hibp-check@example.invalid` with the public test password `Password123!`. Expect a compromised-password error and no account creation. Do not use this public sample as a real account password.
6. Sign in to an existing account with its real password, refresh and run a VIN lookup. No existing password needs changing to validate this gate.

If the provider is temporarily unavailable, new-password operations intentionally remain blocked. Investigate network/TLS availability and the bounded diagnostic rather than disabling production screening. The prior staging opt-out was `disabled`; returning to it would leave only the local deny-list and is not a passing result for this gate.

## Next checkpoint: production mode in staging

After the live checks above pass, validate the production configuration without changing the running service:

```bash
NODE_ENV=production node --input-type=module -e 'await import("./src/config/env.js"); console.log("Production configuration validation passed")'
```

Run this from `/app/apps/api-gateway` inside the staging SSH session. It validates required production configuration in a separate process and does not connect to PostgreSQL or change Railway variables. It does not prove runtime readiness or complete the production-mode transition. The later controlled transition must also verify database/Redis readiness, secure cookies, authentication, email delivery and a VIN lookup, with a recorded rollback deployment.

The custom sending domain remains postponed. Resend's temporary sender still limits live email tests to its permitted recipient; HIBP activation does not remove that restriction. Monitoring, backup/restore, rollback rehearsal and final security acceptance remain separate pending gates.
