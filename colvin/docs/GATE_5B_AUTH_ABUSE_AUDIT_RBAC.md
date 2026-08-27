# Gate 5B — Auth Abuse Protection, Audit Events, and RBAC

## Security contract

- Authentication abuse counters are coordinated through Redis across API Gateway replicas.
- The existing process-local limiters remain active as fallback defense if Redis is unavailable.
- Redis limiter keys contain SHA-256 hashes rather than raw email addresses or IP addresses.
- Durable PostgreSQL audit identifiers use a keyed HMAC so persistent email/IP pseudonyms are not plain unsalted hashes.
- Authorization is permission-based and defined centrally in `src/authz/policy.js`.
- `user` and `admin` are the current roles; new routes should request permissions, not hard-code role strings.

## Audit table

Migration `004_auth_abuse_audit.sql` creates `auth_audit_events` with event type, outcome,
optional user ID, keyed-HMAC subject/IP identifiers, request ID, bounded user-agent text, metadata,
and timestamp indexes.

## Abuse-control policy

Defaults are configurable through environment variables. Login applies both account-scoped and
IP-scoped Redis counters. Registration and refresh apply IP-scoped counters. Fixed-window keys
expire automatically.

If Redis fails, the distributed guard logs the degradation and allows the request to continue to
the existing local limiter. This prevents a cache outage from becoming a global authentication
outage while retaining baseline throttling.

## RBAC policy

Permissions are centralized in `src/authz/policy.js`. Current user permissions cover self account
read, self session revocation, VIN lookup, and history read. Admin inherits those permissions plus
admin audit-read and user-management permissions for future admin routes.
