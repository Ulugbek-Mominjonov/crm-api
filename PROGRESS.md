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
| T-006 | `npm run services:up` | ✅ postgres+redis+minio healthy, 4 bucket |
| T-009 | `test:e2e -- error-shape` | ✅ 6 test; xato shakli, stack sizmaydi |
| T-010 | `test:e2e -- logging-redaction` | ✅ 2 test; parol/token loglarda yo'q |
| T-011 | `curl -f /health/ready` | ✅ 200; live/ready ajratilgan |
| T-012 | `npm run openapi` | ✅ spec yozildi; dev 200 / prod 404 |
| T-013 | `test:e2e -- security-headers` | ✅ 5 test; SIGTERM da ulanish yopiladi |
| T-014..016 | `prisma validate` | ✅ 30 jadval |
| T-017 | `test:e2e -- constraints` | ✅ 11 test; 16 CHECK + 2 qisman unique |
| T-018 | `test:e2e -- triggers` | ✅ 8 test; I1 sinxron, jurnal append-only |
| T-019 | `test:e2e -- cross-tenant` | ✅ 6 test; 33 kompozit FK |
| T-020 | `test:e2e -- explain` | ✅ 6 test; covering/partial/trigram |
| T-021 | `test:e2e -- tenant-provisioning` | ✅ 5 test; bitta tranzaksiya |
| T-022 | `npm run db:seed` | ✅ 12 mahsulot, 4 xodim, idempotent |
| T-023 | `vitest run src/modules/auth` | ✅ 12 test; argon2id, parol siyosati |
| T-024 | `test:e2e -- auth-login` | ✅ 12 test; cookie, timing, tenant tanlash |
| T-025 | `test:e2e -- auth-refresh` | ✅ 11 test; rotatsiya, o'g'irlanish aniqlash |
| T-026 | `vitest run src/common/context` | ✅ 7 test; ALS izolyatsiyasi |
| T-027 | `test:e2e -- tenant-extension` | ✅ 13 test; soxta tenantId e'tiborsiz |
| T-028 | `test:e2e -- rls` | ✅ 9 test; 28 siyosat, FORCE RLS |

## Keyingi qadamlar

**Bajarildi: E0, E1, E2 va E3 ning 6/10 qismi (28/129).**
Jami **205 test** o'tadi (76 shared + 35 unit + 94 e2e).

1. **T-029…T-032** — rollar guard'i, maydon himoyasi, izolyatsiya testi, audit
2. **T-033…T-041** — E4: spravochniklar CRUD
3. **T-042…T-049** — E5: ombor amallari (qulflash bilan)

## Qabul qilingan qarorlar (implementatsiya davomida)

| # | Qaror | Sabab |
|---|-------|-------|
| Q1 | `Product.imageUrl` sxemada YO'Q | Rasm `files` jadvali bilan T-087 da qo'shiladi (09-storage §9.5). Ishlatilmaydigan ustun qoldirilmadi |
| Q2 | Shtrix-kod uchun bitta indeks | Prisma `@@index([tenantId, barcode])` va qo'lda `products_barcode_exact` bir xil ustunlarni qamragan edi — birinchisi olib tashlandi |
| Q3 | Trigram indekslari `btree_gin` bilan tenant bo'yicha | Aks holda planner ularni tanlamaydi (har so'rov `tenant_id` bilan filtrlanadi) |
| Q4 | Trigram uchun reja testi YO'Q | GIN boshlang'ich narxi yuqori; 30k qatorda seq scan chindan arzonroq. O'rniga kechikish testi (< 100 ms) |
| Q5 | Kompozit FK'da `SET NULL` → `NO ACTION` | `(tenant_id, X_id)` da SET NULL tenant_id ni ham nolga chiqarardi. Ota yozuvlar yumshoq o'chiriladi |
| Q6 | DB testlari `test/*.e2e-spec.ts` da | Ular haqiqiy baza talab qiladi; unit konfiguratsiyasi (`src/**/*.spec.ts`) toza qoladi |
| Q7 | Login `tenantId` siz ishlaydi; ikki xil bo'lsa `AUTH_TENANT_REQUIRED` | TZ email+parol bilan kirishni belgilaydi, lekin email tenant ichida noyob. Nomzodlar `MAX_TENANT_CANDIDATES=5` bilan cheklangan |
| Q8 | Kengaytmada `tenantId` `data`/`where` OXIRIDA | Aks holda mijozdan kelgan `tenantId` avtomatik qiymatni bekor qilardi — haqiqiy zaiflik edi |
| Q9 | RLS **tranzaksiya** ichida (`inTenantTransaction`) | Ulanishlar puli ulashiladi; `SET` (LOCAL'siz) keyingi so'rovga o'tib ketardi. Moliyaviy amallar baribir tranzaksiyada |
| Q10 | Ilova roli `crm_app` (RLS qo'llanadi), migratsiya `crm` (egasi) | Jadval egasi RLS ni chetlab o'tadi — shuning uchun ilova alohida rol bilan ulanishi SHART |
| Q11 | Prisma so'rovlari `runAsSystem`/kontekst ICHIDA `await` qilinadi | `PrismaPromise` kechiktirilgan: `.then()` tashqarida chaqirilsa ALS konteksti yo'qoladi |

## Muhim eslatmalar

- `apps/api/.env` mahalliy (repoda yo'q). Namuna: `.env.example`
- JWT kalitlari: `apps/api/secrets/` (repoda yo'q) — `scripts/gen-keys.sh`
- Sxema yozishda tartib: invariantlar → sxema (TZ tavsiyasi)
