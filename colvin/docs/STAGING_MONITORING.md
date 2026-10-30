# Gate 8B — Staging monitoring on Railway Hobby

## Current state — October 30, 2026

The owner confirmed the Railway workspace uses **Hobby**. Keep that plan. PR #16's acceptance checkpoint is merged and all three CI checks passed. The live fragment-email reset check remains complete; this monitoring work requires no password reset.

This change prepares a public dependency-status endpoint and its automated coverage. Continuous monitoring and alert delivery are **pending** until the change is merged/deployed, the owner configures the external monitors and the failure/recovery exercise below passes.

## Monitoring service

Use an external monitor so a Railway outage can be detected from outside Railway. [Better Stack's current free tier](https://betterstack.com/pricing/) includes 10 monitors/heartbeats and email alerts; its [free check frequency](https://betterstack.com/docs/uptime/check-frequency/) is three minutes. Select the free account option available for this development project. Keep Railway Hobby and use the free monitoring allowance; this change adds no monitoring container, agent, paid responder or telemetry SDK. Review current plan terms again before launch.

The owner creates/signs into the monitoring account and chooses an email address they control for alerts. This is a monitoring-provider account, separate from both Colvin test accounts and the Resend sender setup. Colvin does not send these alerts through Resend, and no Resend key or Colvin login cookie belongs in the monitor configuration.

## Endpoint contracts

Use the existing HTTPS **web-client staging origin** from Railway and append the paths below. The illustrative origin `https://colvin.example.invalid` is not a working deployment URL.

| Monitor                       | Path             | Healthy result                   | Coverage                                                                                            |
| ----------------------------- | ---------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Colvin staging — web edge     | `/healthz`       | HTTP 200, text `ok`              | Public DNS/TLS and Nginx liveness                                                                   |
| Colvin staging — dependencies | `/api/v1/status` | HTTP 200, JSON `{"status":"ok"}` | Public edge/proxy, gateway PostgreSQL and Redis, history-service readiness and VIN-decoder liveness |

The dependency endpoint returns HTTP 503 with only `{"status":"unavailable"}` when a required check fails, times out or returns an unexpected response. It exposes no dependency names, errors, internal hosts, URLs, deployment metadata or credentials, and sets `Cache-Control: no-store`. It is public and requires no authentication. Existing request rate limits still apply.

Checks run concurrently with a four-second response deadline. Results are shared for ten seconds per gateway replica, including failures; simultaneous requests share one background check. If a check outlives the public deadline, it stays the sole background check until its underlying work finishes. The gateway database probe uses only `SELECT 1` with a two-second query timeout, plus the existing connection/pool timeout. Go health responses are limited to 16 KiB and redirects are refused. No VIN-provider lookup, email send, HIBP request or account mutation occurs.

This is a strict dependency-health signal. Redis degradation triggers its 503 even though the existing API may continue serving traffic without its cache. Existing `/ready` semantics remain unchanged. VIN liveness does not prove external data-provider availability, and neither monitor proves browser JavaScript, login or email delivery. Resource thresholds, error-rate/latency telemetry and provider/business checks remain separate acceptance work. No logs are exported by these HTTP checks.

## Configure after successful deployment

1. Confirm the reviewed change has merged and the new staging gateway deployment succeeded. Open the frontend `/api/v1/status` URL and expect HTTP 200 with `{"status":"ok"}`. A React HTML page, redirect or 404 means the intended route is not available; do not treat that as a healthy dependency monitor.
2. Create the two named monitors above. [Better Stack's setup guide](https://betterstack.com/docs/uptime/monitoring-start/) describes creating an HTTP monitor and selecting an alert recipient. Use HTTP **GET**, HTTPS certificate verification enabled, the three-minute free interval and a ten-second request timeout. Do not add authentication, cookies or secret query parameters.
3. For the dependency monitor, require a successful HTTP status and, where the free account exposes the option, the response keyword `"status":"ok"`. The endpoint uses HTTP 503 for failure, so the HTTP-status check still detects dependency failure without a keyword feature.
4. Enable email alerts to the owner-controlled recipient. A suggested starting [confirmation/recovery period](https://betterstack.com/docs/uptime/confirmation-and-recovery-period/) is 60 seconds each; record the actual values offered by the account. Both monitors must show healthy before exercising alerts.

The settings above are operator configuration, not actions performed by this PR. Monitor timing includes the check interval, confirmation/recovery periods and delivery latency; it is not an instant notification guarantee.

## Prove failure and recovery alerts without interrupting Colvin

Use a third, temporary monitor named **Colvin staging — alert delivery test**. Keep the two real monitor targets unchanged.

1. Start the temporary monitor at the same frontend `/api/v1/status` URL with the same interval, timeout and recipient. Wait for it to show healthy.
2. Change only that temporary monitor's path to `/api/v1/monitoring-probe-not-found`. This deliberately absent API route returns HTTP 404 rather than the SPA fallback. Wait for the monitor to report failure and for its failure email to arrive. Record the event and delivery times.
3. Restore the temporary monitor to `/api/v1/status`. Wait for it to show recovered/resolved and confirm receipt of the recovery email. Record the event and delivery times.
4. Pause or delete the temporary monitor. Confirm both real monitors remain healthy and active.

This exercises an actual HTTP failure detector and its notification/recovery path. It does not simulate a database outage. Automated tests separately cover failed PostgreSQL/Redis/history/decoder checks, timeout handling, caching, recovery and generic HTTP responses. Container Smoke checks the real public route through built Nginx, with PostgreSQL, Redis and both Go services running, and verifies the deliberate 404 path.

## Acceptance record

Report only the monitor names, paths, configured timing, healthy/failure/recovery results and event/delivery times. Keep the recipient address, provider account details and credentials private. Record the accepted gateway deployment and commit. This gate remains pending until both real monitors are active and the temporary monitor's failure and recovery emails are confirmed.

If the dependency monitor fails, inspect the existing bounded Railway diagnostics and run the [staging runtime command](STAGING_RUNTIME_CHECK.md) in the current gateway container. Do not change security variables, expose private services or reset accounts to make a monitor pass. Continue to rollback rehearsal and isolated backup/restore acceptance after monitoring delivery is proven.
