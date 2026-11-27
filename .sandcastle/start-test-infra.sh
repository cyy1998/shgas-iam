#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if (( EUID == 0 )); then
  echo "Sandcastle test infrastructure must run as the sandbox user" >&2
  exit 1
fi

infra=/tmp/iam-test-infra
mkdir "$infra"
trap 'echo "Test infrastructure startup failed. Logs are under $infra" >&2; tail -n 25 "$infra"/*.log "$infra"/apisix/logs/error.log 2>/dev/null || true' ERR

mkdir "$infra/pgsocket"
printf '%s\n' iam_test > "$infra/pgpass"
initdb -D "$infra/pgdata" -U iam_test --pwfile="$infra/pgpass" \
  --auth-host=scram-sha-256 --auth-local=trust --no-sync --encoding=UTF8 --locale=C.UTF-8 > "$infra/initdb.log" 2>&1
rm "$infra/pgpass"
pg_ctl -D "$infra/pgdata" -l "$infra/postgres.log" -w -t 30 start \
  -o "-h 127.0.0.1 -p 55432 -k $infra/pgsocket -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c dynamic_shared_memory_type=mmap"
createdb -h "$infra/pgsocket" -p 55432 -U iam_test iam_test

ready() {
  local service=$1
  shift
  for ((attempt = 0; attempt < 60; attempt++)); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "$service did not become ready" >&2
  return 1
}

redis-server --bind 127.0.0.1 --port 56379 --dir "$infra" \
  --save "" --appendonly no --databases 32 --daemonize yes --pidfile "$infra/redis.pid" --logfile "$infra/redis.log"
ready Redis redis-cli -p 56379 -n 31 PING

etcd --data-dir "$infra/etcd" > "$infra/etcd.log" 2>&1 < /dev/null &
ready etcd etcdctl endpoint health

install=/usr/local/apisix
prefix="$infra/apisix"
config="$(dirname "$(realpath "$0")")/../apps/gateway/test-integration/support/apisix.config.yaml"
mkdir -p "$prefix/conf" "$prefix/logs" "$prefix/disk_cache_one"
ln -s "$install/apisix" "$install/deps" "$prefix/"
for entry in mime.types debug.yaml cert; do
  if [[ -e "$install/conf/$entry" ]]; then ln -s "$install/conf/$entry" "$prefix/conf/"; fi
done
if [[ -d "$install/ui" ]]; then ln -s "$install/ui" "$prefix/"; fi
sed -e 's/ip: 0.0.0.0/ip: 127.0.0.1/' -e 's/port: 9180/port: 59180/' \
  -e 's@0.0.0.0/0@127.0.0.1/32@' -e 's@http://apisix-etcd:2379@http://127.0.0.1:2379@' \
  -e '/^  node_listen:/c\  node_listen:\n    - ip: 127.0.0.1\n      port: 59080' \
  -e '/^  enable_admin:/a\  enable_ipv6: false\n  enable_control: false\n  ssl:\n    enable: false' \
  "$config" > "$prefix/conf/config.yaml"
cat >> "$prefix/conf/config.yaml" <<'YAML'

nginx_config:
  worker_processes: 1
  worker_rlimit_nofile: 2048
  event:
    worker_connections: 1024
YAML
(
  trap - ERR
  cd "$prefix"
  apisix init
  apisix init_etcd
  openresty -p "$prefix" -c conf/nginx.conf -g 'daemon on;'
) > "$infra/apisix.log" 2>&1
ready APISIX curl --fail --silent --max-time 1 --noproxy '*' \
  -H 'X-API-KEY: iam-gateway-integration-admin-key' http://127.0.0.1:59180/apisix/admin/routes
