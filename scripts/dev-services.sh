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

  # `minio/minio` Docker Hub'da endi yo'q — Chainguard uni manbadan yig'adi (bepul faqat `latest`).
  # Obrazda qobiq va `mc` yo'q: tayyorlik — xostdan HTTP. Root — avvalgi `minio/minio` (root)
  # yozgan hajm bilan ham ishlasin (obraz sukut bo'yicha uid 65532)
  run_if_absent "$MN" docker run -d --name "$MN" --network "$NET" --user 0:0 \
    -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
    -p 9000:9000 -p 9001:9001 -v crm-dev-miniodata:/data \
    cgr.dev/chainguard/minio:latest server /data --console-address ':9001'

  wait_healthy "$PG"; wait_healthy "$RD"; wait_http "$MN" http://localhost:9000/minio/health/live

  # `mc` — alohida obraz, qobiqsiz: ulanish `MC_HOST_local` orqali
  docker run --rm --network "$NET" -e MC_HOST_local="http://minioadmin:minioadmin@$MN:9000" \
    cgr.dev/chainguard/minio-client:latest mb --ignore-existing \
    local/crm-media-dev local/crm-backup-dev local/crm-media-test local/crm-backup-test >/dev/null
  echo 'bucketlar tayyor: crm-media-dev, crm-backup-dev, crm-media-test, crm-backup-test'

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

# Ichida tekshiruv vositasi yo'q obrazlar uchun — xostdan
wait_http() {
  local name="$1" url="$2"
  for _ in $(seq 1 60); do
    curl -fsS "$url" >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "XATO: $name javob bermadi ($url)" >&2
  docker logs --tail 20 "$name" >&2
  return 1
}

status() {
  printf '%-16s %-10s %s\n' SERVIS HOLAT PORT
  for c in "$PG:5433" "$RD:6380" "$MN:9000"; do
    n="${c%%:*}"; p="${c##*:}"
    h=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$n" 2>/dev/null || echo "yo'q")
    printf '%-16s %-10s %s\n' "$n" "$h" "$p"
  done
}

down()  { docker rm -f "$PG" "$RD" "$MN" >/dev/null 2>&1 || true; echo "to'xtatildi"; }
purge() { down; docker volume rm -f crm-dev-pgdata crm-dev-miniodata >/dev/null 2>&1 || true; echo "hajmlar o'chirildi"; }

case "${1:-up}" in
  up) up ;; down) down ;; status) status ;; purge) purge ;;
  *) echo "foydalanish: $0 {up|down|status|purge}"; exit 1 ;;
esac
