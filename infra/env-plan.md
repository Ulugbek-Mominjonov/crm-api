# Env'ni GitHub Environments orqali boshqarish — reja (T-130, T-131)

> **Holat: reja, bajarilmagan.** Egasi qarori (2026-09-29): hozircha joriy tartib qoladi —
> ilova qiymatlari serverdagi `/opt/crm/.env` da, qo'lda ([README.md](./README.md) 1-bo'lim).
> Vazifalar: [PLAN.md](../PLAN.md) T-130, T-131.

## Hozirgi holat va nega o'zgartirish kerak

Ilova qiymatlari GitHub'da yo'q: faqat serverdagi `/opt/crm/.env` (compose `env_file`) va
`secrets/` (Docker secrets). GitHub'da — faqat deploy uchun `SSH_*` secret'lari. Bu TZ bo'yicha
([11 §11.5](../../../backend-tz/core/11-deploy-free.md#115-docker-composeprodyml),
[03 §3.12](../../../backend-tz/core/03-security.md#312-sirlarni-boshqarish)) va bitta server,
bitta muhit uchun eng sodda yo'l edi. Kamchiliklari:

- o'zgarish tarixi yo'q, har o'zgarish — SSH orqali qo'lda;
- namuna (`.env.prod.example`) va real `.env` ajralib ketadi (masalan `RELEASE` hech qachon yozilmagan);
- majburiy yangi o'zgaruvchi serverga qo'shilmay qolsa, deploy konteynerni almashtirib bo'lgach
  yiqiladi — sayt to'xtaydi (deploy orqaga qaytmaydi);
- `backup.sh` faqat bazani zaxiralaydi — `.env` va `secrets/` ning nusxasi yo'q;
- staging qo'shilsa hammasi ikki joyda qo'lda.

## Maqsad va chegara

Ilova qiymatlarining **yagona manbasi** — GitHub Environment (`production`, keyin `staging`);
deploy `/opt/crm/.env` ni har safar shulardan yig'adi. Yangi o'zgaruvchi — GitHub UI'da (GitLab
CI/CD Variables kabi), serverga SSH shart emas.

**Kirmaydi:** JWT kalitlari va `db_password.txt` (fayl sirlar, serverda qoladi — almashtirish
alohida jarayon), `backup.env`, `/opt/edge/.env` (Caddy).

## Faza 0 — Tayyorgarlik (kod o'zgarmaydi)

1. Serverdagi kalit nomlari (qiymatsiz): `ssh deploy@IP "cut -d= -f1 /opt/crm/.env"` —
   `apps/api/src/config/env.schema.ts` bilan solishtiriladi.
2. Nomlash: ilova o'zgaruvchilari **`APP_` prefiksi** bilan (`APP_DATABASE_URL`). Deploy faqat
   shularni oladi — CI'ning o'z secret'lari (`SSH_KEY` …) `.env` ga tushmaydi, yangi o'zgaruvchi
   uchun workflow o'zgarmaydi.
3. Variable yoki Secret (environment darajasida, repository darajasida EMAS — staging farq qilsin):

   | Variables (ochiq — ko'rinadi, tahrirlanadi) | Secrets (yashirin) |
   |---|---|
   | `NODE_ENV`, `LOG_LEVEL`, `CACHE_DRIVER`, `QUEUE_DRIVER`, `REDIS_URL`, `JWT_*_KEY_PATH`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `WEB_ORIGINS`, `TRUST_PROXY`, `SWAGGER_ENABLED`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_BACKUP_BUCKET`, `S3_FORCE_PATH_STYLE`, `SMS_PROVIDER`, `SMS_SENDER`, `SMS_DAILY_LIMIT`, `PAYME_MERCHANT_ID`, `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `OFD_ENABLED`, `OFD_ENDPOINT`, `*_INTERVAL_MS` | `DATABASE_URL`, `DIRECT_DATABASE_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `SMS_TOKEN`, `PAYME_KEY`, `CLICK_SECRET_KEY`, `OFD_TOKEN`, `SENTRY_DSN` |

4. `production` environment himoyasi: *Deployment branches* — faqat `master`; ixtiyoriy
   *Required reviewers*.
5. Qiymatlar GitHub'ga ko'chiriladi (UI yoki `gh secret set APP_X --env production`). GitHub
   secret'ini qayta o'qib bo'lmaydi — boshlang'ich qiymatlarning shifrlangan (age) nusxasi oflayn
   saqlanadi.

## Faza 1 — `deploy.yml`

1. **`.env` ni yig'ish** (runner'da, `app.env`). Taxminiy ko'rinish:

   ```yaml
   - name: .env ni GitHub'dan yig'ish
     env:
       VARS: ${{ toJSON(vars) }}
       SECRETS: ${{ toJSON(secrets) }}
     run: |
       umask 077
       jq -rn --argjson v "$VARS" --argjson s "$SECRETS" \
         '($v + $s) | to_entries[] | select(.key | startswith("APP_"))
          | "\(.key | ltrimstr("APP_"))='\(.value)'"' > app.env
   ```

   - Qiymat bitta tirnoq ichida — compose uni o'zgartirmaydi (`$`, `#` belgilari).
   - Qiymatda yangi qator yoki `'` bo'lsa, bir nom ham variable, ham secret bo'lsa — qadam yiqiladi.
   - `set -x` ishlatilmaydi; secret qiymatlari logda baribir `***`.
2. **Serverga yuborish** — `appleboy/scp-action` (hozirgi `SSH_*` secret'lari bilan):
   `app.env` → `/opt/crm/.env.new`. Step output orqali EMAS: sir bo'lgan output'ni GitHub
   keyingi qadamga o'tkazmaydi.
3. **Serverdagi skript** — tartib muhim:

   ```bash
   cp .env .env.prev                         # orqaga qaytish uchun
   { cat .env.new; printf 'GH_OWNER=%s\nTAG=%s\nRELEASE=%s\n' "$GH_OWNER" "$TAG" "$TAG"; } > .env
   # Sxema tekshiruvi — yangi obraz, yangi .env; ishlab turgan konteyner tegilmaydi
   compose run --rm --no-deps api node -e "require('./dist/config/env.schema').parseEnv(process.env)" \
     || { mv .env.prev .env; exit 1; }
   compose run --rm api npx prisma migrate deploy
   compose up -d --no-deps api
   # sog'liq tekshiruvi yiqilsa: .env.prev va eski TAG bilan qaytarish (rollback)
   ```

   - Majburiy o'zgaruvchi yo'q bo'lsa, deploy konteyner almashishidan OLDIN to'xtaydi — sayt
     ishlab turaveradi.
   - `RELEASE` = `TAG`: Sentry'da versiya ko'rinadi.
   - `.env` boshiga izoh: «AVTOMATIK YARATILADI — GitHub'da tahrirlang».
4. **`config_only`** (`workflow_dispatch` parametri): obraz yig'ilmaydi, serverdagi joriy `TAG`
   bilan faqat `.env` qo'llanadi — GitHub'da qiymat o'zgargach *Run workflow*, 1–2 daqiqa.

## Faza 2 — Sinov va o'tish

1. `dry_run` parametri: yig'adi, sxemada tekshiradi va serverdagi `.env` bilan solishtiradi —
   faqat kalit nomlari va qiymat xeshlari chiqadi, qiymatlar logga tushmaydi. `.env` almashmaydi.
2. Kutilmagan farq qolmagach — oddiy deploy. Shundan keyin serverdagi qo'lda tahrir keyingi
   deploy'da ustidan yoziladi.

## Faza 3 — Hujjatlar

- [README.md](./README.md): 0-bo'lim (GitHub'dagi `APP_*` ro'yxati), 1-bo'lim (ilova `.env` i
  qo'lda yozilmaydi), 4-bo'lim (yangilash va `config_only`).
- `.env.prod.example` → `APP_*` nomlari va har birining turi (variable/secret).
- [PROGRESS.md](../PROGRESS.md) — qaror (Q-raqam).

<a id="staging"></a>

## Faza 4 — Staging (T-131)

- GitHub'da `staging` environment o'z `APP_*` qiymatlari bilan; masalan `develop` → staging,
  `master` → production.
- Alohida: baza, R2 bucket'lari (`crm-media-staging`, `crm-backup-staging`), domen (masalan
  `staging.crm.workspaces.uz`), compose loyiha (`/opt/crm-staging`).
- Kodda: `apps/api/src/modules/auth/auth-cookies.ts` — `secure: NODE_ENV === 'production'`;
  staging HTTPS'da ham refresh cookie `Secure` bo'lishi uchun shart o'zgaradi. Sxema
  `NODE_ENV=staging` ni allaqachon qabul qiladi; seed faqat production'ni rad etadi (staging'da
  demo ma'lumot mumkin).

## O'tishdan keyin: yangi o'zgaruvchi qo'shish

1. `env.schema.ts` + `apps/api/.env.example` (testda kerak bo'lsa `.env.test`) → PR.
2. **Merge'dan OLDIN** GitHub → Environments → `production` → `APP_<NOM>` (variable yoki secret).
3. Merge → deploy qo'llaydi. Faqat qiymat o'zgarsa — *Run workflow* (`config_only`).

2-qadam unutilsa, deploy sxema tekshiruvida to'xtaydi — sayt eski versiyada ishlab turadi.

## Xavflar

| Xavf | Himoya |
|---|---|
| GitHub'da noto'g'ri qiymat | Format — sxema tekshiruvi; egasining DB paroli — migratsiya qadami; `crm_app` paroli — sog'liq tekshiruvi → rollback |
| DB parolini faqat GitHub'da o'zgartirish | Tartib: `ALTER ROLE` → secret → deploy (README'ga yoziladi) |
| Serverdagi qo'lda tahrir yo'qoladi | `.env` boshidagi izoh + hujjat |
| Secret'ni qayta o'qib bo'lmaydi | Oflayn shifrlangan nusxa; yangi server — deploy `.env` ni qayta yig'adi |

**Hajm:** ~0,5–1 kun (workflow, `dry_run` sinovi, hujjat).
