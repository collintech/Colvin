# Gate 8B — PostgreSQL backups and an isolated restore

## Current state — November 2, 2026

Status: **prepared; source inventory, backup configuration and restore acceptance pending**. The compatible gateway rollback is complete and ended on PR #18. Do not repeat that rehearsal or the earlier authentication/email tests.

PostgreSQL holds authoritative Colvin data; Redis is a degradable cache and is not the database backup target for this gate. Keep the working staging PostgreSQL service and its application references in place. The proposed initial drill uses a portable logical backup and a separate local Docker PostgreSQL instance, with no API, history service or email worker pointed at the restored data. Keep Railway Hobby while evaluating the actual available backup settings and storage needs.

## First action — read-only source inventory

Use Railway SSH to connect to the verified **staging API Gateway**, where the existing database client and verified TLS configuration already work. From `/app/apps/api-gateway`, paste this complete block:

```bash
node --input-type=module <<'JS'
import { pool } from './src/database/postgres.js';
try {
  const { rows } = await pool.query({
    text: "SELECT current_setting('server_version_num') AS version, pg_database_size(current_database())::text AS bytes",
    query_timeout: 5000,
  });
  console.log(JSON.stringify({
    postgresVersionNumber: rows[0].version,
    databaseSizeBytes: rows[0].bytes,
  }, null, 2));
} catch {
  console.error('Backup inventory check failed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
JS
```

This runs one metadata SELECT and closes its own connection pool. It does not dump data, change users, migrate tables or edit variables. Its output contains only the source version number and database size; no connection string, database name, credentials or account data is printed. The size is a planning estimate, not a prediction of compressed archive size.

Also inspect **Railway → staging → PostgreSQL service → Backups**. Record the schedules/features offered by the actual account, which are enabled and whether existing backups are listed. Viewing the page is sufficient at this stage. Do not use its source-service Restore action for an isolated drill. Exact dump/transfer/encryption/restore commands will be finalized after the source inventory and available settings are known.

## Backup mechanisms and source protection

[Railway volume backups](https://docs.railway.com/volumes/backups) are snapshots of the attached volume. The documented schedules retain daily backups for 6 days, weekly for 27 days and monthly for 89 days. Snapshot storage is incremental and billable. A normal volume restore stages a restored volume on the same service and redeploys it; that would change the working database. Confirm actual plan/UI availability and costs before selecting a schedule. No plan upgrade or schedule has been applied here.

[Railway PITR](https://docs.railway.com/volumes/point-in-time-recovery) can create a sibling restored database, but enabling it creates an archive bucket, adds archive variables and redeploys the database service. It is a separate operational change with storage/resource costs, not a prerequisite for the initial local drill. Keep it unchanged during the read-only inventory.

[PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) supports a consistent logical export of an active single database. Use a compatible client, preferably the source major version, and custom archive format for `pg_restore`. A database dump does not include every cluster-wide role/global object; schema, ownership and required extensions must be considered separately. No database dump has been taken by this preparation.

## Proposed portable-backup drill

1. Confirm the actual source major version, installed dump client, size, required extensions and usable Railway SSH/SFTP target. Use the PostgreSQL container's local connection for the dump so no public database endpoint or relaxed TLS setting is needed. Preserve current credentials and the application's `verify-full` configuration.
2. Create a custom-format archive outside `PGDATA`, with owner-only file permissions, during a window without schema migrations. Transfer it using [Railway-supported SFTP/scp](https://docs.railway.com/cli/ssh), rather than copying binary data through an interactive terminal. Keep the raw archive private; it includes account data and authentication-related database rows.
3. Encrypt the archive for private storage controlled by the owner and retain an integrity digest. Confirm the encryption/recovery method is available before exporting data. Keep encryption secrets separate from the archive, git and ChatGPT. Do not upload the dump or paste its data into the conversation. Remove only explicitly recorded temporary dump files after the encrypted copy and restore have been verified.
4. Restore a verified copy into a fresh, disposable local Docker PostgreSQL instance of the selected compatible version, with networking disabled and no published ports. Use a new local database/role and no staging connection variables. The source Railway database is never a restore destination. No application or outbound email/provider integration connects to the local restored data.
5. Require `pg_restore` to stop on errors. Verify the migration ledger/checksums against the release, expected schema/tables, constraints, indexes and aggregate restored-data counts. Archive listing/checksum alone is not restore acceptance. Compare mutable row counts to a manifest from the same dump snapshot if exact equality is required; later live-database counts may change legitimately.
6. Record archive/verification times, source/client/target versions, encrypted archive identifier/digest, local target identity, restore duration and bounded verification results. Recheck source readiness/public status after the drill. Keep data values, credentials and archive contents private.

These are preparation requirements, not executable export instructions yet. Final commands need the inventory and tool/target details; do not improvise a restore against `DATABASE_URL` or the working service.

## Retention and acceptance

The gate needs both a verified restore and an actual repeatable backup/retention configuration. Choose the schedule and private archive retention after reviewing current source size, available native options and storage cost. A proposed initial staging recovery-point objective is at most 24 hours; it is not achieved by a one-off manual dump. Measure recovery time during the local drill rather than promising an untested recovery-time objective.

Acceptance remains pending until an encrypted portable backup exists, an isolated restore passes its checks, the working source remains healthy and the selected retention/schedule is documented and enabled. Local restore acceptance does not establish production PITR, whole-cluster recovery or automatic retention. Broader production backup coverage and final launch/security gates remain separate decisions.
