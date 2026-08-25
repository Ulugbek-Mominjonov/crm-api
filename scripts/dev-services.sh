#!/usr/bin/env bash
# docker-compose.yml bilan bir xil servislarni oddiy `docker run` orqali
# ko'taradi. Compose plagini o'rnatilmagan mashinalar uchun.
set -euo pipefail

NET=crm-dev
PG=crm-dev-db
RD=crm-dev-redis
MN=crm-dev-minio

up() {
  docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null

  run_if_absent "$PG" docker run -d --name "$PG" --network "$NET" \
    -e POSTGRES_DB=crm -e POSTGRES_USER=crm -e POSTGRES_PASSWORD=crm \
    -p 5433:5432 -v crm-dev-pgdata:/var/lib/postgresql/data \
    --health-cmd 'pg_isready -U crm -d crm' --health-interval 5s --health-retries 10 \
    postgres:16-alpine

  run_if_absent "$RD" docker run -d --name "$RD" --network "$NET" \
    -p 6380:6379 \
    --health-cmd 'redis-cli ping' --health-interval 5s --health-retries 10 \
    redis:7-alpine redis-server --save '' --appendonly no

  run_if_absent "$MN" docker run -d --name "$MN" --network "$NET" \
    -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
    -p 9000:9000 -p 9001:9001 -v crm-dev-miniodata:/data \
    --health-cmd 'mc ready local' --health-interval 5s --health-retries 10 \
    minio/minio:latest server /data --console-address ':9001'

  wait_healthy "$PG"; wait_healthy "$RD"; wait_healthy "$MN"

  docker run --rm --network "$NET" minio/mc:latest /bin/sh -c "
    mc alias set local http://$MN:9000 minioadmin minioadmin >/dev/null &&
    mc mb --ignore-existing local/crm-media-dev >/dev/null &&
    mc mb --ignore-existing local/crm-backup-dev >/dev/null &&
    echo 'bucketlar tayyor: crm-media-dev, crm-backup-dev'"

  status
}

run_if_absent() {
  local name="$1"; shift
  if docker inspect "$name" >/dev/null 2>&1; then
    docker start "$name" >/dev/null
  else
    "$@" >/dev/null
  fi
}

wait_healthy() {
  local name="$1"
  for _ in $(seq 1 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null)" = healthy ] && return 0
    sleep 2
  done
  echo "XATO: $name healthy bo'lmadi" >&2
  docker logs --tail 20 "$name" >&2
  return 1
}

status() {
  printf '%-16s %-10s %s\n' SERVIS HOLAT PORT
  for c in "$PG:5433" "$RD:6380" "$MN:9000"; do
    n="${c%%:*}"; p="${c##*:}"
    h=$(docker inspect -f '{{.State.Health.Status}}' "$n" 2>/dev/null || echo "yo'q")
    printf '%-16s %-10s %s\n' "$n" "$h" "$p"
  done
}

down()  { docker rm -f "$PG" "$RD" "$MN" >/dev/null 2>&1 || true; echo "to'xtatildi"; }
purge() { down; docker volume rm -f crm-dev-pgdata crm-dev-miniodata >/dev/null 2>&1 || true; echo "hajmlar o'chirildi"; }

case "${1:-up}" in
  up) up ;; down) down ;; status) status ;; purge) purge ;;
  *) echo "foydalanish: $0 {up|down|status|purge}"; exit 1 ;;
esac
