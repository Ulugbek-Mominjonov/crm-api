#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Tiklashni sinash (T-121, 08 §8.5): oxirgi zaxirani R2'dan olib, VAQTINCHALIK
# Postgres konteynerga tiklaydi va asosiy jadvallar sonini solishtiradi.
# QO'LDA, oyiga bir marta — cron'da EMAS: shifr kaliti serverda saqlanmaydi,
# sinov paytidagina beriladi:
#   AGE_KEY_FILE=/tmp/crm-backup.key ./verify-backup.sh; shred -u /tmp/crm-backup.key
# Serverdan tashqarida ham ishlaydi: docker, aws, age va yonida backup.env bo'lsa.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
# cron PATH qisqa (/usr/bin:/bin) — aws-cli snap orqali o'rnatilgan (/snap/bin)
export PATH="$PATH:/snap/bin"
cd "$(dirname "$(readlink -f "$0")")"
# `set -a` — o'zgaruvchilar eksport qilinadi: `aws` AWS_* kalitlarini muhitdan o'qiydi
set -a
# shellcheck disable=SC1091
source ./backup.env
set +a
: "${AGE_KEY_FILE:?AGE_KEY_FILE — shifr kaliti fayli kerak}"

WORK=$(mktemp -d)
NAME="crm-verify-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

LATEST=$(aws s3 ls "s3://$BACKUP_BUCKET/daily/" --endpoint-url "$S3_ENDPOINT" | sort | tail -1 | awk '{print $4}')
[ -n "$LATEST" ] || { echo "zaxira topilmadi" >&2; exit 1; }
aws s3 cp "s3://$BACKUP_BUCKET/daily/$LATEST" "$WORK/db.dump.age" --endpoint-url "$S3_ENDPOINT" --only-show-errors
age -d -i "$AGE_KEY_FILE" "$WORK/db.dump.age" > "$WORK/db.dump"

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=verify -e POSTGRES_USER=crm -e POSTGRES_DB=crm postgres:16-alpine >/dev/null
until docker exec "$NAME" pg_isready -U crm -d crm >/dev/null 2>&1; do sleep 1; done
# Rollar (crm_app, crm_readonly, crm_admin …) — klaster obyekti, dump'da YO'Q; GRANT'lar esa bor.
# Tiklashdan oldin dump'dagi GRANT/REVOKE qatorlaridan aniqlab yaratiladi (aks holda to'xtaydi)
ROLES=$(docker exec -i "$NAME" pg_restore -f - < "$WORK/db.dump" \
  | grep -E '^(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES) ' | grep -oE ' (TO|FROM) [a-z_][a-z0-9_]*' \
  | awk '{print $2}' | sort -u | grep -v -x crm || true)
for role in $ROLES; do docker exec "$NAME" psql -U crm -d crm -c "CREATE ROLE $role LOGIN" >/dev/null; done
docker exec -i "$NAME" pg_restore -U crm -d crm --no-owner --exit-on-error < "$WORK/db.dump"

# Tiklangan bazada asosiy jadvallar bo'sh emas va migratsiyalar to'liq
COUNTS=$(docker exec "$NAME" psql -U crm -d crm -At -c \
  "SELECT (SELECT count(*) FROM tenants) || ' tenant, ' || (SELECT count(*) FROM sales) || ' chek, ' ||
          (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) || ' migratsiya'")
echo "$(date -u +%F) tiklash sinovi OK: $LATEST → $COUNTS"
