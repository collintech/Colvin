# Gate 8B — PostgreSQL backups and an isolated restore

## Current state — November 4, 2026

Status: **source/tool inventory complete; live encrypted backup, restore acceptance and recurring retention pending**. The compatible gateway rollback, baseline monitoring and earlier authentication/email checks are accepted. Do not repeat them for this drill.

The owner supplied `postgresVersionNumber: 180006` and `databaseSizeBytes: 9090751` (about 9.09 MB). Use PostgreSQL **18** dump/restore tools. The size is an estimate of the database, not the compressed archive. The actual Railway **Hobby** Backups page says **No Backups** and requires **Pro** to create backups, configure schedules or enable PITR. Keep Hobby; no upgrade is required for this portable logical-backup drill.

The owner's Windows/Git Bash tools are Railway CLI **5.64.0**, Docker client/server **29.9.2**, GnuPG **2.4.9** with AES256 and OpenSSH **10.6p1**. Docker's engine is running. Node.js **20 or later** is also required; the script checks that `node` is available. Use **Git Bash on the Windows computer**, not Railway SSH, PowerShell or the browser console, for the local commands below.

| Export identity  | Expected value                                   |
| ---------------- | ------------------------------------------------ |
| Project          | `a0803155-bc22-4311-ac90-43ab3582550e`           |
| Environment      | `ce8f6930-5c13-46f6-955c-8f62018223af` (staging) |
| Postgres service | `ce3b1090-d6cc-4943-95a6-7c88e839ec3e`           |

Redis is a degradable cache, not the authoritative backup source. The wrapper fixes these three source IDs and the remote export checks its actual Railway environment before querying. It does not accept a database URL or a restore URL. Leave database credentials, application references and `DB_SSL_MODE=verify-full` unchanged.

## Run the first encrypted backup and restore

First merge the implementation PR **after Quality, Integration and Container Smoke pass**. In your existing Colvin checkout, open Git Bash, then run:

```bash
git switch main
git pull --ff-only
```

If Git refuses because of local changes, stop and preserve those changes; do not reset or overwrite them. The following path assumes your terminal is at the **repository root**, where the `colvin` folder is visible. No `npm install`, migration command, Railway deployment or variable change is needed to use these operational scripts.

Keep Docker Desktop running with **Linux containers**. Choose a time when no schema migration/deployment is running. Have a private place to save a **new backup encryption passphrase**, separate from the backup itself and separate from Colvin/Railway login passwords. Then run this one command:

```bash
bash colvin/scripts/backup/portable-backup.sh backup "$HOME/ColvinBackups"
```

Follow the prompts in this order:

1. Docker downloads `postgres:18` if necessary. The script requires a local Unix/named-pipe Docker endpoint and refuses TCP/SSH remote Docker contexts.
2. Railway opens a short SSH connection to **staging → Postgres**, checks the three IDs and prints the dump-client version. If Railway reports an expired login, run `railway login` and retry the backup command. If Railway asks to register an existing SSH public key, select the intended key. If it reports no local SSH keys, stop and resolve key setup separately; the script does not generate or overwrite key files. Keep normal SSH host verification enabled.
3. GPG asks for a **new backup passphrase**, then asks you to confirm it. These prompts may appear in a separate pinentry window. Type the passphrase there; never put it in the command, a Railway variable, git or this conversation. If a terminal pinentry cannot find the terminal in Git Bash, run `export GPG_TTY=$(tty)` in that same terminal and retry. Do not use an empty passphrase.
4. The read-only source export runs. The dump and manifest use the **same exported repeatable-read snapshot**, so exact row-count comparison remains valid while normal application writes continue. The source needs no public PostgreSQL connection or TLS exception.
5. The script saves the encrypted archive and asks GPG to decrypt it for recovery. Enter the **same backup passphrase again**. Symmetric passphrase caching is disabled so this checks recovery rather than relying on that cache.
6. A fresh local PostgreSQL 18 container restores the archive and verifies it. Successful output includes `"passed": true`, five named checks and `Isolated restore verification passed in ... seconds`. The script removes its own temporary container and anonymous database volume when finished.

The encrypted archive is stored in a new, uniquely named folder beneath `$HOME/ColvinBackups`, outside git. The folder contains:

| File                           | Meaning                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `backup.tar.gpg`               | AES256-encrypted tar containing a custom-format database dump and snapshot manifest                         |
| `SHA256SUMS`                   | SHA256 of the encrypted file, checked before every restore                                                  |
| `restore-report-<run-id>.json` | Created only after verification; bounded version, origin IDs, image and check results, without account data |

