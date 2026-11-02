# Gate 8B — Controlled staging API Gateway rollback

## Purpose and scope

Status: **accepted on November 2, 2026**. The owner supplied passing four-check runtime reports for both restored releases, reported successful login, logout, refresh and VIN lookup, and confirmed that PR #18 was active at the end. GitHub deployment statuses associated each restored deployment with its release even though both runtime reports had `commitSha: null`.

| Accepted record                                               | Deployment ID                          | Source release                             |
| ------------------------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| Healthy PR #18 candidate before restoration                   | `51398338-3f26-465e-a330-680a47160413` | `fabe97e689e561bc100905fd1d79717e75e87a3a` |
| Restored PR #17; all four checks passed                       | `b26380aa-a724-42c0-abed-39743d26a3a6` | `99df75addcdbfc7302b781aa0d26ff80c7c5ea5f` |
| Restored PR #18; all four checks passed; active at acceptance | `3f7d8856-6279-4758-a58c-2ad1ce2aaf91` | `fabe97e689e561bc100905fd1d79717e75e87a3a` |

This accepts the compatible gateway deployment-restore rehearsal. The two releases differed only in documentation; it does not establish database recovery, schema reversal or rollback compatibility for arbitrary future code changes. Next is [backup retention and an isolated restore](STAGING_BACKUP_RESTORE.md). Do not repeat the completed rehearsal. The procedure below remains for a future exercise using newly verified deployment records.

PR #18 was the documentation-only candidate. Its application source, schema and dependency lockfiles matched PR #17. Both supported fragment emails, cookie-log privacy and the public status endpoint. Only the staging API Gateway participated in rollback actions. Future rehearsals must review the chosen pair's compatibility and keep current credentials/security settings; this accepted pair is historical evidence, not a permanently current target.

## Target and release records

| Record                         | Value                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Railway project                | `a0803155-bc22-4311-ac90-43ab3582550e`                                                                     |
| Railway environment            | `staging` — `ce8f6930-5c13-46f6-955c-8f62018223af`                                                         |
| Service                        | `api-gateway` — `461fb555-09f6-489c-bcc0-f92313a6f0f4`                                                     |
| Accepted PR #17 source commit  | `99df75addcdbfc7302b781aa0d26ff80c7c5ea5f`                                                                 |
| Original PR #17 deployment row | `c1b3c406-c807-40d1-8d0f-98c3763c7fec` — historical rehearsal record, not a current expected deployment ID |
| Original PR #18 candidate row  | `51398338-3f26-465e-a330-680a47160413`, source `fabe97e689e561bc100905fd1d79717e75e87a3a`                  |

[Railway's Rollback action](https://docs.railway.com/deployments/deployment-actions) restores the selected successful image **and its custom variables**. Keep approved variables, credentials and service references unchanged during this rehearsal. If any such setting changes after baseline capture, establish a new baseline/candidate pair before proceeding. Retain `NODE_ENV=production`, HIBP, verified PostgreSQL TLS, secure cookies and the current Resend configuration.

[Hobby retains removed images for 72 hours](https://docs.railway.com/pricing/plans). Complete the exercise within that window after a deployment is replaced. If **Rollback** is unavailable, do not substitute **Redeploy** and claim image-rollback acceptance: Redeploy rebuilds from the selected deployment's source/configuration. Prepare a fresh eligible pair instead.

## Phase 1 — Identify a fresh baseline for a future rehearsal

Open the Colvin Railway project, select **staging**, then **api-gateway**. Reconnect to its current container through Railway SSH and run:

```bash
cd /app/apps/api-gateway
node scripts/check-staging-runtime.mjs
```

All four checks must pass. Save the bounded report and match its deployment/source identity to the active deployment row. Use that freshly verified ID with `--expect-deployment` for subsequent checks; add `--expect-commit` only when Git metadata is available and verified. Do not reuse an earlier release's pinned ID after another deployment has replaced it. Confirm both real Better Stack monitors remain healthy and the temporary alert-test monitor is paused. There must be no staged variable/configuration changes.

If the expected identity does not match, do not change variables to force a pass or choose another historical image by guesswork. Identify the current active deployment and establish the actual healthy baseline first. A GitHub success status alone is not a fresh runtime identity check.

## Phase 2 — Deploy and record the candidate

After the baseline is recorded and the reviewed compatible candidate's three CI jobs pass, deploy that candidate to the staging API Gateway. Record its **successful deployment row ID** and actual merged main commit as the candidate to restore later. This is the merge SHA, not the earlier PR-head SHA. The accepted November 2 exercise used PR #18; a future exercise needs current records.

Reconnect to the candidate container and run the runtime command with `--expect-deployment` and `--expect-commit` using those exact recorded values. Check the public frontend `/api/v1/status` response is HTTP 200 with `{"status":"ok"}` and both real monitors are healthy. The candidate is accepted for the rehearsal only after these checks pass. Keep variables unchanged.

## Phase 3 — Restore the baseline image

1. In **staging → api-gateway → Deployments**, locate the exact successful baseline row recorded in phase 1.
2. Open that row's three-dot menu and select **Rollback**. Read the confirmation and verify it targets the baseline for this same staging service.
3. Wait for the restored deployment to become active. Railway creates a **new deployment ID** when restoring an image; record that new ID rather than expecting the original baseline row ID to become active again.
4. Reconnect through SSH and run `node scripts/check-staging-runtime.mjs`. Match the new deployment ID to Railway's active row and the source commit to the recorded baseline when Git metadata is present. If `commitSha` is `null` because the restore has no Git-trigger metadata, verify the selected source/image in Railway rather than inventing a SHA or treating health alone as proof of the image identity.
5. Require all four runtime checks, the public status JSON and both monitors to be healthy. In the browser, confirm login/session refresh and one known VIN report work. Do not reset a password for this exercise.

Record this phase's deployment ID and results. The two real monitors stay active; if an incident occurs, record its recovery as part of the exercise.

## Phase 4 — Restore the candidate image

Use the **candidate's successful deployment row saved in phase 2**, not the baseline row, for this action. Its image is now a previous deployment, so Railway's action to restore it is also named **Rollback**. In this phase that action returns the service to the candidate release.

1. Open the saved candidate row's three-dot menu, select **Rollback**, and verify the selected candidate identity in the confirmation.
2. Wait for the newly restored candidate to become active and record its new deployment ID.
3. Reconnect through SSH, run the runtime check and verify identity as in phase 3, now against the candidate source/image. Require all four checks, public status JSON and both real monitors to be healthy. Confirm browser login/session refresh and the known VIN report again.

Use the recorded image row rather than deploying whatever a moving branch happens to contain. Both restore actions must retain the approved production-mode settings and current credentials.

## Acceptance and remaining gates

The November 2 acceptance records above close this exercise. For future rehearsals, record the date, original baseline row/source SHA, original candidate row/source SHA, both newly restored deployment IDs, bounded runtime results and browser/monitor outcomes. Keep credential values and session data private. Mark a new rehearsal accepted only after both restore directions pass and the service ends on the candidate release.

This proves a platform image-restore path between compatible application versions. It does not test schema reversal, database/data restoration or arbitrary old-code compatibility. Backup retention and restore into an isolated target remain the next separate gate. Final launch acceptance, general-user email delivery and broader production observability also remain pending.
