tmp_dir=$(mktemp -d /tmp/colvin-export.XXXXXXXXXX) || fail
holder_pid=''
cleanup() {
  if [[ -n "$holder_pid" ]]; then kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; fi
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

version=$(psql -XqAt -v ON_ERROR_STOP=1 "${db_args[@]}" -c "SELECT current_setting('server_version_num')" 2>"$tmp_dir/error") || fail
[[ "$version" =~ ^18[0-9]{4}$ ]] || fail

# Keep one read-only repeatable-read snapshot alive for both dump and manifest.
coproc SNAPSHOT { psql -XqAt -v ON_ERROR_STOP=1 "${db_args[@]}" 2>"$tmp_dir/error"; }
holder_pid=$SNAPSHOT_PID
printf '%s\n' 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' 'SELECT pg_export_snapshot();' >&"${SNAPSHOT[1]}"
IFS= read -r -t 15 snapshot <&"${SNAPSHOT[0]}" || fail
[[ "$snapshot" =~ ^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$ ]] || fail

psql -XqAt -v ON_ERROR_STOP=1 -v snapshot="$snapshot" -v project="$1" -v environment="$2" -v service="$3" -v dump_client="$(pg_dump --version)" "${db_args[@]}" >"$tmp_dir/manifest.json" 2>"$tmp_dir/error" <<'COLVIN_SQL' || fail
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT :'snapshot';
__COLVIN_MANIFEST_SQL__
COMMIT;
COLVIN_SQL

if declare -F validate_manifest >/dev/null; then validate_manifest "$tmp_dir/manifest.json" || fail; fi

timeout 5m pg_dump "${db_args[@]}" --format=custom --no-acl --lock-wait-timeout=10s --snapshot="$snapshot" --file="$tmp_dir/database.dump" 2>"$tmp_dir/error" || fail
printf '%s\n' 'ROLLBACK;' '\q' >&"${SNAPSHOT[1]}" || fail
wait "$holder_pid" || fail
holder_pid=''
tar -C "$tmp_dir" -cf - manifest.json database.dump || fail
