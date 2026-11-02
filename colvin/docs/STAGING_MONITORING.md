# Gate 8B — Staging monitoring on Railway Hobby

## Accepted checkpoint — November 2, 2026

The owner confirmed the Railway workspace uses **Hobby**. Keep that plan. PR #16's acceptance checkpoint is merged and all three CI checks passed. The live fragment-email reset check remains complete; this monitoring work requires no password reset.

PR #17 passed Quality, Integration and Container Smoke, merged as `99df75addcdbfc7302b781aa0d26ff80c7c5ea5f` and deployed. The owner configured both real monitors and reported them healthy. On November 2, the assistant independently checked `/healthz` and `/api/v1/status`: both returned HTTP 200 with their expected bodies; the deliberate missing API path returned HTTP 404.

The owner then reused the spare `google.com` monitor for the temporary alert test, changed its URL to the deliberate failure path and restored the healthy URL. The owner confirmed that both the failure and recovery emails arrived and that the temporary monitor was paused. **Baseline external availability monitoring and failure/recovery email delivery have passed.** Keep both real Colvin monitors active. Do not repeat the completed exercise.

The accepted gateway deployment is `c1b3c406-c807-40d1-8d0f-98c3763c7fec`, with web deployment `9e8eb752-638f-4e39-ae23-e85ed30f86bc`. Acceptance is based on the reported results and the direct endpoint checks; exact monitor IDs and email delivery times were not supplied. No alert-delivery latency guarantee is inferred. Resource thresholds, application telemetry and business/provider checks remain outside this baseline's scope. Next is the [controlled staging rollback](STAGING_ROLLBACK.md).

## Monitoring service

Use an external monitor so a Railway outage can be detected from outside Railway. [Better Stack's current free tier](https://betterstack.com/pricing/) includes 10 monitors/heartbeats and email alerts; its [free check frequency](https://betterstack.com/docs/uptime/check-frequency/) is three minutes. Select the free account option available for this development project. Keep Railway Hobby and use the free monitoring allowance; this change adds no monitoring container, agent, paid responder or telemetry SDK. Review current plan terms again before launch.

The owner creates/signs into the monitoring account and chooses an email address they control for alerts. This is a monitoring-provider account, separate from both Colvin test accounts and the Resend sender setup. Colvin does not send these alerts through Resend, and no Resend key or Colvin login cookie belongs in the monitor configuration.

## Endpoint contracts

The accepted HTTPS frontend origin is `https://web-client-staging-1178.up.railway.app`. Append the lowercase paths below. `/Api/v1/status` does not match Nginx's `/api/` proxy and may load the React application instead; a frontend HTTP 200 is not proof that the dependency endpoint ran.

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

The owner applied the monitor setup in Better Stack. Monitor timing includes the check interval, confirmation/recovery periods and delivery latency; it is not an instant notification guarantee. The following field mapping records the setup instructions used with the current form; it is not a claim that every saved provider setting was independently inspected.

| Form field                                       | Setup value                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Alert us when                                    | URL becomes unavailable; keyword matching is not required                              |
| URL to monitor                                   | The frontend origin plus `/api/v1/status` for dependencies, or `/healthz` for the edge |
| How should we escalate incidents?                | Notify the primary responder; confirm the owner in Who's on-call?                      |
| Notification channels                            | E-mail enabled; Call, SMS, Push and Critical alert disabled                            |
| If the primary responder does not acknowledge    | Do nothing                                                                             |
| Pronounceable monitor name                       | A recognizable Colvin label; the two names may differ from this guide                  |
| Recovery period / Confirmation period            | One minute each                                                                        |
| Check frequency                                  | Three minutes                                                                          |
| Internet Protocol version                        | IPv4 only; a November 2 public DNS check returned an A record and no AAAA record       |
| SSL/TLS verification                             | On                                                                                     |
| SSL expiration / Domain expiration               | Don't check; leave the upgrade-only expiry options disabled                            |
| Expiration notification                          | Leave unchanged while expiry checks are disabled                                       |
| HTTP method / Request timeout                    | GET / ten seconds                                                                      |
| Request body / Custom headers                    | Empty; grey examples are placeholders                                                  |
| Follow redirects / Keep cookies when redirecting | Both unchecked                                                                         |
| Basic HTTP username/password / Proxy host/port   | Empty; no Colvin, Resend or internal credentials are required                          |
| Maintenance window                               | Start and end times empty; day buttons unchanged                                       |
| Maintenance timezone                             | Africa/Lagos, UTC+01:00                                                                |
| Regions                                          | Europe, North America, Asia and Australia selected                                     |
| GitHub badge / Metadata                          | No badge action or metadata needed                                                     |

## Prove failure and recovery alerts without interrupting Colvin

This procedure passed on November 2. It remains here for a future notification change that requires another acceptance test. Use only a spare temporary monitor, reusing the paused test monitor if appropriate. Keep the two real monitor targets unchanged throughout.

1. Start the temporary monitor at the same frontend `/api/v1/status` URL with the same interval, timeout and recipient. Wait for it to show healthy.
2. Change only that temporary monitor's path to `/api/v1/monitoring-probe-not-found`. This deliberately absent API route returns HTTP 404 rather than the SPA fallback. Wait for the monitor to report failure and for its failure email to arrive. Record the event and delivery times.
3. Restore the temporary monitor to `/api/v1/status`. Wait for it to show recovered/resolved and confirm receipt of the recovery email. Record the event and delivery times.
4. Pause or delete the temporary monitor. Confirm both real monitors remain healthy and active.

This exercises an actual HTTP failure detector and its notification/recovery path. It does not simulate a database outage. Automated tests separately cover failed PostgreSQL/Redis/history/decoder checks, timeout handling, caching, recovery and generic HTTP responses. Container Smoke checks the real public route through built Nginx, with PostgreSQL, Redis and both Go services running, and verifies the deliberate 404 path.

## Acceptance record

The baseline acceptance above is complete. For future changes, report only the monitor names, paths, configured timing, healthy/failure/recovery results and available event/delivery times. Keep the recipient address, provider account details and credentials private. Record the accepted gateway deployment and commit. Do not present this baseline as database-outage simulation, backup recovery or full production observability acceptance.

If the dependency monitor fails, inspect the existing bounded Railway diagnostics and run the [staging runtime command](STAGING_RUNTIME_CHECK.md) in the current gateway container. Do not change security variables, expose private services or reset accounts to make a monitor pass. Continue to rollback rehearsal and isolated backup/restore acceptance after monitoring delivery is proven.
