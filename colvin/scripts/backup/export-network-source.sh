#!/usr/bin/env bash
# Rendered by backup-tools.mjs, used only by the isolated backup worker.
set -euo pipefail
umask 077
fail() { echo 'Read-only network export failed; no database values were printed.' >&2; exit 1; }
[[ $# == 3 && ${PGUSER:-} == colvin_backup_reader ]] || fail
[[ ${PGSSLMODE:-} == verify-full && -f ${PGSSLROOTCERT:-} ]] || fail
for tool in psql pg_dump tar mktemp timeout; do command -v "$tool" >/dev/null || fail; done
[[ $(pg_dump --version) =~ PostgreSQL\)\ 18\. ]] || fail
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS
export PGCONNECT_TIMEOUT=10
export PGOPTIONS='-c statement_timeout=300000 -c idle_in_transaction_session_timeout=600000 -c default_transaction_read_only=on'
db_args=(-h "${PGHOST:?}" -p "${PGPORT:?}" -U "$PGUSER" -d "${PGDATABASE:?}")

# A misconfigured privileged role must never be accepted as a backup reader.
readonly_role=$(psql -XqAt -v ON_ERROR_STOP=1 "${db_args[@]}" -c "SELECT NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls) AND NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) FROM pg_roles WHERE rolname=current_user" 2>/dev/null) || fail
[[ "$readonly_role" == t ]] || fail
validate_manifest() { node /opt/colvin/scripts/backup/backup-tools.mjs validate-manifest "$1" >/dev/null; }
__COLVIN_SNAPSHOT_BODY__
