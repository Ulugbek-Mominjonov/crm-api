# Production deploy: bitta Contabo VPS (frontend + API + baza), Cloudflare (DNS, R2)

Manba: `backend-tz/core/11-deploy-free.md` (u Oracle Always Free va Cloudflare Pages uchun yozilgan;
server — Contabo VPS, frontend ham shu serverda: PROGRESS C35, C36). Server boshqa loyihalar bilan
umumiy bo'lishi mumkin — shuning uchun 80/443 ni BITTA umumiy Caddy (`/opt/edge`) egallaydi,
loyihalar esa unga o'z domeni bilan ulanadi.

```
Internet ──► /opt/edge  Caddy (80/443, TLS) ── edge tarmog'i ──┬─► crm-api:3000  (/opt/crm: api, db, redis)
             sites/crm.caddy: crm.<domen>                        └─► <boshqa loyiha>
             /opt/www/crm  ◄── frontend build (statik)
R2 (Cloudflare): fayllar va shifrlangan zaxira — server tashqarisida
```

| Fayl | Serverda | Vazifa |
|------|----------|--------|
| `vm-setup.sh` | — | VPS: `deploy` foydalanuvchisi, docker, ufw, fail2ban, swap, SSH faqat kalit, `edge` tarmog'i (T-115) |
| `edge/docker-compose.yml`, `edge/Caddyfile`, `edge/.env.example` | `/opt/edge/` | Umumiy kirish: bitta Caddy, TLS avtomatik |
| `edge/sites/crm.caddy` | `/opt/edge/sites/` | CRM sayti: frontend + `/api`, `/socket.io`, `/health` → API; Swagger — `/api/docs` (`SWAGGER_ENABLED`) (T-116, T-119) |
| `docker-compose.prod.yml`, `postgres.conf` | `/opt/crm/` | postgres + redis + api; port chiqarmaydi (T-116, T-117) |
| `.env.prod.example`, `backup.env.example` | `/opt/crm/` | `.env`, `backup.env` namunalari — qiymatsiz |
| `backup.sh`, `verify-backup.sh` | `/opt/crm/` | shifrlangan kunlik zaxira va tiklash sinovi (T-121) |
| `r2-cors.json`, `r2-lifecycle.json` | — (Cloudflare) | R2 bucket sozlamalari (T-118) |

## Resurslar (4 CPU, 8 GB RAM, 100 GB SSD)

| Kim | Xotira | Izoh |
|-----|--------|------|
| OS, Docker, umumiy Caddy | ~0,7 GB | |
| CRM: API | ≤ 1 GB (odatda 300–500 MB) | compose'da chegara |
| CRM: Postgres | ~1,5 GB | `shared_buffers = 1GB` (`postgres.conf`) |
| CRM: Redis | ≤ 256 MB | `maxmemory` |
| **Keyingi loyihalar** | **~4 GB** | + 4 GB swap (xavfsizlik uchun) |

Disk: fayllar R2'da — serverda faqat baza (dastlabki yillarda kichik); obrazlar deploy'dan keyin
tozalanadi (`docker image prune`), loglar aylanadi. Baza o'sganda yoki server faqat CRM'niki bo'lib
qolsa — `postgres.conf` ni kattalashtirib `docker compose -f docker-compose.prod.yml restart db`
(sarlavhasida 8 GB'lik alohida server qiymatlari).

## 0. Hisoblar va DNS (bir marta)

- **Domen — Cloudflare'da.** `crm.<domen>` — A yozuv → server IP, **DNS only** (kulrang bulut):
  Caddy sertifikatni o'zi oladi va mijoz IP'sini ko'radi (`TRUST_PROXY=1`). Proksi (to'q sariq)
  yoqilsa rate limit Cloudflare IP'si bo'yicha bo'lib qoladi. Alohida `api.` subdomen KERAK EMAS.
- **R2 (T-118):** `crm-media-prod`, `crm-backup-prod`; API token — **faqat shu ikki bucket**ka
  Object Read & Write; CORS — `r2-cors.json` (`AllowedOrigins` — `https://crm.<domen>`), lifecycle —
  `r2-lifecycle.json`. Lokalda tekshirish:
  `S3_SMOKE_ENDPOINT=… S3_SMOKE_ACCESS_KEY=… S3_SMOKE_SECRET_KEY=… S3_SMOKE_ORIGIN=https://crm.<domen> npm run test:e2e -w @crm/api -- s3-prod-smoke`
