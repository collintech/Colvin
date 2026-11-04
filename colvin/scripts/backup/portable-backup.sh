#!/usr/bin/env bash
# Run in Git Bash (Windows) or Bash on Linux/macOS, from any directory.
set -euo pipefail
umask 077
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
tools="$script_dir/backup-tools.mjs"
docker_cmd() { MSYS_NO_PATHCONV=1 docker "$@"; }
fail() { echo "$1" >&2; exit 1; }
usage() { echo 'Usage: bash portable-backup.sh backup OUTPUT_FOLDER | restore BACKUP_FOLDER' >&2; exit 1; }
[[ $# == 2 ]] || usage
mode=$1
folder=$2
[[ "$mode" == backup || "$mode" == restore ]] || usage
for tool in node docker gpg; do command -v "$tool" >/dev/null || fail "Required local tool missing: $tool"; done
export DOCKER_HOST
DOCKER_HOST=$(node "$tools" docker-check)
unset DOCKER_CONTEXT
mkdir -p -- "$folder"
node "$tools" outside-repository "$folder"
if [[ "$mode" == restore ]]; then node "$tools" check-digest "$folder"; fi
docker_cmd pull postgres:18 >/dev/null

container=''
token=$(node "$tools" uuid)
partial=''
cleanup() {
  if [[ -n "$container" ]]; then
    # Only remove the exact container created here, with this run's label.
    label=$(docker_cmd inspect --format '{{index .Config.Labels "colvin.restore-drill"}}' "$container" 2>/dev/null || true)
    if [[ "$label" == "$token" ]]; then docker_cmd rm -f -v "$container" >/dev/null 2>&1 || true; fi
  fi
  if [[ -n "$partial" ]]; then rm -f -- "$partial"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

if [[ "$mode" == backup ]]; then
  command -v railway >/dev/null || fail 'Railway CLI is required for export.'
  read -r project environment service < <(node "$tools" source-ids)
  echo 'Checking the staging Postgres SSH connection. No dump is made by this check.'
  # Inherited terminal permits Railway's existing SSH-key/host-key prompts.
  # No key files are generated or overwritten by this script.
  railway ssh --project "$project" --environment "$environment" --service "$service" -- \
    bash -c 'set -eu; test "${RAILWAY_PROJECT_ID:-}" = "$1"; test "${RAILWAY_ENVIRONMENT_ID:-}" = "$2"; test "${RAILWAY_SERVICE_ID:-}" = "$3"; for tool in psql pg_dump tar mktemp timeout; do command -v "$tool" >/dev/null; done; pg_dump --version' \
    colvin-preflight "$project" "$environment" "$service"

  folder=$(mktemp -d "$folder/colvin-staging-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
  partial="$folder/backup.partial.gpg"
  echo 'Exporting and encrypting. Enter a new backup passphrase in the GPG prompt, then confirm it.'
  # No PTY is allocated when Railway's stdin/stdout are pipes (CLI >= 5.64).
  # The pipe never writes plaintext database data to the Windows filesystem.
  if ! node "$tools" render-source | \
    railway ssh --project "$project" --environment "$environment" --service "$service" -- \
      bash -s -- "$project" "$environment" "$service" | \
    gpg --no-symkey-cache --no-armor --symmetric --cipher-algo AES256 --compress-algo none --output "$partial"; then
    fail 'Export/encryption failed. No verified backup was recorded. The partial encrypted file is removed.'
  fi
  mv -- "$partial" "$folder/backup.tar.gpg"
  partial=''
  node "$tools" digest "$folder"
  echo 'Encrypted export saved. Testing recovery now; GPG will ask for the backup passphrase again.'
fi

node "$tools" check-digest "$folder"
started=$SECONDS
container=$(docker_cmd run --detach --rm --network none \
  --label "colvin.restore-drill=$token" --name "colvin-restore-$token" \
  --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_USER=colvin_restore --env POSTGRES_DB=colvin_restore \
  postgres:18 -c listen_addresses='')
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker_cmd exec "$container" bash -c 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U colvin_restore -d colvin_restore' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'The isolated restore database did not become ready.'

# Extract only the two known files inside the disposable container. No bind
# mount, host plaintext file, external network, published port or app is used.
if ! gpg --no-symkey-cache --decrypt "$folder/backup.tar.gpg" | \
  docker_cmd exec -i "$container" bash -c 'set -eu; umask 077; mkdir /tmp/colvin-import; tar -xf - -C /tmp/colvin-import --no-same-owner --no-same-permissions -- manifest.json database.dump 2>/tmp/colvin-import/error; for file in manifest.json database.dump; do test -f "/tmp/colvin-import/$file"; test ! -L "/tmp/colvin-import/$file"; done'; then
  fail 'Decryption/import failed. The encrypted backup remains; no restore was accepted.'
fi
if ! docker_cmd exec "$container" bash -c 'pg_restore --exit-on-error --no-owner --no-acl --username=colvin_restore --dbname=colvin_restore /tmp/colvin-import/database.dump >/tmp/colvin-import/restore.log 2>&1'; then
  fail 'Isolated pg_restore failed. The encrypted backup remains; no restore was accepted.'
fi
report="$folder/restore-report-$token.json"
if ! node "$tools" verify "$container" "$token" >"$report"; then
  rm -f -- "$report"
  fail 'Restored database verification failed. The encrypted backup remains; no restore was accepted.'
fi
cat -- "$report"
echo "Isolated restore verification passed in $((SECONDS-started)) seconds (including decryption)."
echo "Encrypted backup folder: $folder"
echo 'Keep the backup passphrase separately. Do not upload the archive or its contents to GitHub or ChatGPT.'
echo 'A recurring backup schedule and retention policy are still pending.'
