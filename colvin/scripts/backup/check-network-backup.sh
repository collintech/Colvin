#!/usr/bin/env bash
# CI-only fixtures: real TLS, SELECT-only role, public-key encryption and restore.
set -euo pipefail
umask 077
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(cd -- "$script_dir/../../.." && pwd)
tools="$script_dir/backup-tools.mjs"
tmp_dir=$(mktemp -d)
fixture=''
network="colvin-backup-$(node "$tools" uuid)"
cleanup() {
  if [[ -n "$fixture" ]]; then docker rm -f -v "$fixture" >/dev/null 2>&1 || true; fi
  docker network rm "$network" >/dev/null 2>&1 || true
  gpgconf --homedir "$tmp_dir/gnupg" --kill all >/dev/null 2>&1 || true
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
export GNUPGHOME="$tmp_dir/gnupg"
mkdir -m 700 "$GNUPGHOME"
node "$tools" uuid >"$tmp_dir/passphrase"
printf 'batch\npinentry-mode loopback\npassphrase-file %s\n' "$tmp_dir/passphrase" >"$GNUPGHOME/gpg.conf"
gpg --quick-generate-key 'Colvin CI Backup Fixture' default default 1d >/dev/null 2>&1
gpg --with-colons --list-keys 'Colvin CI Backup Fixture' | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(s.split("\n").find(x=>x.startsWith("fpr:")).split(":")[9]));' >"$tmp_dir/fingerprint"
gpg --armor --export "$(cat "$tmp_dir/fingerprint")" >"$tmp_dir/public.asc"
mkdir -m 755 "$tmp_dir/server" "$tmp_dir/result"
chmod 644 "$tmp_dir/public.asc" "$tmp_dir/fingerprint"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$tmp_dir/ca.key" -out "$tmp_dir/server/ca.crt" -days 1 -subj '/CN=Colvin CI CA' >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -keyout "$tmp_dir/server/server.key" -out "$tmp_dir/server.csr" -subj '/CN=colvin-backup-fixture' >/dev/null 2>&1
printf 'subjectAltName=DNS:colvin-backup-fixture\n' >"$tmp_dir/extensions"
openssl x509 -req -in "$tmp_dir/server.csr" -CA "$tmp_dir/server/ca.crt" -CAkey "$tmp_dir/ca.key" -CAcreateserial -out "$tmp_dir/server/server.crt" -days 1 -extfile "$tmp_dir/extensions" >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$tmp_dir/wrong.key" -out "$tmp_dir/server/wrong-ca.crt" -days 1 -subj '/CN=Wrong CI CA' >/dev/null 2>&1
chmod 644 "$tmp_dir/server/"*.crt
docker build -q -f "$repo_dir/Dockerfile.backup-worker" -t colvin-backup-ci "$repo_dir" >/dev/null
docker run --rm --user root --entrypoint bash -v "$tmp_dir/server:/certs" colvin-backup-ci -c 'chown postgres:postgres /certs/server.key; chmod 600 /certs/server.key'
docker network create --internal "$network" >/dev/null
fixture=$(docker run --detach --rm --network "$network" --network-alias colvin-backup-fixture --network-alias wrong-host \
  -v "$tmp_dir/server:/certs:ro" --env POSTGRES_USER=colvin_fixture --env POSTGRES_DB=colvin_fixture --env POSTGRES_PASSWORD=fixture-admin-only \
  postgres:18 -c ssl=on -c ssl_cert_file=/certs/server.crt -c ssl_key_file=/certs/server.key)
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$fixture" bash -c 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U colvin_fixture -d colvin_fixture' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]]
node "$tools" fixture-sql | docker exec -i "$fixture" psql -Xq -v ON_ERROR_STOP=1 -U colvin_fixture -d colvin_fixture >/dev/null
cat "$script_dir/create-backup-reader.sql" | docker exec -i "$fixture" psql -Xq -v ON_ERROR_STOP=1 -U colvin_fixture -d colvin_fixture >/dev/null
docker exec "$fixture" psql -Xq -v ON_ERROR_STOP=1 -U colvin_fixture -d colvin_fixture -c "ALTER ROLE colvin_backup_reader LOGIN PASSWORD 'fixture-reader-password-for-ci-only'" >/dev/null
if docker exec "$fixture" psql -Xq -v ON_ERROR_STOP=1 -U colvin_backup_reader -d colvin_fixture -c 'SET default_transaction_read_only=off' -c "INSERT INTO provider_usage_daily(provider,usage_date,call_count) VALUES ('forbidden',current_date,1)" >"$tmp_dir/refused" 2>&1; then echo 'Backup reader could write.' >&2; exit 1; fi
export_fixture() {
  docker run --rm --user "$(id -u):$(id -g)" --network "$network" \
    -v "$tmp_dir/server:/certs:ro" -v "$tmp_dir/public.asc:/fixture/public.asc:ro" -v "$tmp_dir/fingerprint:/fixture/fingerprint:ro" -v "$tmp_dir/result:/result" \
    --env "PGHOST=$1" --env "PGSSLROOTCERT=$2" --env PGPASSWORD=fixture-reader-password-for-ci-only \
    --entrypoint node colvin-backup-ci scripts/backup/check-network-export.mjs
}
export_fixture colvin-backup-fixture /certs/ca.crt
node "$tools" digest "$tmp_dir/result"
bash "$script_dir/portable-backup.sh" restore "$tmp_dir/result"
if export_fixture colvin-backup-fixture /certs/wrong-ca.crt >"$tmp_dir/refused" 2>&1; then echo 'Untrusted CA accepted.' >&2; exit 1; fi
if export_fixture wrong-host /certs/ca.crt >"$tmp_dir/refused" 2>&1; then echo 'Wrong TLS hostname accepted.' >&2; exit 1; fi
echo 'SELECT-only PostgreSQL 18 export/public-key restore passed; writes, wrong CA and wrong TLS hostname refused.'
