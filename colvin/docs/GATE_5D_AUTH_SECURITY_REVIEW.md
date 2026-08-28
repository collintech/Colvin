# Gate 5D — Final authentication security review

Gate 5D closes the authentication hardening phase with a deliberately small set of security controls rather than another feature expansion.

## Refresh-token concurrency

Refresh tokens still rotate on every use. A rotated token reused outside `REFRESH_REUSE_GRACE_SECONDS` is treated as a replay and revokes its entire family. Reuse inside the short grace window is treated as a recoverable multi-tab race and returns `REFRESH_ALREADY_ROTATED` without clearing the browser cookie. The web client retries refresh once so it can use the replacement cookie already set by the winning tab.

This grace window is intentionally short. It is not a general replay bypass.

## Compromised-password screening

New passwords pass a small local deny-list in all environments. Production additionally requires `PASSWORD_COMPROMISE_CHECK=hibp` and queries the Have I Been Pwned Pwned Passwords range API using the first five characters of a SHA-1 hash. The full password and full hash are never transmitted. `Add-Padding: true` is used to reduce response-size information leakage.

Production fails closed if password screening is unavailable rather than silently accepting an unchecked password.

## Password-reset enumeration resistance

Password-reset request responses remain generic for known and unknown addresses. The service enforces a minimum response duration with `PASSWORD_RESET_MIN_RESPONSE_MS`. This reduces trivial timing enumeration, although infrastructure-level telemetry and rate controls should still be monitored for abuse.

## Email delivery resilience

Transactional account email retries retryable Resend failures with bounded exponential backoff. If a reset or verification email cannot be delivered, the generated action token is revoked so an undelivered token is not left active.

## Error envelopes

5xx API responses no longer include `error.details`. Internal upstream diagnostics remain server-side only.

## MFA readiness

MFA is not enabled by this gate. Colvin currently has no privileged administration console exposed to end users, so introducing incomplete MFA state or secret storage would add risk without a protected workflow. The RBAC layer from Gate 5B is the enforcement point where authentication assurance can be added. Before any production admin console or other high-impact permission is exposed, require a dedicated MFA/WebAuthn implementation and recovery policy rather than a cosmetic `mfa_enabled` flag.

## Definition of done

Gate 5D is complete only after both `npm run quality` and `npm run test:integration` pass locally. The integration suite verifies that concurrent refresh requests do not invalidate the winning session, replay outside the grace window still revokes the family, compromised local passwords are rejected, password-reset responses are padded, and the existing account-lifecycle/session revocation regressions remain green.
