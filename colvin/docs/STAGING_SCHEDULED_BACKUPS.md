# Gate 8B — Scheduled encrypted staging backups

Status: **implementation merged; owner setup in progress; scheduled runs and retention not yet accepted**. On November 6 the owner created the dedicated GPG recovery key, installed rclone 1.75.2 on Windows and created the Google Desktop OAuth client. Google OAuth publishing is blocked until the Branding URLs are provided; the public pages in this change still require owner merge and Pages enablement. Live worker configuration, scheduled execution, a new archive's isolated restore and freshness monitoring remain pending. The first manual encrypted backup/local restore and its private Google Drive upload are complete. The successful November 4 manual archive stays outside the worker's destination and deletion namespace. Do not repeat that drill or troubleshoot its already successful manual SSH prompts as a pending gate.

The owner reports intermittent power, with a usual local availability window of 11 PM–4 PM. That is useful for operator setup but does not ensure a Windows task can run every day. This design runs a short-lived **separate staging Railway cron service**, independently of the computer. It uses the private database network with verified TLS and a new SELECT-only role, encrypts with a public recovery key, uploads to its own private Drive folder, reads the encrypted file back to check SHA256, applies scoped retention when enabled and sends a success heartbeat only afterward. No SSH key or GPG decryption passphrase is stored in the worker.

## Proposed schedule, retention and cost

| Setting                     | Reviewable value                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New service                 | `backup-worker`, staging only, one replica, no public domain or attached volume                                                                                            |
| Root directory              | `/colvin`                                                                                                                                                                  |
| Config file                 | `/colvin/apps/backup-worker/railway.json`                                                                                                                                  |
| Dockerfile relative to root | `apps/backup-worker/Dockerfile`                                                                                                                                            |
| Schedule                    | `15 0,12 * * *` UTC: **01:15 and 13:15 WAT**, twice daily                                                                                                                  |
| Runtime bound               | Ten minutes, then TERM and KILL after 15 seconds; exits on completion; restart policy NEVER                                                                                |
| Intended resource limits    | 1 vCPU and 512 MiB RAM; verify the actual available controls before enabling                                                                                               |
| Recovery-point objective    | At most 24 hours proposed; the 12-hour interval leaves room to detect/recover one missed run, but is not an availability guarantee                                         |
| Retention                   | Latest 14 completed snapshots, plus the latest snapshot from each of four recent ISO weeks and three recent UTC calendar months; union of those sets, at most 21 snapshots |
| Initial deletion mode       | `BACKUP_RETENTION_APPLY=false`: report candidates, delete nothing until the first successful cloud run/restore and retention review                                        |
| Monitoring                  | Better Stack heartbeat, expected every 12 hours with a one-hour grace period and owner email alerts                                                                        |

