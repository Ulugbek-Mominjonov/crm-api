# Joriy holat va davom ettirish

> **Yangi sessiyada shu fayldan boshlang.** Reja va katakchalar:
> [PLAN.md](./PLAN.md). Texnik topshiriq: `../../backend-tz/`.

## Qayerdan davom etish

```bash
cd /home/ulugbek/personal/back/crm-api
./scripts/task.sh status     # nechta vazifa bajarildi
./scripts/task.sh next       # keyingi bajarilmagan vazifa
npm run services:up          # postgres + redis + minio (docker)
npm run verify               # lint + typecheck + testlar
```

Vazifa tugagach: `./scripts/task.sh done T-0NN` — katakcha va epik
hisobi avtomatik yangilanadi.

## Muhit (bu mashinada)

| Narsa | Holat |
|-------|-------|
| Node / npm | 24.17 / 11.13 |
| Docker | bor; **`docker compose` plagini YO'Q** → `scripts/dev-services.sh` |
| Postgres | Docker konteynerda, **port 5433** (native PG 5432 da band) |
| Redis | Docker konteynerda, **port 6380** (native Redis 6379 da band) |
| MinIO | Docker, 9000/9001; bucket: `crm-media-dev`, `crm-backup-dev` |
| sudo | parol so'raydi — ishlatib bo'lmaydi |

## Rejadan chetlanishlar (sabab bilan)

| # | Chetlanish | Sabab |
|---|-----------|-------|
| C1 | Monorepo `apps/web` ni O'Z ICHIGA OLMAYDI | Frontend `personal/front/crm-qurilish` da qoladi (foydalanuvchi papka tartibi). Bu repo: `apps/api` + `packages/shared` |
| C2 | `packages/shared` frontenddan **nusxa** olindi | Ikki repo alohida. Frontend keyinchalik `@crm/shared` ga o'tadi (T-099…T-102) |
| C3 | Test yuguruvchi — **Vitest**, Jest emas | Frontendning mavjud 76 sof funksiya testi vitest'da yozilgan; ularni qayta yozish DRY'ga zid. NestJS DI uchun `unplugin-swc` ishlatiladi |
| C4 | Postgres 18 (native) o'rniga **Docker'da PG 16** | TZ 16 ni belgilaydi; native serverda rol yaratish uchun sudo kerak |
| C5 | `docker-compose.yml` yozilgan, lekin **`scripts/dev-services.sh` bilan tekshirilgan** | Mashinada compose plagini yo'q |

## Bajarilgan vazifalar — tekshiruv dalillari

| Vazifa | Tekshirish | Natija |
|--------|-----------|--------|
| T-001 | `npm run build && npm test` | ✅ workspace yig'iladi |
| T-002 | shared'da alias qolmagan | ✅ `grep '@/'` → 0 |
| T-003 | `npm test -w packages/shared` | ✅ 6 fayl / **76 test** |
| T-004 | `npm run build -w @crm/api` | ✅ `dist/main.js` ishlaydi |
| T-005 | `npm run verify` | ✅ lint + typecheck + testlar |
| T-007 | `DATABASE_URL= node dist/main.js` | ✅ aniq xato + exit 1 |
| T-008 | `vitest run src/prisma` | ✅ 3 test; real bazaga ulanish tasdiqlandi |

## Keyingi qadamlar

1. **T-006** — MinIO obrazi yuklanishi kutilmoqda (`docker images \| grep minio`)
2. **T-009…T-013** — global pipe/filtr, log, health, Swagger, shutdown
3. **T-014…T-022** — Prisma sxemasi (30 jadval), migratsiya, triggerlar, seed

## Muhim eslatmalar

- `apps/api/.env` mahalliy (repoda yo'q). Namuna: `.env.example`
- JWT kalitlari: `apps/api/secrets/` (repoda yo'q) — `scripts/gen-keys.sh`
- Sxema yozishda tartib: invariantlar → sxema (TZ tavsiyasi)
