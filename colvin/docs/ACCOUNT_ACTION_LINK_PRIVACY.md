# Gate 8B — Account-action link privacy

## Verified checkpoint — October 29, 2026

PR #15 merged as `d50a3fd3ce3066c17982a7a6dda01dad7103a8a6`, and all four Railway staging deployment statuses reported success. The owner tested a newly delivered reset email in a private window and confirmed the `/reset-password#token=...` format, URL token removal, successful password reset and subsequent testing-account sign-in. The original account still accepted its own existing credentials. The live fragment-reset acceptance is complete; do not repeat it or the earlier compatible-reader tests.

The accepted gateway deployment is `07fe2e97-724c-44cb-aede-cfb066862360`, with web deployment `f7dc3877-bc31-490e-9a1a-65dffaded034`. These references identify the release; the reported browser checks do not establish continuous monitoring or a new four-check runtime result for this release. Verification-link generation, reader compatibility, purpose binding and single-use behavior retain automated coverage; another live verification email was not required for this reset acceptance.

Continue with monitoring and alert delivery in [staging operations](STAGING_OPERATIONS.md). The rollout procedures below remain as implementation and future-release guidance.

## Reason for the rollout

Before PR #15, reset and verification emails carried an opaque token in a query string. Normal proxy request logs can include that query and the page referrer. Removing the URL after React mounts does not prevent the first document request from reaching the proxy. The server-side token still identifies exactly one user and remains subject to existing expiry, hashing, purpose and single-use checks.

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

PR #15 changed newly generated reset and verification emails to place their encoded token in `#token=...`, with no URL query. The backend token format, database record, purpose, expiry, hashing and single-use validation are unchanged. The PR #14 query reader remains for previously issued emails. This sender change is merged, deployed and accepted for the live reset flow recorded above.

**Reader acceptance is complete:** PR #14 merged and its four staging deployments succeeded. All four runtime checks passed, and on October 29 the owner confirmed that both fragment-page browser tests had passed, including a repeat check. The earlier login/refresh checks also passed. PR #15 then passed Quality, Integration and Container Smoke, merged and deployed. Its live reset-email acceptance is complete. Do not repeat these completed checks.

Automated coverage validates both generated email links through the actual frontend token reader. Integration tests mock only delivery to Resend and use isolated synthetic users in the CI database: a reset changes only its target account, revokes only that account's server-side refresh sessions, rejects replay and preserves the other account's password/session. A verification token verifies only its target, cannot reset a password and cannot be reused. No live account or real email is used by these tests.

For a future change that requires another live email acceptance, wait for successful deployment and use the permitted Resend testing account in a separate private window for a new reset email. Confirm the email targets the expected staging frontend with `#token=`, open it in that same private window, change that testing account's password, and sign back in. Confirm the original account still accepts its own credentials. Use the correct saved entry for each email and do not share actual token URLs or passwords. This procedure is already complete for PR #15.

The existing reset response clears the current browser refresh cookie. If accounts share a browser cookie jar, this may require another sign-in even though the other account's database password and server-side session remain unchanged. A private testing window separates that browser state; no original-account password change is required.

Verification-link generation/confirmation retains automated coverage. Live verification delivery remains subject to the temporary sender's existing recipient restriction; do not alter verification state on an existing account just to force another email.

### Tracking and rollback

[Resend documents domain-level click/open tracking as disabled by default](https://resend.com/blog/introducing-custom-tracking-domain). This patch does not inspect or change provider/domain settings and does not implement an undocumented per-email bypass. Keep tracking disabled for authentication mail and verify the delivered link's destination/fragment before accepting delivery; investigate unexpected rewriting at the email provider/client. The temporary sender and postponed custom domain remain as configured. Fragment tokens are still present in the email and browser memory, and do not protect against a compromised email account or frontend script.

Once fragment emails are issued, preserve a frontend at PR #14's commit `bd1f3f6eebc1939f149ab97f02d4a1523f41cc56` or a compatible later version. A gateway-only rollback to the PR #14 query sender remains compatible with that frontend and with existing fragment links. Do not roll the frontend back to a query-only reader while fragment links remain in use. Inspect variable effects before a Railway deployment rollback so current credentials and production security settings are retained. This documents compatibility requirements; it is not a completed rollback rehearsal.

## Limits and next gates

Phase 1 protects normal request/access logs; it does not erase historical logs or guarantee that legacy query tokens cannot appear in proxy error logs. New emails now use fragments. Review every proposed log source before exporting logs to an external provider; the live reset acceptance is not a blanket approval of historical or error-log contents. Monitoring/alerts, rollback rehearsal and backup/restore acceptance remain separate work in [staging operations](STAGING_OPERATIONS.md).
