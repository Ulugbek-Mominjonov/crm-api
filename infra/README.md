# Production deploy (bepul: Oracle A1 + Cloudflare R2/Pages)

Manba: `backend-tz/core/11-deploy-free.md`. Bu papkadagi fayllar serverda
`/opt/crm/` ga ko'chiriladi (`.env`, `secrets/` — faqat serverda).

| Fayl | Vazifa |
|------|--------|
| `vm-setup.sh` | VM: docker, ufw + Oracle iptables, swap, SSH faqat kalit (T-115) |
| `docker-compose.prod.yml` | postgres + redis + api + caddy; baza tashqariga chiqmaydi (T-116) |
| `postgres.conf` | 12 GB RAM uchun, `pg_stat_statements` + `auto_explain` (T-117) |
| `Caddyfile` | TLS avtomatik, Swagger 404, xavfsizlik sarlavhalari (T-116) |
| `.env.prod.example` | `/opt/crm/.env` namunasi — qiymatsiz |
| `r2-cors.json`, `r2-lifecycle.json` | R2 bucket sozlamalari (T-118) |
| `backup.sh`, `verify-backup.sh` | shifrlangan kunlik zaxira va tiklash sinovi (T-121) |

## 1. Bir martalik tayyorlash

```bash
scp infra/vm-setup.sh ubuntu@IP: && ssh ubuntu@IP 'sudo bash vm-setup.sh'
scp infra/{docker-compose.prod.yml,postgres.conf,Caddyfile,backup.sh,verify-backup.sh} ubuntu@IP:/opt/crm/
# Serverda:
cp .env.prod.example .env && nano .env                  # sirlar
openssl rand -base64 32 > secrets/db_password.txt
openssl genrsa -out secrets/jwt_private.pem 2048
openssl rsa -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem
chmod 600 secrets/*
```

R2: `crm-media-prod`, `crm-backup-prod`; API token — **faqat shu ikki
bucket**ka Object Read & Write; CORS — `r2-cors.json` (frontend domeni),
lifecycle — `r2-lifecycle.json`. Zaxira bucket kaliti o'chirish huquqisiz
bo'lgani ma'qul (09 §9.16).

## 2. Birinchi ishga tushirish

```bash
docker compose -f docker-compose.prod.yml up -d db redis
# Migratsiya — ALOHIDA qadam (08 §8.4), jadval egasi bilan
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
# Ilova roli paroli (migratsiya uni 'crm_app' bilan yaratadi) va so'rov statistikasi (T-117)
docker compose -f docker-compose.prod.yml exec db psql -U crm -d crm \
  -c "ALTER ROLE crm_app PASSWORD '...'" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"
docker compose -f docker-compose.prod.yml up -d
curl -fsS https://$API_DOMAIN/health/ready
```

> Jadval egasi (`crm`, `POSTGRES_USER`) superuser: SECURITY DEFINER
> funksiyalar (`tenants_with_*`, `refresh_report_views`) tenantlararo
> ishlaydi — `FORCE RLS` egaga ham qo'llanadi, superuser/BYPASSRLS shart.

## 3. Yangilash

CI (`.github/workflows/deploy.yml`) `main` ga push'da ARM64 obraz yig'adi,
serverda `migrate deploy` ni alohida bajaradi (yiqilsa — deploy to'xtaydi),
keyin faqat `api` ni almashtiradi.

## 4. Zaxira

```cron
0 3 * * *  /opt/crm/backup.sh        >> /var/log/crm-backup.log 2>&1
0 4 * * 0  /opt/crm/verify-backup.sh >> /var/log/crm-backup.log 2>&1
```

`backup.env`: `AGE_PUBLIC_KEY`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `BACKUP_BUCKET`. Shifr kaliti (age secret key)
serverda SAQLANMAYDI — tiklash sinovida vaqtincha beriladi (`AGE_KEY_FILE`).

## 5. Kuzatuv (T-122)

- UptimeRobot: `https://$API_DOMAIN/health/ready` (5 daq)
- Sentry: `.env` da `SENTRY_DSN` — 5xx xatolar yuboriladi
- Loglar: docker `json-file` rotatsiyasi (20 MB × 5), Caddy access log 50 MB × 5
