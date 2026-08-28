# Gate 5C — Account lifecycle security

Gate 5C introduces credential and identity lifecycle controls for Colvin.

## Security model

- Password changes require the current password.
- Password reset requests return the same public response whether an account exists or not.
- Reset and email-verification tokens are 256-bit random values; only SHA-256 hashes are persisted.
- Account-action tokens are single-use and expire.
- Creating a new token invalidates older unused tokens for the same purpose.
- Password changes and password resets increment `users.auth_version` and revoke all refresh sessions.
- Access and refresh JWTs carry `auth_version`; protected requests compare the JWT version with the current database value.
- Gate 5C deployment deliberately revokes pre-5C refresh tokens because they do not contain `auth_version`.
- Password changes invalidate outstanding password-reset tokens.

## Email delivery

Production account-action email is sent through the configured email adapter. The current adapter uses the Resend REST API and requires production configuration for `RESEND_API_KEY` and `EMAIL_FROM`.

Integration tests set `EMAIL_PROVIDER=test`; the generated token is exposed only inside that test process. The API does not expose action tokens in development or production.

## Routes

- `POST /api/v1/auth/password/change`
- `POST /api/v1/auth/password/reset/request`
- `POST /api/v1/auth/password/reset/confirm`
- `POST /api/v1/auth/email/verification/request`
- `POST /api/v1/auth/email/verification/confirm`

## Operational note

`005_account_lifecycle.sql` causes a deliberate one-time re-login for existing sessions. This is safer than allowing refresh tokens created before the `auth_version` claim to remain ambiguous.
