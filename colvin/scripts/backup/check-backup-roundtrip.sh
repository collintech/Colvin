#!/usr/bin/env bash
# CI only: both databases and the GPG passphrase contain synthetic data.
set -euo pipefail
umask 077
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
tools="$script_dir/backup-tools.mjs"
tmp_dir=$(mktemp -d)
fixture=''
cleanup() {
  if [[ -n "$fixture" ]]; then docker rm -f -v "$fixture" >/dev/null 2>&1 || true; fi
  gpgconf --homedir "$tmp_dir/gnupg" --kill all >/dev/null 2>&1 || true
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
export GNUPGHOME="$tmp_dir/gnupg"
mkdir -m 700 "$GNUPGHOME"
# The test-only passphrase is never supplied through argv, logs or artifacts.
node "$tools" uuid >"$tmp_dir/passphrase"
printf 'batch\npinentry-mode loopback\npassphrase-file %s\n' "$tmp_dir/passphrase" >"$GNUPGHOME/gpg.conf"
docker pull postgres:18 >/dev/null
project=11111111-1111-4111-8111-111111111111
environment=22222222-2222-4222-8222-222222222222
service=33333333-3333-4333-8333-333333333333
fixture=$(docker run --detach --rm --network none \
  --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_USER=colvin_fixture --env POSTGRES_DB=colvin_fixture \
  --env "RAILWAY_PROJECT_ID=$project" --env "RAILWAY_ENVIRONMENT_ID=$environment" --env "RAILWAY_SERVICE_ID=$service" \
  --env PGUSER=colvin_fixture --env PGDATABASE=colvin_fixture postgres:18 -c listen_addresses='')
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$fixture" bash -c 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U colvin_fixture -d colvin_fixture' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]]
node "$tools" fixture-sql | docker exec -i "$fixture" psql -Xq -v ON_ERROR_STOP=1 -U colvin_fixture -d colvin_fixture >/dev/null

if node "$tools" render-source | docker exec -i "$fixture" bash -s -- "$project" "$environment" 44444444-4444-4444-8444-444444444444 >"$tmp_dir/refused" 2>"$tmp_dir/error"; then
  echo 'Wrong-service export was not refused.' >&2; exit 1
fi
[[ ! -s "$tmp_dir/refused" ]]
mkdir "$tmp_dir/backup"
node "$tools" render-source | docker exec -i "$fixture" bash -s -- "$project" "$environment" "$service" | \
  gpg --no-symkey-cache --no-armor --symmetric --cipher-algo AES256 --compress-algo none --output "$tmp_dir/backup/backup.tar.gpg"
node "$tools" digest "$tmp_dir/backup"
bash "$script_dir/portable-backup.sh" restore "$tmp_dir/backup"

# The source is still alive and has not been restored or replaced.
[[ $(docker exec "$fixture" psql -XqAt -U colvin_fixture -d colvin_fixture -c 'SELECT count(*) FROM users') == 1 ]]
[[ $(docker exec "$fixture" bash -c 'find /tmp -maxdepth 1 -type d -name "colvin-export.*" | wc -l') == 0 ]]

# Corruption must fail before starting another restore container.
printf x >>"$tmp_dir/backup/backup.tar.gpg"
if bash "$script_dir/portable-backup.sh" restore "$tmp_dir/backup" >"$tmp_dir/refused" 2>"$tmp_dir/error"; then
  echo 'Corrupted archive was not refused.' >&2; exit 1
fi
[[ $(cat "$tmp_dir/error") == 'Backup verification failed (check-digest).'* ]]
echo 'Synthetic PostgreSQL 18 encrypted backup/isolated restore passed; wrong source and archive corruption were refused.'
