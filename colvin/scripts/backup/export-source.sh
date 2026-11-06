#!/usr/bin/env bash
# Rendered by backup-tools.mjs; stdout is exclusively the binary tar stream.
set -euo pipefail
umask 077

fail() { echo 'Colvin source export failed; no database credentials or data were printed.' >&2; exit 1; }
[[ $# == 3 ]] || fail
[[ ${RAILWAY_PROJECT_ID:-} == "$1" && ${RAILWAY_ENVIRONMENT_ID:-} == "$2" && ${RAILWAY_SERVICE_ID:-} == "$3" ]] || fail
for tool in psql pg_dump tar mktemp timeout; do command -v "$tool" >/dev/null || fail; done
[[ $(pg_dump --version) =~ PostgreSQL\)\ 18\. ]] || fail

# Explicit Unix socket arguments ignore URLs and public TCP endpoints.
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS
export PGCONNECT_TIMEOUT=10
export PGOPTIONS='-c statement_timeout=300000 -c idle_in_transaction_session_timeout=600000'
db_args=(-h /var/run/postgresql -p "${PGPORT:-5432}" -U "${PGUSER:-${POSTGRES_USER:-postgres}}" -d "${PGDATABASE:-${POSTGRES_DB:-postgres}}")
__COLVIN_SNAPSHOT_BODY__