[Railway cron](https://docs.railway.com/cron-jobs) starts the service on the UTC schedule and expects it to exit. A still-running execution causes the next one to be skipped; the process deadline protects against that. Scheduled times may vary by a few minutes. This uses the existing Hobby plan; it does **not** require native volume backup/PITR or a Pro upgrade. It **does create a new billable service** when the owner enables it.

[Container resource rates](https://docs.railway.com/pricing/plans) are $0.000463/vCPU-minute and $0.000231/GB-minute, plus $0.05/GB outbound traffic. At **62 runs/month, two minutes/run, 1 vCPU and 0.5 GB RAM**, the arithmetic is about **$0.072 compute/month**, before outbound traffic. The ten-minute/run case at those same caps is about **$0.359/month**. These are planning scenarios, not measured costs or a bill cap; startup/runtime, actual resource controls, database-side activity, other project usage and retries affect the bill. The Hobby usage allowance is shared with existing services, so an unchanged total bill cannot be promised. Check usage after the first runs. Do not create the service or enable billing changes just to merge the code.

## Accepted off-device manual copy

The owner uploaded `colvin-staging-20261104T131728Z-o0rZfPp6` beneath `Colvin Backups/staging` in the connected private Google Drive account. Metadata inspection found exactly three non-empty files: the 102,509-byte encrypted archive, 81-byte SHA256SUMS and 861-byte restore report. The folder and each file had only the owner permission. No encrypted archive was downloaded or opened by the assistant. This verifies presence and privacy, not a new restore of the Drive copy or unattended freshness.

## Operator setup — in progress

Perform the phases in order after the implementation's three CI checks pass and the new-service cost/design is reviewed. Do not paste credentials, OAuth tokens, private keys or backup files into ChatGPT, GitHub or CI logs. All new variables below belong only to the new staging worker. Keep current Postgres/app credentials, application references, TLS settings and production services unchanged.

### 1. Prepare a dedicated public recovery key on the Windows computer

Use Git Bash with GPG's terminal set. Create a new, clearly named backup key; preserve existing keys:

```bash
export GPG_TTY=$(tty)
gpg --quick-generate-key 'Colvin Staging Scheduled Backups' default default 1y
gpg --with-subkey-fingerprint --list-keys 'Colvin Staging Scheduled Backups'
```

Use a strong private-key passphrase in GPG's prompt. Record the full primary fingerprint and export **only its public key** for the worker using `gpg --armor --export FULL_PRIMARY_FINGERPRINT`. Keep the private key, its passphrase and recovery/revocation material under owner control, with a separate protected recovery copy; do not send them to Railway. The earlier manual archive remains protected by its original symmetric passphrase. Scheduled archives use this new recipient key and the existing restore command can decrypt them from the owner's keyring. Retain the old private key while any archive needs it, and validate replacement keys before expiry.

The setup requires the public-key text base64-encoded as one line, without altering its fingerprint. Public keys are not decryption secrets. The worker accepts one matching public key, rejects private-key material and lets GPG enforce its encryption capabilities and validity. Avoid `--yes` with key generation so an existing matching user ID is not silently duplicated.

### 2. Prepare narrowly scoped Google Drive authentication on the Windows computer

Use [rclone's official download](https://rclone.org/downloads/) and [Drive setup](https://rclone.org/drive/#making-your-own-client-id). Use your own Google OAuth **Desktop app** client with Google Drive API enabled; rclone's shared client is being retired during 2026. Request **`drive.file` only**, which limits the app to files/folders it creates. Do not grant full-account `drive` scope. A consumer Drive service account is not substituted for this owner OAuth flow.

#### Complete Google OAuth Branding before authorization

The owner has created the Desktop client. Google currently disables **Audience → Publish app** until the Branding configuration is complete. The repository's root `/docs` folder contains a public overview, privacy policy and terms for this backup utility. These pages describe its actual purpose, limited Drive access and provider/data practices; they contain no credentials or archive content. They are separate from the application documentation in `/colvin/docs`.

After this documentation change passes CI and the owner merges it, publish the static pages using **repository Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main → Folder: /docs → Save**. GitHub Pages is available free for this public repository. Wait for **pages build and deployment** to succeed, then open each page while signed out to verify that its content loads. Merely merging these files does not enable Pages. No Railway service or custom domain is needed for this documentation site.

For the default GitHub Pages address, complete **Google Auth Platform → Branding** with these exact values only after the pages are live:

| Branding field                  | Value                                              |
| ------------------------------- | -------------------------------------------------- |
| Application home page           | `https://collintech.github.io/Colvin/`             |
| Application privacy policy link | `https://collintech.github.io/Colvin/privacy.html` |
| Application Terms of Service    | `https://collintech.github.io/Colvin/terms.html`   |
| Authorised domains              | `collintech.github.io`                             |

Keep the existing app name, support email and developer contact email. The logo is optional; adding one can introduce brand-verification requirements. Save, return to **Audience**, choose **Publish app**, confirm and verify **In production** before granting Drive access through rclone. This is the Google OAuth publishing status for the private backup utility, separate from Railway's staging environment. Personal-use apps can qualify for Google's verification exception; this is not a promise that Google's UI will never request additional information.

If Google requires domain ownership or brand verification, pause and capture the exact requirement before continuing. Search Console URL-prefix verification of a project page does not establish DNS ownership of its hostname; Google's current OAuth domain-verification guidance can require a DNS-verified Domain property. Do not assume that an HTML meta tag satisfies that separate requirement. The personal-use exception and rclone's GitHub Pages route should be evaluated against the actual message. Do not register the shared `github.io` domain, invent URLs, add full-Drive scopes or buy a domain just to bypass a validation message. If Pages reports a different live hostname, use that actual host and its page URLs after checking ownership instead of copying this table.

References: [rclone's current client/publishing instructions](https://rclone.org/drive/#making-your-own-client-id), [Google OAuth Branding](https://support.google.com/cloud/answer/15549049), [personal-use verification exceptions](https://support.google.com/cloud/answer/13464323), [OAuth domain verification](https://support.google.com/cloud/answer/13804266), [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

#### Authorize rclone on the Windows computer

Keep the dedicated rclone config in a private owner-controlled directory, outside the repository and backup-upload folder. On Windows verify that its NTFS permissions exclude other ordinary users. Run `rclone --config PATH_TO_PRIVATE_CONFIG config`, choose a new remote named **`colvin_backup`**, storage type **`drive`**, your client ID/secret and scope **`drive.file`**. Use the browser authorization flow on the Windows computer and select the intended backup Google account. This is a personal Drive, not a Shared Drive. Use an OAuth app publishing status suitable for continuing use; Google's **Testing** grants for these scopes expire after seven days. Follow the current linked setup screens rather than guessing numeric menu positions.

The app cannot see folders made by the ChatGPT connector or browser under `drive.file`. Therefore create a **new app-owned folder**, for example `Colvin Scheduled Backups`, with this remote using `rclone --config PATH_TO_PRIVATE_CONFIG mkdir 'colvin_backup:Colvin Scheduled Backups'`. Find that new folder's ID in its Drive URL (the new folder is visible in the web interface), set **`root_folder_id`** to it in this dedicated config and leave its sharing owner-only. This is a separate scheduled namespace; do not point at the accepted manual archive folder or change that folder's sharing.

The final dedicated INI file must contain exactly one `[colvin_backup]` section and these keys only: `type=drive`, `scope=drive.file`, your non-empty `client_id` and `client_secret`, `token` (rclone's OAuth token JSON) and `root_folder_id`. The parser rejects other profiles/options, duplicate keys and custom OAuth endpoints. Treat the complete config and its base64 form as secrets; base64 is encoding, not protection. The worker refreshes access tokens in a private temporary config using the retained refresh token.

### 3. Create only the new SELECT-only PostgreSQL role in staging

This phase changes only a new database role/grants in **staging**, not existing credentials. Review `colvin/scripts/backup/create-backup-reader.sql` first. It is an operator script, **not an application migration**. It creates only **`colvin_backup_reader`** with **NOLOGIN**, refuses to reset an existing role, grants SELECT on current public tables/sequences and defaults for their current owners, and commits. It contains no password prompt or embedded password, so piping the SQL does not compete with hidden password entry.

From the local repository root in Git Bash, after verifying the intended staging Postgres IDs, run:

```bash
cat colvin/scripts/backup/create-backup-reader.sql | railway ssh --project a0803155-bc22-4311-ac90-43ab3582550e --environment ce8f6930-5c13-46f6-955c-8f62018223af --service ce3b1090-d6cc-4943-95a6-7c88e839ec3e -- bash -c 'set -eu; test "$RAILWAY_ENVIRONMENT_ID" = ce8f6930-5c13-46f6-955c-8f62018223af; test "$RAILWAY_SERVICE_ID" = ce3b1090-d6cc-4943-95a6-7c88e839ec3e; exec psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -U "${PGUSER:-${POSTGRES_USER:-postgres}}" -d "${PGDATABASE:-${POSTGRES_DB:-postgres}}"'
```

Continue only after the new-role/NOLOGIN success message. If it reports an existing role, stop and inspect it rather than rotating its password. Open a separate terminal-attached source psql connection:

```bash
railway ssh --project a0803155-bc22-4311-ac90-43ab3582550e --environment ce8f6930-5c13-46f6-955c-8f62018223af --service ce3b1090-d6cc-4943-95a6-7c88e839ec3e -- bash -c 'exec psql -X -h /var/run/postgresql -U "${PGUSER:-${POSTGRES_USER:-postgres}}" -d "${PGDATABASE:-${POSTGRES_DB:-postgres}}"'
```

At the psql prompt, enter **only** `\password colvin_backup_reader`. Choose a password-manager-generated value of at least 24 characters, enter it in the two hidden prompts, and wait for the psql prompt to return. Then enter `ALTER ROLE colvin_backup_reader LOGIN;` and finally `\q`. Preserve the new password privately for the worker. These are PostgreSQL-role credentials, separate from Colvin web-account passwords; existing logins are not rotated.

The worker requires this exact role, verifies that it lacks superuser/role/database/replication/RLS-bypass powers and schema/database CREATE or public-table write privileges, and defaults its sessions to read-only. Migration-owner changes require review of future default grants. Do not fall back to an app/admin database password if reader setup fails. No source restore or schema migration is part of this setup.

### 4. Prepare the heartbeat and new-service variables

In Better Stack **Heartbeats**, prepare `Colvin staging backup worker`, expected interval **12 hours**, grace **1 hour**, with owner email notification. Keep its unique heartbeat URL secret. Verify actual free-plan availability rather than accepting a paid upgrade. The worker allows only the documented Better Stack heartbeat hosts/path and sends a success check-in after upload/readback/receipt/retention succeed. Test missing-heartbeat delivery separately before accepting monitoring; earlier web-monitor alert acceptance remains complete.

Only when ready to create the reviewed new billable service, configure its root/config path from the table, one replica, no domain/volume, and the intended resource limits. Record its new service UUID. Add these variables to **that service only**, in one reviewed batch:

| New worker variable            | Value/source                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `BACKUP_WORKER_ENABLED`        | `true` only when the complete configuration is ready                                                   |
| `BACKUP_WORKER_SERVICE_ID`     | Exact UUID of the new backup worker, not a database or gateway ID                                      |
| `BACKUP_DATABASE_HOST`         | Reference `${{Postgres.RAILWAY_PRIVATE_DOMAIN}}`; retain the actual service name/case shown in Railway |
| `BACKUP_DATABASE_PORT`         | Reference `${{Postgres.PGPORT}}`                                                                       |
| `BACKUP_DATABASE_NAME`         | Reference `${{Postgres.PGDATABASE}}`                                                                   |
| `BACKUP_DATABASE_USER`         | `colvin_backup_reader`                                                                                 |
| `BACKUP_DATABASE_PASSWORD`     | The new reader password from phase 3                                                                   |
| `BACKUP_DB_SSL_CA_BASE64`      | Reference the already verified CA, e.g. `${{api-gateway.DB_SSL_CA_BASE64}}`; do not replace it         |
| `BACKUP_GPG_PUBLIC_KEY_BASE64` | Single-line base64 of the dedicated public key only                                                    |
| `BACKUP_GPG_FINGERPRINT`       | Full uppercase primary fingerprint matching that public key                                            |
| `BACKUP_DRIVE_CONFIG_BASE64`   | Single-line base64 of the private dedicated rclone INI, never committed or pasted into chat            |
| `BACKUP_DRIVE_FOLDER_ID`       | The new app-created owner-only scheduled folder ID, matching `root_folder_id`                          |
| `BACKUP_HEARTBEAT_URL`         | Its secret Better Stack check-in URL                                                                   |
| `BACKUP_RETENTION_APPLY`       | `false` for the first runs and candidate review; `true` only when scoped expiration is accepted        |

Railway supplies the project's/environment's/service's runtime IDs; the worker rejects a different project/environment or a mismatched worker UUID. Use the private service hostname and verified CA with libpq `verify-full`. No public database address, TLS bypass, SSH private key, decryption key/passphrase, app JWT secret or Resend credential is required by the worker. Check the actual referenced values/services exist before deploying; do not add guessed placeholder values to an existing application service.

### 5. Validate before accepting the schedule or retention

Deploy only this new service. A first manual cron run must exit successfully within the deadline and report `passed: true`, `readbackSha256: true` and `retentionApplied: false`. The worker verifies source migration/schema metadata against its release before exporting. Its fresh Drive folder must remain owner-only; the encrypted archive is read back in full and its SHA256 and byte count compared before a completion receipt and heartbeat. Each snapshot folder contains `backup.tar.gpg`, SHA256SUMS and a bounded receipt; the manifest remains inside the encrypted tar. No plaintext database row is logged.

Download one **new scheduled** snapshot directly from Drive onto the Windows computer, and use the existing local `restore` procedure with the matching checkout and dedicated private key. This validates the new unattended/public-key path; it is not a request to repeat the accepted symmetric manual backup. Require all five restore checks, then confirm post-run source health and heartbeat receipt. Observe at least one actual scheduled execution, confirm its successful exit and freshness, and test the missing-heartbeat email before marking the unattended gate accepted.

Review retention candidate counts with deletion disabled first. The policy recognizes only strict `colvin-auto-<UTC timestamp>-<UUID>` folders in the **new configured Drive root**, retains the current run and the snapshot/week/month union, and requires a complete matching-source receipt before removing any expired managed folder. Unknown/future names, incomplete folders and foreign-source receipts are left untouched. An upload or readback failure performs no retention and sends no success heartbeat. Incomplete uploads may need targeted operator cleanup after inspection; do not broadly purge the Drive root. Enabling retention authorizes deletion only of those expired managed outputs, never the accepted manual archive.

## CI and remaining limits

Unit tests cover staging identity/configuration, credential-scope restrictions, private-folder checks, retention boundaries and failure sequencing without real Drive access. Integration builds the actual worker image and exercises a SELECT-only PostgreSQL 18 role over real verified TLS, public-key encryption and a disposable local restore. Write attempts, an untrusted CA and a wrong TLS hostname are rejected. The existing symmetric/manual export regression remains. CI uses synthetic data only; it does not establish real Google OAuth longevity, Drive upload, Railway scheduling, heartbeat delivery, billing or a live scheduled-archive restore. Those owner-controlled validations remain pending.

References: [Railway cron](https://docs.railway.com/cron-jobs), [pricing](https://docs.railway.com/pricing/plans), [rclone Drive scopes/client setup](https://rclone.org/drive/), [Google OAuth token expiry](https://developers.google.com/identity/protocols/oauth2#expiration), [GPG key generation](https://www.gnupg.org/documentation/manuals/gnupg/OpenPGP-Key-Management.html), [Better Stack heartbeat](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/).