Record the printed restore duration alongside the report. Keep the passphrase in a separate secure location; losing it loses access to this backup. A digest checks accidental corruption, not authenticity against someone who can replace both files. GPG's authenticated decryption and the restore checks are also required. Copy only the encrypted archive, digest and report to owner-controlled storage; never copy or upload a raw dump.

The raw dump exists briefly in a private `/tmp/colvin-export.*` directory **outside PGDATA in the source container** and is removed by the export's cleanup trap. It is transferred through native SSH into GPG. No plaintext dump is written to the Windows drive. Decryption streams directly into the disposable restore container, with no host directory mounted into it. That container has `--network none`, no published ports, no application, no staging environment variables and no email/provider integration. Trust authentication applies only inside this isolated disposable container. PostgreSQL 18's own anonymous volume location is used; no source volume is mounted or restored.

## Verification and failure handling

`pg_restore` uses `--exit-on-error --no-owner --no-acl` into a newly initialized **local** database. The verifier compares the nine migration filenames/checksums to this release checkout, all 11 expected public tables, column definitions, constraints, valid/ready indexes, extensions and every table's aggregate row count from the dump snapshot. Raw rows, password hashes, refresh tokens, reset tokens and database connection strings are never printed. Normalizing Windows checkout CRLF to repository LF keeps migration checksum verification consistent.

A single-database logical dump does not recreate cluster-wide roles, Railway configuration, CA material or secrets. This drill deliberately restores under a separate local role and does not test production role/ACL recovery. Concurrent sequence increments are not a transactional row snapshot; schema migrations must remain paused during export. This is not PITR or a whole-cluster disaster-recovery acceptance.

If any phase fails, the script exits without a successful report. Partial encrypted exports are deleted; a completed encrypted backup is retained if restore/decryption/verification fails. Treat that archive as **unverified** until a restore passes. Cancellation/failure triggers cleanup of this run's local container/volume. Source export commands have bounded connection/query/dump timeouts; an interrupted SSH export's remote cleanup may finish after its active command exits. A power loss or forced process termination can bypass cleanup, so retain the failure's run/container identity for targeted cleanup; never use `docker system prune` or broad deletion as recovery.

A GPG passphrase prompt expects typing into its prompt/window. Repeatedly pressing Enter in the main terminal does not complete a hidden pinentry prompt. Cancel with Ctrl+C if needed, and share only the bounded error message. Do not paste secrets or archive contents.

After successful local restore, open the exact lowercase public status URL:

```text
https://web-client-staging-1178.up.railway.app/api/v1/status
```

Require HTTP 200 and `{"status":"ok"}`, and confirm that the two real monitors remain Up. Report the safe restore JSON, duration and source status. Do not upload `backup.tar.gpg` or a decrypted file. No additional password-reset/login exercise is needed.

## Recheck an existing encrypted backup

Use the exact folder printed by the backup command, replacing the example suffix below:

```bash
bash colvin/scripts/backup/portable-backup.sh restore "$HOME/ColvinBackups/colvin-staging-<timestamp>-<suffix>"
```

This command only uses the encrypted local backup and a new isolated local container. It does not connect to Railway. Use the matching release checkout so migration checksums are meaningful. Keep a record of the repository commit used for each accepted archive.

## CI and remaining acceptance

The existing **Integration** job exercises the same source export, symmetric GPG encryption/decryption and local restore/verification against synthetic PostgreSQL 18 data in every public table. It also checks wrong-source refusal, source cleanup/continued availability and encrypted-file corruption refusal. Quality runs the Docker-endpoint, folder/symlink and manifest/checksum guards. No Railway account, live credentials, real backup or user data is used by CI. Linux CI does not replace the owner's first Windows/Git Bash live drill.

The gate still requires a verified **live** encrypted backup, this isolated restore, source-health evidence and an actual recurring backup/retention configuration. A proposed initial recovery-point objective is at most **24 hours**; a one-off manual dump does not meet it. Measure recovery time rather than promising an untested objective. Retain the first accepted encrypted archive while selecting private secondary storage, the schedule, retention and recovery-key custody. No scheduled task, storage bucket, additional Railway service, plan upgrade, native volume backup or PITR setting is created by these scripts.

References: [Railway native SSH](https://docs.railway.com/cli/ssh), [Railway volume backups](https://docs.railway.com/volumes/backups), [PITR](https://docs.railway.com/volumes/point-in-time-recovery), [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html), [official PostgreSQL Docker image](https://hub.docker.com/_/postgres), [GnuPG manual](https://www.gnupg.org/documentation/manuals/gnupg/GPG-Commands.html).
