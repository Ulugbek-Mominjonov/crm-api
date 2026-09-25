#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Kunlik zaxira (T-121, 11 §11.8): pg_dump → age (shifrlash) → R2.
# cron: 0 3 * * *  /opt/crm/backup.sh >> /var/log/crm-backup.log 2>&1
# Kerak: /opt/crm/backup.env — AGE_PUBLIC_KEY, S3_ENDPOINT, AWS_ACCESS_KEY_ID,
# AWS_SECRET_ACCESS_KEY, BACKUP_BUCKET. Shifr KALITI serverda saqlanmaydi.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
cd /opt/crm
# shellcheck disable=SC1091
source ./backup.env

TS=$(date -u +%F-%H%M)
DIR=daily
[ "$(date +%u)" = "7" ] && DIR=weekly
[ "$(date +%d)" = "01" ] && DIR=monthly
OUT="/tmp/crm-$TS.dump.age"
trap 'rm -f "$OUT"' EXIT

docker compose -f docker-compose.prod.yml exec -T db pg_dump -U crm -Fc crm | age -r "$AGE_PUBLIC_KEY" > "$OUT"
# Bo'sh yoki juda kichik fayl — xato (pg_dump yiqilgan bo'lishi mumkin)
[ "$(stat -c %s "$OUT")" -gt 1024 ] || { echo "$TS: zaxira juda kichik" >&2; exit 1; }

aws s3 cp "$OUT" "s3://$BACKUP_BUCKET/$DIR/$TS.dump.age" --endpoint-url "$S3_ENDPOINT" --only-show-errors
echo "$TS: $DIR/$TS.dump.age yuklandi ($(stat -c %s "$OUT") bayt)"