- **Deploy kaliti:** `ssh-keygen -t ed25519 -f crm-deploy -N ''` — ochiq qismi serverga (1-bo'lim),
  maxfiy qismi backend repo'sining GitHub'iga. Serverda to'liq huquq (docker, sudo) — boshqa repoga bermang.
- **Frontend yuklash kaliti (T-119):** frontend dasturchi o'zi yaratadi
  (`ssh-keygen -t ed25519 -f crm-web-deploy -N ''`) va faqat `crm-web-deploy.pub` ni yuboradi — maxfiy
  qismi uning GitHub secret'ida qoladi; serverda FAQAT `/opt/www/crm` ga `rsync` qila oladi (1-bo'lim).
- **GitHub (T-120)** → Settings → Environments → `production`: secrets `SSH_HOST` (server IP),
  `SSH_KEY` (`crm-deploy` fayli), ixtiyoriy `SSH_USER` (sukut `deploy`) va `SSH_FINGERPRINT` (tavsiya,
  1-bo'lim). Server ARM bo'lsa — variables `DEPLOY_PLATFORM=linux/arm64` (sukut `linux/amd64`).
- **Zaxira kaliti:** o'z kompyuteringizda `age-keygen -o crm-backup.key`. Ochiq kalit (`age1…`) —
  `backup.env` ga; maxfiy kalit — xavfsiz joyda (serverga QO'YILMAYDI; tiklash uchun shart).

## 1. Serverni tayyorlash (T-115)

Contabo faqat `root` beradi — skript `deploy` foydalanuvchisini yaratadi, root'ning kalitlarini unga
ko'chiradi va shundan KEYIN parol hamda root bilan kirishni yopadi (kalit bo'lmasa — yopmaydi).

```bash
ssh-copy-id root@IP                                          # panelda qo'shilmagan bo'lsa
scp infra/vm-setup.sh root@IP:
ssh root@IP "SSH_PUBKEY='$(cat crm-deploy.pub)' bash vm-setup.sh"
# Endi faqat: ssh deploy@IP
# Frontend kaliti — FAQAT /opt/www/crm ga rsync (shell, port yo'naltirish yo'q; `..` rad etiladi)
ssh deploy@IP "echo 'restrict,command=\"/usr/bin/rrsync /opt/www/crm\" $(cat crm-web-deploy.pub)' >> ~/.ssh/authorized_keys"
# GitHub secret'lari: SSH_FINGERPRINT (backend) va SSH_KNOWN_HOSTS (frontend). ECDSA — ed25519 EMAS:
# ssh-action klienti ECDSA kalitini tanlaydi, boshqa iz bilan deploy "fingerprint mismatch" bo'ladi
ssh deploy@IP ssh-keygen -lf /etc/ssh/ssh_host_ecdsa_key.pub | cut -d' ' -f2
ssh-keyscan -t ed25519 IP
scp infra/edge/{docker-compose.yml,Caddyfile,.env.example} deploy@IP:/opt/edge/
scp infra/edge/sites/crm.caddy deploy@IP:/opt/edge/sites/
scp infra/{docker-compose.prod.yml,postgres.conf,backup.sh,verify-backup.sh,.env.prod.example,backup.env.example} deploy@IP:/opt/crm/
```

Serverda (`ssh deploy@IP`). Parollar — **hex** (ulanish URL'ida `/`, `+` buziladi):

```bash
cd /opt/edge && cp .env.example .env && nano .env      # ACME_EMAIL, CRM_DOMAIN
cd /opt/crm && cp .env.prod.example .env && cp backup.env.example backup.env
openssl rand -hex 32 > secrets/db_password.txt        # jadval egasi `crm` — DIRECT_DATABASE_URL da shu
openssl rand -hex 24                                  # ilova roli `crm_app` — DATABASE_URL da shu
openssl genrsa -out secrets/jwt_private.pem 2048
openssl rsa -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem
nano .env && nano backup.env                          # parollar, WEB_ORIGINS=https://crm.<domen>, GH_OWNER, R2 …
chmod 600 .env backup.env /opt/edge/.env
# Kalitlarni konteynerdagi `app` foydalanuvchisi o'qiy olishi SHART (openssl maxfiy kalitni 600
# qiladi — API ishga tushmaydi). Serverda ularni `secrets/` papkasi himoya qiladi (700, faqat deploy)
chmod 644 secrets/*
```

## 2. Birinchi ishga tushirish (T-116)

```bash
cd /opt/edge && docker compose up -d                  # umumiy Caddy (sertifikat — birinchi so'rovda)
cd /opt/crm
docker compose -f docker-compose.prod.yml up -d db redis
# Ilova roli — migratsiyadan OLDIN, .env dagi DATABASE_URL paroli bilan (aks holda migratsiya
# uni sukut 'crm_app' paroli bilan yaratadi); so'rov statistikasi (T-117)
docker compose -f docker-compose.prod.yml exec db psql -U crm -d crm \
  -c "CREATE ROLE crm_app LOGIN PASSWORD '<crm_app paroli>'" \
  -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"
```

Keyin GitHub → Actions → **deploy** → *Run workflow*: obraz yig'iladi, serverda migratsiya
bajariladi, `api` ishga tushadi, `https://$CRM_DOMAIN/health/ready` tekshiriladi.

> Jadval egasi (`crm`, `POSTGRES_USER`) superuser: SECURITY DEFINER
> funksiyalar (`tenants_with_*`, `refresh_report_views`) tenantlararo
> ishlaydi — `FORCE RLS` egaga ham qo'llanadi, superuser/BYPASSRLS shart.

Actions'siz (favqulodda): serverda repo nusxasidan
`docker build -f apps/api/Dockerfile -t ghcr.io/$GH_OWNER/crm-api:manual .`, `.env` da `TAG=manual`,
keyin `docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy` va
`docker compose -f docker-compose.prod.yml up -d`.

## 3. Frontend (T-119)

Frontend (`crm-qurilish`) — shu domenning o'zida: `VITE_API_URL` **bo'sh** (nisbiy `/api/v1`),
socket — `io('/events')`, CORS yo'q; dev'dagi Vite proksi bilan bir xil. Build `/opt/www/crm` ga
IKKI bosqichda yuklanadi — avval yangi hash'li fayllar, keyin `index.html` va qolgani (yuklash
paytida ochgan foydalanuvchi yarim versiyaga tushmasin). `crm-web-deploy` kaliti bilan yo'llar
`/opt/www/crm` ga NISBATAN:

```bash
npm ci && npm run build
export RSYNC_RSH='ssh -i crm-web-deploy'
rsync -a dist/assets/ deploy@IP:assets/
rsync -a --delete dist/ deploy@IP:
```

Frontend repo'si uchun GitHub Actions namunasi — `docs/api/README.md` §3.1 (secrets: `SSH_HOST`,
`WEB_DEPLOY_KEY` — `crm-web-deploy` fayli, `SSH_KNOWN_HOSTS` — 1-bo'limdagi `ssh-keyscan` natijasi).
Caddy: `index.html`, `sw.js` — keshsiz (yangi versiya darhol), `/assets/*` — 1 yil; noma'lum yo'l —
`index.html` (SPA), yo'q asset — 404.

## 4. Yangilash (T-120)

`master` ga push (`apps/api`, `packages/shared` yoki `package-lock.json` o'zgarsa) yoki
*Run workflow*:

1. obraz `ghcr.io/<egasi>/crm-api:<commit>` (server arxitekturasi uchun);
2. serverda GHCR'ga shu deploy'ning qisqa muddatli tokeni bilan kiriladi (keyin chiqiladi), obraz olinadi;
3. migratsiya — ALOHIDA qadam: yiqilsa deploy to'xtaydi, eski versiya ishlab turadi;
4. joriy `TAG` va `GH_OWNER` `.env` ga yoziladi — qo'lda `docker compose up` ham aynan shu obrazni oladi;
5. faqat `api` almashadi (Caddy, baza, Redis tegilmaydi), tashqaridan sog'liq tekshiruvi; yiqilsa — ish
   qizil, `api` loglari chiqariladi.

`infra/` dagi fayllar serverga AVTOMATIK ko'chirilmaydi — o'zgarsa `scp` bilan, keyin tegishli
papkada `docker compose … up -d`. Caddy fayllari (`Caddyfile`, `sites/*.caddy`) — UZILISHSIZ:

```bash
cd /opt/edge && docker compose exec -w /etc/caddy caddy caddy reload
```

Xato bo'lsa buyruq rad etadi va eski konfiguratsiya ishlab turadi — faylni darhol tuzating (aks
holda keyingi qayta ishga tushishda Caddy, u bilan BARCHA saytlar ko'tarilmaydi). `restart` emas:
u serverdagi hamma loyihani to'xtatadi.

## 5. Zaxira (T-121)

```cron
# crontab -e (deploy foydalanuvchisi). Vaqt — SERVER soati bo'yicha (Contabo: Europe/Berlin):
# 00:00 = Toshkentda 03:00–04:00
0 0 * * *  /opt/crm/backup.sh >> /opt/crm/backup.log 2>&1
```

Kunlik — `daily/` (30 kun saqlanadi), yakshanba — `weekly/` (90), oyning 1-kuni — `monthly/` (365).

**Tiklash sinovi — qo'lda, oyiga bir marta** (cron'da emas: shifr kaliti serverda saqlanmaydi):

```bash
scp crm-backup.key deploy@IP:/tmp/
ssh deploy@IP 'cd /opt/crm && AGE_KEY_FILE=/tmp/crm-backup.key ./verify-backup.sh; shred -u /tmp/crm-backup.key'
```

Serverdan tashqarida ham ishlaydi: docker, aws, age va yonida `backup.env` bo'lgan kompyuterda.
Birinchi sinov natijasi PROGRESS.md ga yoziladi (T-121 qabul mezoni).

## 6. Kuzatuv (T-122)

- UptimeRobot: `https://$CRM_DOMAIN/health/ready` (5 daq)
- Sentry: `/opt/crm/.env` da `SENTRY_DSN` — 5xx xatolar yuboriladi
- Loglar: docker `json-file` rotatsiyasi (20 MB × 5), Caddy access log (`/data/logs/crm-access.log`) 50 MB × 5

## 7. Yangi loyiha qo'shish

1. Cloudflare: `<loyiha>.<domen>` → server IP (DNS only).
2. `/opt/<loyiha>/`: o'z compose'i; tashqariga PORT CHIQARMAYDI; ilova konteyneri `edge` tarmog'ida
   noyob nom (alias) bilan — masalan `shop-api` (`crm-api` ga o'xshab):
   `networks: { default: {}, edge: { aliases: [shop-api] } }` va `networks: { edge: { external: true } }`.
3. `/opt/edge/sites/<loyiha>.caddy` (`crm.caddy` namunasi) → `caddy reload` (4-bo'lim).
4. Statik frontend bo'lsa — `/opt/www/<loyiha>/` (Caddy'da `/srv/<loyiha>`); yuklash kaliti —
   o'zining, `rrsync /opt/www/<loyiha>` bilan cheklangan (1-bo'lim).
5. Baza: loyihaning o'z Postgres konteyneri (sodda, mustaqil) — `shared_buffers` ni kichik qo'ying
   (masalan 256MB) va jadvaldagi xotira byudjetini yangilang.

## 8. Bazaga ulanish (DBeaver)

Baza internetga ochilmaydi — faqat serverning o'zida (`127.0.0.1:5432`), ulanish SSH tunnel orqali.
Ko'rish uchun alohida **faqat o'qiydigan** rol `crm_readonly`: barcha do'konlarni ko'radi
(`BYPASSRLS`), lekin yoza olmaydi va `purge_tenant` kabi funksiyalarni chaqira olmaydi. Bir marta,
serverda (`/opt/crm`):

```bash
( umask 077; openssl rand -hex 24 > secrets/db_readonly_password.txt )
docker compose -f docker-compose.prod.yml exec -T db psql -U crm -d crm <<SQL
CREATE ROLE crm_readonly LOGIN BYPASSRLS PASSWORD '$(cat secrets/db_readonly_password.txt)';
ALTER ROLE crm_readonly SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE crm TO crm_readonly;
GRANT USAGE ON SCHEMA public TO crm_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO crm_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE crm IN SCHEMA public GRANT SELECT ON TABLES TO crm_readonly;
SQL
```

DBeaver → New Database Connection → PostgreSQL:
- **Main:** Host `127.0.0.1`, Port `5432`, Database `crm`, Username `crm_readonly`, Password —
  `ssh deploy@IP cat /opt/crm/secrets/db_readonly_password.txt`
- **SSH:** *Use SSH Tunnel*, Host `IP`, Port `22`, User `deploy`, Authentication — *Public Key*
  (`~/.ssh/id_ed25519`)

To'liq huquq (o'qish, qo'shish, o'zgartirish, o'chirish — barcha do'konlar) — `crm_admin`: DBeaver'da
Username `crm_admin`, parol `secrets/db_admin_password.txt`. Superuser emas, `TRUNCATE` va jadval
tuzilmasini o'zgartirish yo'q (tuzilma — faqat migratsiyalar); `audit_log` va `stock_movements` baribir
o'zgarmaydi (trigger). O'zgarishlar audit jurnaliga tushmaydi va ilova qoidalarini (qoldiq, kassa, qarz)
chetlab o'tadi — farqni tungi invariant tekshiruvi ko'rsatadi. `crm` (jadval egasi, superuser, parol
`secrets/db_password.txt`) — faqat favqulodda.

## Xavfsizlik eslatmalari

- Docker e'lon qilgan portlar ufw'ni chetlab o'tadi: tashqi `ports:` FAQAT umumiy Caddy'da (80/443);
  CRM bazasi — faqat `127.0.0.1:5432` (8-bo'lim), Redis va ilovalar — `expose`/ichki tarmoq bilan.
- `.env`, `backup.env` — `chmod 600`; `secrets/` — papka `700`, ichidagi kalitlar `644` (1-bo'lim);
  repoda yo'q. `crm-backup.key` serverda turmaydi.
- `crm-deploy` — serverda to'liq huquq: faqat backend repo'si secret'ida. Boshqa repo va
  dasturchiga — alohida, `rrsync` bilan cheklangan kalit (`crm-web-deploy` kabi).
