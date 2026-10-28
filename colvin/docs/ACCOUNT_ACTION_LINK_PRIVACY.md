# Gate 8B — Account-action link privacy

## Reason for the rollout

Existing reset and verification emails carry an opaque token in a query string. Normal proxy request logs can include that query and the page referrer. Removing the URL after React mounts does not prevent the first document request from reaching the proxy. The server-side token still identifies exactly one user and remains subject to existing expiry, hashing, purpose and single-use checks.

The intended email format is a fragment (`#token=...`), which browsers do not send with the document request. See [MDN URI fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment). This change requires compatible frontend readers before the gateway starts generating the new format. [OWASP's reset guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) also recommends a `no-referrer` policy for reset pages.

## Phase 1 — Compatible readers and request-log privacy

This patch does **not** change generated emails. It prepares both reset and verification pages to read a single token from either the existing query format or the future fragment format. Empty, duplicate, conflicting and out-of-bounds tokens are rejected. A changed token gets a fresh form state. URL cleanup removes the query/fragment while preserving router history metadata; tokens are not put into browser storage or rendered text.

The frontend serves `no-referrer` and non-cached HTML, with an early no-referrer meta policy for development and production. Hashed static assets retain their existing cache policy. Nginx normal access logs use JSON with the original path, status, timing and request ID, excluding query strings, referrers and cookies. Template substitution is restricted to the two existing upstream/resolver variables.

Gateway normal HTTP logs allow only diagnostic request fields and omit query objects/URL queries. Incoming referrers join existing credential-header redaction. Structured internal Axios error request headers are also redacted; useful failure codes remain. Request handlers still receive their original query, headers and bodies.

CI exercises the actual forms with both link formats, verifies URL-reader/cleanup behavior and checks HTTP serializer privacy. Container Smoke sends only synthetic values through the built frontend/gateway, verifies HTML privacy headers/meta policy and confirms the synthetic query/cookie/referrer does not appear in observed proxy and gateway completion logs.

After merging and successful deployments, use a fresh browser tab on the staging frontend and open these two paths with the public placeholder below:

```text
/reset-password#token=Colvin_fragment_probe_00000000000000000000
/verify-email#token=Colvin_fragment_probe_00000000000000000000
```

The token part should disappear from the address bar. The reset page should show an enabled reset button without a missing-token error; the verification page should show its Verify email button. Do not submit either form: this placeholder is not an account token, and this reader check requires no password change or email request. Also confirm an ordinary login/refresh and the runtime check remain successful after deployment.

## Phase 2 — Generate fragment links

The sender change is prepared in a separate draft: reset and verification emails now place their encoded token in `#token=...`, with no URL query. The backend token format, database record, purpose, expiry, hashing and single-use validation are unchanged. The PR #14 query reader remains for previously issued emails.

**Rollout remains pending:** PR #14 merged and its four staging deployments succeeded. The owner reported all four runtime checks passing again on October 28. The two fragment-page browser results and ordinary login/refresh have not yet been explicitly confirmed. Keep this sender change in draft until those results are available; a runtime pass does not prove browser token capture/address cleanup.

Automated coverage validates both generated email links through the actual frontend token reader. Integration tests mock only delivery to Resend and use isolated synthetic users in the CI database: a reset changes only its target account, revokes only that account's server-side refresh sessions, rejects replay and preserves the other account's password/session. A verification token verifies only its target, cannot reset a password and cannot be reused. No live account or real email is used by these tests.

After browser acceptance, review/merge the sender change, wait for deployment, and use the permitted Resend testing account in a separate private window for a new reset email. Confirm the email targets the expected staging frontend with `#token=`, open it, change that testing account's password, and sign back in. Confirm the original account still accepts its own credentials. Use the correct saved entry for each email and do not share actual token URLs or passwords.

The existing reset response clears the current browser refresh cookie. If accounts share a browser cookie jar, this may require another sign-in even though the other account's database password and server-side session remain unchanged. A private testing window separates that browser state; no original-account password change is required.

Verification-link generation/confirmation retains automated coverage. Live verification delivery remains subject to the temporary sender's existing recipient restriction; do not alter verification state on an existing account just to force another email.

### Tracking and rollback

[Resend documents domain-level click/open tracking as disabled by default](https://resend.com/blog/introducing-custom-tracking-domain). This patch does not inspect or change provider/domain settings and does not implement an undocumented per-email bypass. Keep tracking disabled for authentication mail and verify the delivered link's destination/fragment before accepting delivery; investigate unexpected rewriting at the email provider/client. The temporary sender and postponed custom domain remain as configured. Fragment tokens are still present in the email and browser memory, and do not protect against a compromised email account or frontend script.

Once fragment emails are issued, preserve a frontend at PR #14's commit `bd1f3f6eebc1939f149ab97f02d4a1523f41cc56` or a compatible later version. A gateway-only rollback to the PR #14 query sender remains compatible with that frontend and with existing fragment links. Do not roll the frontend back to a query-only reader while fragment links remain in use. Inspect variable effects before a Railway deployment rollback so current credentials and production security settings are retained. This documents compatibility requirements; it is not a completed rollback rehearsal.

## Limits and next gates

Phase 1 protects normal request/access logs; it does not erase historical logs or guarantee that legacy query tokens cannot appear in proxy error logs. The deployed sender stays in the legacy format until the draft phase-2 change is accepted and deployed. Keep external log drains pending until the rollout and log-source review are complete. Monitoring/alerts, rollback rehearsal and backup/restore acceptance remain separate work in [staging operations](STAGING_OPERATIONS.md).
