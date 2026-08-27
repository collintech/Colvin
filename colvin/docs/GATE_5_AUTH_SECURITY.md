# Gate 5 — Authentication & Authorization

## Gate 5A security foundation

Colvin's browser authentication model uses a short-lived bearer access token plus a rotating refresh token.

- The access token is held only in JavaScript memory and is not persisted to `localStorage` or `sessionStorage`.
- The refresh token is never returned in JSON. It is stored in an `HttpOnly` cookie.
- Production refresh cookies use the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`.
- Refresh tokens rotate on every successful refresh.
- Refresh-token families are tracked in PostgreSQL. Reuse of a previously rotated token revokes the family.
- Logout revokes the current refresh-token family; `logout-all` revokes every refresh token belonging to the authenticated user.
- State-changing browser auth routes verify browser origin/fetch metadata as CSRF defense in depth.
- Login, registration, and refresh endpoints have dedicated rate limits in addition to the API-wide limiter.
- RBAC is implemented through `authorizeRoles(...)`; roles are still `user` and `admin` at this stage.

## Deliberate Gate 5B follow-up

Gate 5A does not yet close Gate 5. The next security increment must cover durable/distributed login-abuse controls, authentication audit events, password-change/reset flows, email verification, multi-tab refresh-race handling, and a formal authorization matrix for admin/product operations.
