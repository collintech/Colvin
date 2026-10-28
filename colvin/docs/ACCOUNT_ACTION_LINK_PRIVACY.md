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

Only after the deployed readers pass phase 1, prepare a separate reviewed gateway change to generate fragment-based reset and verification email links. Retain query-reader compatibility for previously issued emails through their existing expiration. Review email click-tracking/link rewriting as part of sender acceptance; fragment tokens are still present in the email and browser memory, and are not protection from a compromised email account or frontend script.

Then verify a new reset email using the permitted Resend testing recipient, its fragment link, successful reset and re-login, and continued original-account access. Verification-link generation/confirmation must retain automated coverage; live verification delivery is subject to the temporary sender's existing recipient restriction. This phase is pending.

## Limits and next gates

Phase 1 protects normal request/access logs; it does not erase historical logs or guarantee that legacy query tokens cannot appear in proxy error logs. Generated emails remain in the legacy format until phase 2. Keep external log drains pending until the rollout and log-source review are complete. Monitor metrics/alerts, rollback rehearsal and backup/restore acceptance remain separate work in [staging operations](STAGING_OPERATIONS.md).
