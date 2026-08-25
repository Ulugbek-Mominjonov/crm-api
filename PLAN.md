# Bajarish rejasi — `crm-api` (ishchi nusxa)

> Bu — `backend-tz/PLAN.md` skeletining **shu loyihaga tegishli ishchi
> nusxasi**. Progress SHU YERDA belgilanadi; shablondagi asl nusxa toza
> qoladi (boshqa loyihalarda qayta ishlatiladi).
>
> Joriy holat va davom ettirish yo'riqnomasi: [PROGRESS.md](./PROGRESS.md)

Har bir vazifa tugagach katakcha `[ ]` → `[x]` qilinadi va epik
jadvalidagi hisob yangilanadi.

> **Bu — skelet.** `E0–E3` (poydevor), `E11` (fayllar) va `E15` (deploy)
> deyarli har qanday savdo loyihasida bir xil. `E4–E10` esa domenga qarab
> qayta yoziladi — vazifa shakli ([templates/task.md](../../backend-tz/templates/task.md))
> saqlanadi.
>
> «Manba» ustunidagi `profiles/qurilish-crm/...` havolalari — **namuna
> profil**. O'z loyihangizda ularni `profiles/<loyiha>/...` ga almashtiring.

## Qanday ishlatiladi

Har bir vazifa quyidagi maydonlarga ega:

| Maydon | Ma'nosi |
|--------|---------|
| **Bog'liq** | Shu vazifadan oldin tugashi shart bo'lgan vazifalar |
| **Manba** | Yozishdan oldin o'qiladigan hujjat bo'limlari |
| **Fayllar** | Yaratiladigan/o'zgartiriladigan asosiy fayllar |
| **Qabul** | Bajarilganini isbotlaydigan mezonlar (har biriga test) |
| **Tekshirish** | Vazifa tugaganini ko'rsatadigan buyruq |

AI agent uchun qat'iy tartib —
[12 §12.9](../../backend-tz/core/12-standards.md#129-ai-implementatsiyasi-uchun-qoidalar).
Umumiy «tayyor» ta'rifi —
[12 §12.8](../../backend-tz/core/12-standards.md#128-git-pr-va-tayyor-tarifi).

> **Muhim:** vazifa faqat qabul mezonlarining **hammasi** bajarilganda va
> tekshirish buyrug'i muvaffaqiyatli tugaganda belgilanadi. Test yozilmagan
> mezon — bajarilmagan mezon.

## Umumiy holat

| Epik | Nomi | Vazifa | Bajarildi | Bosqich |
|------|------|--------|-----------|---------|
| E0 | Tayyorgarlik va monorepo | 6 | 5/6 | B1 |
| E1 | Server skeleti | 7 | 2/7 | B1 |
| E2 | Baza sxemasi | 9 | 0/9 | B1 |
| E3 | Auth, tenant, huquqlar | 10 | 0/10 | B1 |
| E4 | Spravochniklar (CRUD) | 9 | 0/9 | B2 |
| E5 | Ombor amallari | 8 | 0/8 | B3 |
| E6 | Savdo yadrosi | 9 | 0/9 | B3 |
| E7 | Kassa va moliya | 9 | 0/9 | B3 |
| E8 | Ta'minot va kreditorlik | 6 | 0/6 | B3 |
| E9 | Yetkazib berish va xabarlar | 5 | 0/5 | B3 |
| E10 | Hisobot va analitika | 7 | 0/7 | B3 |
| E11 | Fayl saqlash (S3) | 8 | 0/8 | B3 |
| E12 | Realtime va offline | 5 | 0/5 | B5 |
| E13 | Frontend integratsiyasi | 9 | 0/9 | B4 |
| E14 | Ma'lumot migratsiyasi | 6 | 0/6 | B4 |
| E15 | Deploy va ekspluatatsiya | 10 | 0/10 | B4 |
| E16 | SaaS (obuna) | 6 | 0/6 | B6 |
| | **Jami** | **129** | **7/129** | |

Bosqichlar: **B1** poydevor · **B2** ma'lumot serverda · **B3** moliyaviy
to'g'rilik · **B4** ishga tushirish · **B5** chidamlilik · **B6** sotish.

**Minimal ishlaydigan mahsulot: E0 → E15** (E12 va E16'siz).

---

## E0 — Tayyorgarlik va monorepo

Maqsad: server va brauzer **bitta** hisob-kitob kodini ishlatadigan bo'lsin.

- [x] **T-001 · Monorepo tuzilishi**
  - Bog'liq: —
  - Manba: [README](../../backend-tz/README.md#tuzilishi)
  - Fayllar: `package.json` (workspaces), `apps/web/`, `apps/api/`, `packages/shared/`
  - Qabul:
    - Mavjud mijoz ilovasi `apps/web/` ga ko'chirildi va ishlashda davom etadi
    - `npm run dev -w apps/web` ishlaydi, yo'l aliaslari buzilmagan
    - Root'dan `npm run build` ikkala paketni yig'adi
  - Tekshirish: `npm run build && npm test`

- [x] **T-002 · `packages/shared` yaratish**
  - Bog'liq: T-001
  - Manba: [12 §12.2](../../backend-tz/core/12-standards.md#122-clean-code)
  - Fayllar: `packages/shared/src/{types,finance,pos,units,warehouse,recurring,permissions}.ts`
  - Qabul:
    - Profildagi ro'yxat bo'yicha sof funksiyalar ko'chirildi (nusxa emas — **ko'chirish**)
    - `apps/web` ular uchun `@crm/shared` dan import qiladi
    - Mijoz ilovasida eski nusxalar qolmagan
  - Tekshirish: eski yo'l bo'yicha import qidiruvi `0` qaytaradi

- [x] **T-003 · Testlarni `shared` ga ko'chirish**
  - Bog'liq: T-002
  - Fayllar: `packages/shared/src/*.test.ts`
  - Qabul: 165 ta mavjud testdan sof funksiyalarga tegishlilari `shared` da ishlaydi; hech biri o'chirilmagan
  - Tekshirish: `npm test -w packages/shared`

- [x] **T-004 · API paketining skeleti**
  - Bog'liq: T-001
  - Fayllar: `apps/api/{package.json,tsconfig.json,nest-cli.json}`
  - Qabul: NestJS 11 + TypeScript `strict` + `@crm/shared` ga ishora; `npm run build -w apps/api` xatosiz
  - Tekshirish: `npm run build -w apps/api`

- [x] **T-005 · Lint, format, typecheck, CI skeleti**
  - Bog'liq: T-004
  - Manba: [12 §12.10](../../backend-tz/core/12-standards.md#1210-vositalar)
  - Fayllar: `.eslintrc`, `.github/workflows/ci.yml`
  - Qabul: `npm run verify` uchala paketda ishlaydi; CI push'da ishga tushadi va yiqilsa merge to'siladi
  - Tekshirish: `npm run verify`

- [ ] **T-006 · Lokal muhit (docker-compose)**
  - Bog'liq: T-004
  - Manba: [08 §8.3](../../backend-tz/core/08-operations.md#83-docker), [09 §9.3](../../backend-tz/core/09-storage.md#93-provayder-tanlovi)
  - Fayllar: `docker-compose.yml` (postgres 16, redis, minio)
  - Qabul: `docker compose up -d` uchala servis `healthy`; MinIO'da `crm-media-dev` bucket avtomatik yaratiladi
  - Tekshirish: `docker compose ps --format json | grep -c healthy` → `3`

---

## E1 — Server skeleti

- [x] **T-007 · Konfiguratsiya va uni validatsiya qilish**
  - Bog'liq: T-004
  - Manba: [08 §8.2](../../backend-tz/core/08-operations.md#82-muhit-ozgaruvchilari), [03 §3.12](../../backend-tz/core/03-security.md#312-sirlarni-boshqarish)
  - Fayllar: `apps/api/src/config/{env.schema.ts,config.module.ts}`, `.env.example`
  - Qabul:
    - Barcha o'zgaruvchi sxema bilan tekshiriladi; bittasi yetishmasa server **ishga tushmaydi** va aniq xato yozadi
    - `.env.example` da barcha kalit bor, qiymatlar bo'sh
  - Tekshirish: `DATABASE_URL= npm start -w apps/api` → aniq xato bilan chiqadi

- [x] **T-008 · Prisma moduli va ulanish**
  - Bog'liq: T-006, T-007
  - Fayllar: `apps/api/src/prisma/prisma.{module,service}.ts`
  - Qabul: `onModuleDestroy` da ulanish yopiladi; `connection_limit` konfiguratsiyadan olinadi
  - Tekshirish: `npm test -w apps/api -- prisma.service`

- [ ] **T-009 · Global pipe, filtr, interceptor**
  - Bog'liq: T-007
  - Manba: [12 §12.3](../../backend-tz/core/12-standards.md#123-xatolar), [12 §12.4](../../backend-tz/core/12-standards.md#124-validatsiya)
  - Fayllar: `common/{filters/domain-exception.filter.ts,pipes,interceptors/serialize.interceptor.ts}`
  - Qabul:
    - `ValidationPipe({whitelist:true, forbidNonWhitelisted:true})` yoqilgan
    - `DomainError` → [04 §4.1](../../backend-tz/core/04-api-conventions.md#xato-javobi) shakliga o'giriladi
    - Ichki xato hech qachon mijozga stack bermaydi
  - Tekshirish: `npm run test:e2e -- error-shape`

- [ ] **T-010 · Strukturalangan log va so'rov identifikatori**
  - Bog'liq: T-009
  - Manba: [08 §8.6](../../backend-tz/core/08-operations.md#loglar)
  - Fayllar: `common/logging/*`
  - Qabul: har log qatorida `requestId`, `tenantId`, `userId`; parol/token **hech qachon** logga tushmaydi
  - Tekshirish: `npm run test:e2e -- logging-redaction`

- [ ] **T-011 · Sog'liq endpointlari**
  - Bog'liq: T-008
  - Manba: [04 §4.15](../../backend-tz/core/04-api-conventions.md#46-sogliq-va-kuzatuv)
  - Fayllar: `modules/health/*`
  - Qabul: `/health/live` (bog'liqliksiz) va `/health/ready` (baza + S3 tekshiruvi bilan)
  - Tekshirish: `curl -f localhost:3000/health/ready`

- [ ] **T-012 · Swagger o'rnatish**
  - Bog'liq: T-009
  - Manba: [12 §12.6](../../backend-tz/core/12-standards.md#126-openapi--swagger)
  - Fayllar: `main.ts`, `common/swagger/*`
  - Qabul: `/api/docs` dev'da ochiladi, production'da 404; `npm run openapi` → `openapi.json`
  - Tekshirish: `npm run openapi && test -s apps/api/openapi.json`

- [ ] **T-013 · Graceful shutdown va xavfsizlik sarlavhalari**
  - Bog'liq: T-011
  - Manba: [08 §8.4](../../backend-tz/core/08-operations.md#graceful-shutdown), [03 §3.10](../../backend-tz/core/03-security.md#310-transport-va-sarlavhalar)
  - Qabul: `SIGTERM` da joriy so'rovlar tugatiladi; `helmet`, CORS faqat `WEB_ORIGINS` uchun
  - Tekshirish: `npm run test:e2e -- security-headers`

---

## E2 — Baza sxemasi

- [ ] **T-014 · Prisma sxemasi: infratuzilma jadvallari**
  - Bog'liq: T-008
  - Manba: [02 §2.2](../../backend-tz/profiles/qurilish-crm/02-schema.md#1-prisma-sxema)
  - Fayllar: `apps/api/prisma/schema.prisma`
  - Qabul: `Tenant`, `TenantState`, `DocCounter`, `IdempotencyKey`, `RefreshToken`, `Settings` — hammasi hujjatdagidek
  - Tekshirish: `npx prisma validate`

- [ ] **T-015 · Sxema: spravochniklar**
  - Bog'liq: T-014
  - Manba: [02 §2.2](../../backend-tz/profiles/qurilish-crm/02-schema.md#1-prisma-sxema), [10 §10.3](../../backend-tz/core/10-performance.md#103-sxemadagi-haqiqiy-takrorlanishlar--tuzatish)
  - Qabul:
    - `Employee`, `User`, `Client`, `Supplier`, `Category`, `Warehouse`, `Product`, `ProductStock`
    - **D1 qo'llanilgan**: `User.employeeId` majburiy, `name`/`position` faqat `Employee` da
    - **D4 qo'llanilgan**: `Product.categoryId` (matn emas)
  - Tekshirish: `npx prisma validate`

- [ ] **T-016 · Sxema: hujjatlar va harakatlar**
  - Bog'liq: T-015
  - Qabul: `Sale`, `SaleItem`, `StockMovement`, `DebtPayment`, `Quote`, `QuoteItem`, `PurchaseOrder`, `POItem`, `SupplierPayment`, `Delivery`, `Message`, `AuditEntry`, `Expense`, `ExpenseTemplate`, `CashShift`, `CashMovement`; **D3**: `Delivery.fee` olib tashlangan
  - Tekshirish: `npx prisma validate`

- [ ] **T-017 · Birinchi migratsiya + qo'lda SQL cheklovlar**
  - Bog'liq: T-016
  - Manba: [02 §2.3](../../backend-tz/core/02-data-modeling.md#22-prisma-bilan-ifodalab-bolmaydigan-cheklovlar)
  - Qabul: bitta ochiq smena, bitta sukut ombor, manfiy bo'lmagan qoldiq/summa, `paid <= total`, `received_qty <= qty`, nasiyada mijoz majburiy
  - Tekshirish: `npx prisma migrate deploy && npm test -w apps/api -- constraints`

- [ ] **T-018 · Triggerlar: yig'indi qoldiq va append-only**
  - Bog'liq: T-017
  - Manba: [02 §2.3](../../backend-tz/core/02-data-modeling.md#productsstock--product_stocks-yigindisi-i1)
  - Qabul: `product_stocks` o'zgarsa `products.stock` avtomatik yangilanadi (I1); `audit_log` va `stock_movements` da `UPDATE`/`DELETE` rad etiladi
  - Tekshirish: `npm test -w apps/api -- triggers`

- [ ] **T-019 · Kompozit tashqi kalitlar (tenant mosligi)**
  - Bog'liq: T-017
  - Manba: [02 §2.3](../../backend-tz/core/02-data-modeling.md#tenant-izolyatsiyasi-uchun-tashqi-kalit-tekshiruvi)
  - Qabul: `sale_items`, `quote_items`, `po_items`, `product_stocks`, `stock_movements`, `deliveries`, `debt_payments`, `supplier_payments` — `(tenant_id, id)` orqali bog'langan; boshqa tenant yozuviga havola baza darajasida rad etiladi
  - Tekshirish: `npm test -w apps/api -- cross-tenant-fk`

- [ ] **T-020 · Indekslar**
  - Bog'liq: T-017
  - Manba: [10 §10.4](../../backend-tz/core/10-performance.md#104-indekslar)
  - Qabul: qamrab oluvchi katalog indeksi, qisman indekslar (nasiya, kam qoldiq, faol yetkazish), `pg_trgm` qidiruv indekslari, shtrix-kod noyob indeksi
  - Tekshirish: `npm test -w apps/api -- explain-uses-index`

- [ ] **T-021 · Tenant provisioning (seed)**
  - Bog'liq: T-017
  - Manba: [02 §2.5](../../backend-tz/profiles/qurilish-crm/02-schema.md#2-boshlangich-malumot-seed)
  - Qabul: yangi tenantda `Settings`, `TenantState`, sukut ombor, 9 ta kategoriya, 4 ta hujjat hisoblagichi, `Employee`+`User` (admin) — bitta tranzaksiyada
  - Tekshirish: `npm test -w apps/api -- tenant-provisioning`

- [ ] **T-022 · Dev uchun demo ma'lumot**
  - Bog'liq: T-021
  - Fayllar: `apps/api/prisma/seed.ts`
  - Qabul: mijoz ilovasidagi demo ma'lumot bilan mos demo tenant yaratiladi (faqat `NODE_ENV !== production`)
  - Tekshirish: `npx prisma db seed && npm test -w apps/api -- seed`

---

## E3 — Auth, tenant izolyatsiyasi va huquqlar

- [ ] **T-023 · Parol xeshi va foydalanuvchi servisi**
  - Bog'liq: T-021
  - Manba: [03 §3.2](../../backend-tz/core/03-security.md#parol)
  - Qabul: argon2id; parol hech qachon javobda yoki logda ko'rinmaydi; kuchsiz parol rad etiladi
  - Tekshirish: `npm test -w apps/api -- password`

- [ ] **T-024 · Login va JWT**
  - Bog'liq: T-023
  - Manba: [03 §3.2](../../backend-tz/core/03-security.md#token-modeli), [04 §4.2](../../backend-tz/core/04-api-conventions.md#42-autentifikatsiya)
  - Qabul: `POST /auth/login` → access (15 daq) + refresh (cookie, `httpOnly`, `secure`, `sameSite=strict`); noto'g'ri parolda javob vaqti bir xil (foydalanuvchi bor-yo'qligi oshkor bo'lmaydi)
  - Tekshirish: `npm run test:e2e -- auth-login`

- [ ] **T-025 · Refresh rotatsiyasi va chiqish**
  - Bog'liq: T-024
  - Manba: [03 §3.2](../../backend-tz/core/03-security.md#refresh-token-rotatsiyasi)
  - Qabul: har refresh'da yangi token; eski token qayta ishlatilsa **butun zanjir** bekor qilinadi; `logout-all` ishlaydi
  - Tekshirish: `npm run test:e2e -- auth-refresh-reuse`

- [ ] **T-026 · Tenant konteksti (AsyncLocalStorage)**
  - Bog'liq: T-024
  - Manba: [01 §1.4](../../backend-tz/core/01-architecture.md#1-qatlam-sorov-konteksti-asynclocalstorage)
  - Qabul: kontekst yo'q bo'lsa so'rov bajarilmaydi (dasturchi xatosi darhol ko'rinadi)
  - Tekshirish: `npm test -w apps/api -- tenant-context`

- [ ] **T-027 · Prisma tenant kengaytmasi**
  - Bog'liq: T-026
  - Manba: [01 §1.4](../../backend-tz/core/01-architecture.md#2-qatlam-prisma-client-extension--avtomatik-filtr)
  - Qabul: barcha domen modellarida `where`/`data` ga `tenantId` **avtomatik** qo'shiladi; ro'yxatda bo'lmagan model uchun xato beriladi
  - Tekshirish: `npm test -w apps/api -- tenant-extension`

- [ ] **T-028 · Row Level Security**
  - Bog'liq: T-027
  - Manba: [03 §3.5](../../backend-tz/core/03-security.md#35-row-level-security)
  - Qabul: `app.tenant_id` har so'rovda o'rnatiladi; ilova roli RLS'ni chetlab o'tolmaydi; migratsiya roli alohida
  - Tekshirish: `npm test -w apps/api -- rls`

- [ ] **T-029 · Rollar va huquq guard'i**
  - Bog'liq: T-026
  - Manba: [03 §3.3](../../backend-tz/core/03-security.md#33-avtorizatsiya-rollar-va-huquqlar), `packages/shared/permissions.ts`
  - Qabul: matritsa **frontenddagi bilan bir xil manba**dan (shared) olinadi; himoyalanmagan endpoint qolsa test yiqiladi
  - Tekshirish: `npm run test:e2e -- every-route-guarded`

- [ ] **T-030 · Maydon darajasidagi himoya**
  - Bog'liq: T-029
  - Manba: [03 §3.6](../../backend-tz/core/03-security.md#36-maydon-darajasidagi-himoya)
  - Qabul: `sotuvchi` roli javobda `cost`, `wholesalePrice`, `salary` va foyda maydonlarini **olmaydi** — agregatlarda ham
  - Tekshirish: `npm run test:e2e -- field-visibility`

- [ ] **T-031 · Tenant izolyatsiyasi testi (majburiy)**
  - Bog'liq: T-028
  - Manba: [03 §3.8](../../backend-tz/core/03-security.md#38-izolyatsiya-testi-majburiy)
  - Qabul: har bir resurs uchun A→B o'qish/yozish/o'chirish urinishi 404; test ro'yxati endpointlar ro'yxatidan **avtomatik** yig'iladi
  - Tekshirish: `npm run test:e2e -- isolation`

- [ ] **T-032 · Audit interceptor va rate limit**
  - Bog'liq: T-029
  - Manba: [03 §3.9](../../backend-tz/core/03-security.md#39-audit-jurnali), [03 §3.2](../../backend-tz/core/03-security.md#rate-limit)
  - Qabul: yozuvchi amallar avtomatik jurnalga tushadi (kim/nima/qachon); login uchun IP+email bo'yicha cheklov
  - Tekshirish: `npm run test:e2e -- audit,rate-limit`

---

## E4 — Spravochniklar (CRUD)

Bu epikdan keyin ma'lumot serverda yashaydi va ko'p qurilmadan ochiladi.

- [ ] **T-033 · Standart CRUD naqshi**
  - Bog'liq: T-029
  - Manba: [04 §4.3](../../backend-tz/profiles/qurilish-crm/04-api.md#standart-crud-naqshi), [12 §12.1](../../backend-tz/core/12-standards.md#121-qatlamlar)
  - Fayllar: `common/crud/*`
  - Qabul: ro'yxat (filtr, saralash, kursor/sahifa), bitta yozuv, yaratish, tahrirlash, yumshoq o'chirish, tiklash (undo) — bir marta yozilib, modullarda qayta ishlatiladi
  - Tekshirish: `npm test -w apps/api -- crud-base`

- [ ] **T-034 · Sozlamalar (`/settings`)**
  - Bog'liq: T-033
  - Qabul: faqat `settings` huquqi bo'lgan rol o'zgartiradi; `taxRate` 0–100, `maxDiscountPct` 0–100; keshlanadi va o'zgarishda kesh bekor bo'ladi ([10 §10.7](../../backend-tz/core/10-performance.md#107-keshlash))
  - Tekshirish: `npm run test:e2e -- settings`

- [ ] **T-035 · Omborlar (`/warehouses`)**
  - Bog'liq: T-033
  - Manba: [02](../../backend-tz/core/02-data-modeling.md), `packages/shared/warehouse.ts`
  - Qabul: sukut omborni arxivlab bo'lmaydi; arxivlangan omborda qoldiq bo'lsa ogohlantiriladi; nom tenant ichida noyob
  - Tekshirish: `npm run test:e2e -- warehouses`

- [ ] **T-036 · Kategoriyalar (`/categories`)**
  - Bog'liq: T-033
  - Qabul: nomni o'zgartirish 1 ta `UPDATE` (D4); ishlatilayotgan kategoriyani o'chirishga urinish 409
  - Tekshirish: `npm run test:e2e -- categories`

- [ ] **T-037 · Mahsulotlar (`/products`)**
  - Bog'liq: T-035, T-036
  - Manba: [04 §4.6](../../backend-tz/profiles/qurilish-crm/04-api.md#2-mahsulotlar), [10 §10.1](../../backend-tz/core/10-performance.md#101-sorov-byudjeti)
  - Qabul:
    - Ro'yxat: qidiruv (nom/SKU/shtrix-kod), kategoriya, ombor, «kam qolgan», arxiv filtri
    - SKU va shtrix-kod tenant ichida noyob
    - Qoldiq faqat ombor amallari orqali o'zgaradi — `PATCH /products` bilan **emas**
    - So'rov byudjeti ≤ 2
  - Tekshirish: `npm run test:e2e -- products,query-budget`

- [ ] **T-038 · Mahsulot import va ommaviy narx**
  - Bog'liq: T-037
  - Manba: [04 §4.6](../../backend-tz/profiles/qurilish-crm/04-api.md#post-productsimport)
  - Qabul: 1000 qator bitta `createMany` bilan ([10 §10.9](../../backend-tz/core/10-performance.md#109-ommaviy-bulk-amallar)); xato qatorlar ro'yxati qaytariladi, to'g'rilari saqlanadi; ommaviy narx o'zgarishi audit jurnaliga tushadi
  - Tekshirish: `npm run test:e2e -- products-import`

- [ ] **T-039 · Mijozlar (`/clients`)**
  - Bog'liq: T-033
  - Qabul: guruh (`retail|wholesale|vip`), nasiya limiti, to'lov muddati; qarzi bor mijozni o'chirish 409; telefon bo'yicha qidiruv indeksdan foydalanadi
  - Tekshirish: `npm run test:e2e -- clients`

- [ ] **T-040 · Ta'minotchilar (`/suppliers`)**
  - Bog'liq: T-033
  - Qabul: STIR formati tekshiriladi; ochiq buyurtmasi bor ta'minotchini o'chirish 409
  - Tekshirish: `npm run test:e2e -- suppliers`

- [ ] **T-041 · Xodimlar va foydalanuvchilar (`/employees`, `/users`)**
  - Bog'liq: T-023
  - Manba: [10 §10.3](../../backend-tz/core/10-performance.md#d1-user-va-employee-bir-shaxsni-ikki-marta-saqlaydi)
  - Qabul:
    - `User` yaratilganda `Employee` majburiy (D1); ism bitta joyda
    - Oxirgi administratorni o'chirish yoki rolini pasaytirish 409
    - Foydalanuvchi o'zining rolini o'zgartira olmaydi
  - Tekshirish: `npm run test:e2e -- users,employees`

---

## E5 — Ombor amallari

- [ ] **T-042 · Qulflash yordamchisi**
  - Bog'liq: T-027
  - Manba: [01 §1.7](../../backend-tz/core/01-architecture.md#17-parallellik-va-qulflash)
  - Fayllar: `common/db/lock.ts`
  - Qabul: `SELECT … FOR UPDATE` xom SQL orqali; mahsulotlar **doim `id` bo'yicha o'sish tartibida** qulflanadi (deadlock yo'q); qulf faqat tranzaksiya ichida
  - Tekshirish: `npm test -w apps/api -- lock-order`

- [ ] **T-043 · Ombor harakati yozuvchisi**
  - Bog'liq: T-042
  - Manba: [05 I1, I2, I11](../../backend-tz/profiles/qurilish-crm/03-invariants.md), `packages/shared/warehouse.ts`
  - Fayllar: `modules/stock/stock.service.ts`
  - Qabul:
    - Bitta amal: qoldiq o'zgarishi + harakat yozuvi + `balanceAfter` — bitta tranzaksiyada
    - Manfiy qoldiq imkonsiz (I2)
    - O'rtacha tortilgan tannarx `averageCost` bilan (I11) — `shared` dagi funksiya
  - Tekshirish: `npm test -w apps/api -- stock.invariants`

- [ ] **T-044 · Kirim (`POST /stock/intake`)**
  - Bog'liq: T-043
  - Manba: [04 §4.7](../../backend-tz/profiles/qurilish-crm/04-api.md#post-stockintake--idempotent)
  - Qabul: idempotent; tannarx yangilanadi (I11); ta'minotchi va izoh saqlanadi
  - Tekshirish: `npm run test:e2e -- stock-intake`

- [ ] **T-045 · Chiqim (`POST /stock/writeoff`)**
  - Bog'liq: T-043
  - Qabul: sabab majburiy; qoldiqdan ko'p chiqarib bo'lmaydi (409, aynan qaysi omborda yetmaganini ko'rsatadi)
  - Tekshirish: `npm run test:e2e -- stock-writeoff`

- [ ] **T-046 · Inventarizatsiya (`POST /stock/adjust`)**
  - Bog'liq: T-043
  - Qabul: sanalgan miqdor bilan farq bitta `adjustment` harakatiga yoziladi; farq 0 bo'lsa yozuv yaratilmaydi
  - Tekshirish: `npm run test:e2e -- stock-adjust`

- [ ] **T-047 · Ko'chirish (`POST /stock/transfer`)**
  - Bog'liq: T-043
  - Manba: [05 I1](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i1--productstock--ombor-qoldiqlari-yigindisi)
  - Qabul: ikki harakat (`transfer_out` + `transfer_in`) bitta tranzaksiyada; manba ombor = qabul ombor bo'lsa 400; jami qoldiq **o'zgarmaydi**
  - Tekshirish: `npm run test:e2e -- stock-transfer`

- [ ] **T-048 · Harakatlar jurnali (`GET /stock/movements`)**
  - Bog'liq: T-043
  - Manba: [10 §10.5](../../backend-tz/core/10-performance.md#105-sahifalash--kalitli-keyset-offset-emas)
  - Qabul: kursorli sahifalash; filtr: mahsulot, ombor, tur, davr; 100 000 yozuvda ham p95 < 200 ms
  - Tekshirish: `npm run test:e2e -- movements-pagination`

- [ ] **T-049 · Buyurtma taklifi (`GET /stock/reorder-suggestions`)**
  - Bog'liq: T-037
  - Qabul: mijozdagi buyurtma taklifi mantiqi (namunada: `max(minStock*2 − stock, minStock)`) `shared` ga ko'chirilgan va server shuni ishlatadi; natija ta'minotchi bo'yicha guruhlanadi
  - Tekshirish: `npm test -w packages/shared -- reorder`

---

## E6 — Savdo yadrosi

Eng nozik epik: bu yerdagi har bir vazifa pul bilan bog'liq.

- [ ] **T-050 · Idempotentlik qatlami**
  - Bog'liq: T-009
  - Manba: [01 §1.8](../../backend-tz/core/01-architecture.md#18-idempotentlik), [04 §4.4](../../backend-tz/core/04-api-conventions.md#43-idempotentlik)
  - Qabul: bir xil kalit + bir xil tana → saqlangan javob; bir xil kalit + boshqa tana → 409; kalitlar 24 soatdan keyin tozalanadi
  - Tekshirish: `npm run test:e2e -- idempotency`

- [ ] **T-051 · Hujjat raqami generatori**
  - Bog'liq: T-042
  - Manba: [05 I12](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i12--hujjat-raqamlari-ketma-ket-va-noyob)
  - Qabul: `doc_counters` qulflanadi; parallel 100 ta so'rovda takroriy raqam **yo'q**; prefikslar `CHEK|QAYT|TKLF|BUY`
  - Tekshirish: `npm test -w apps/api -- doc-number-concurrency`

- [ ] **T-052 · Sotuv summasini serverda hisoblash**
  - Bog'liq: T-002
  - Manba: [04 §4.12](../../backend-tz/core/04-api-conventions.md#45-server-summalarni-qayta-hisoblaydi), `packages/shared/pos.ts`
  - Qabul: `saleTotals` **shared**dan ishlatiladi; mijoz yuborgan summa faqat solishtiriladi, farqda 422 `TOTAL_MISMATCH`; chegirma `maxDiscountPct` bilan cheklanadi
  - Tekshirish: `npm test -w apps/api -- sale-totals`

- [ ] **T-053 · Sotuv yaratish (`POST /sales`)**
  - Bog'liq: T-043, T-050, T-051, T-052
  - Manba: [05 I3, I5, I13, I15, I16, I17, I23](../../backend-tz/profiles/qurilish-crm/03-invariants.md), [04 §4.8](../../backend-tz/profiles/qurilish-crm/04-api.md#4-sotuvlar)
  - Qabul:
    - Bitta tranzaksiya: qatorlar qulflanadi → qoldiq kamayadi → harakat yoziladi → chek saqlanadi → kassa yangilanadi → bonus beriladi → audit
    - Qoldiq yetmasa 409 `INSUFFICIENT_STOCK` (I3)
    - Yetkazish narxi chek summasi ichida (I5)
    - Nasiyada mijoz majburiy (I15), limit va muddat tekshiriladi (I16)
    - Ombor chiqimi **asosiy birlikda** (`baseQty`, I23)
    - Naqd amal ochiq smenani talab qiladi (I8)
    - So'rov byudjeti ≤ 8, qatorlar soniga bog'liq emas
  - Tekshirish: `npm run test:e2e -- sales-create,query-budget`

- [ ] **T-054 · Qaytarish (`POST /sales/:id/return`)**
  - Bog'liq: T-053
  - Manba: [05 I6, I7](../../backend-tz/profiles/qurilish-crm/03-invariants.md)
  - Qabul: QQS asl chekdagi foiz bo'yicha qaytariladi (I6); qaytarish miqdori asl chekdagidan oshmaydi; naqd qaytim kassadan chiqadi
  - Tekshirish: `npm run test:e2e -- sales-return`

- [ ] **T-055 · Bekor qilish (`POST /sales/:id/cancel`)**
  - Bog'liq: T-053
  - Manba: [05 I24](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i24--bekor-qilish-tovarni-osha-omborga-qaytaradi)
  - Qabul: tovar **aynan o'sha omborga** qaytadi; kassa ta'siri teskari qaytariladi; bonus qaytarib olinadi; ikki marta bekor qilish 409
  - Tekshirish: `npm run test:e2e -- sales-cancel`

- [ ] **T-056 · Sotuvlar ro'yxati va chek**
  - Bog'liq: T-053
  - Qabul: filtr (davr, holat, mijoz, sotuvchi, to'lov turi); qolgan qarz **SQL'da** hisoblanadi, ilovada emas; byudjet ≤ 2
  - Tekshirish: `npm run test:e2e -- sales-list`

- [ ] **T-057 · Takliflar (`/quotes`)**
  - Bog'liq: T-051
  - Qabul: CRUD + holat (`draft|sent|accepted|rejected|converted`); amal muddati o'tgani ko'rsatiladi
  - Tekshirish: `npm run test:e2e -- quotes`

- [ ] **T-058 · Taklifni sotuvga aylantirish**
  - Bog'liq: T-053, T-057
  - Manba: [05 I20](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i20--taklifni-aylantirish)
  - Qabul: qoldiq yetmasa aylantirilmaydi; ikki marta aylantirib bo'lmaydi (I20); nasiyada mijoz majburiy; narx darajasi mijoz guruhidan olinadi
  - Tekshirish: `npm run test:e2e -- quote-convert`

---

## E7 — Kassa va moliya

- [ ] **T-059 · Smena ochish/yopish**
  - Bog'liq: T-042
  - Manba: [05 I8, I9, I10](../../backend-tz/profiles/qurilish-crm/03-invariants.md), [04 §4.9](../../backend-tz/profiles/qurilish-crm/04-api.md#5-kassa)
  - Qabul: bir vaqtda bitta ochiq smena (baza indeksi bilan ham, I8); ochilishda qoldiq sanoqqa tenglashadi (I10); yopishda kutilgan/sanalgan/farq saqlanadi
  - Tekshirish: `npm run test:e2e -- shifts`

- [ ] **T-060 · Naqd kirim/chiqim (`POST /cash/movements`)**
  - Bog'liq: T-059
  - Manba: [05 I9](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i9--cashbalance-faqat-ochiq-smenada-ozgaradi)
  - Qabul: smena yopiq bo'lsa 409; sabab majburiy; `cashBalance` faqat ochiq smenada o'zgaradi (I9)
  - Tekshirish: `npm run test:e2e -- cash-movements`

- [ ] **T-061 · Smena hisoboti va Z-hisobot**
  - Bog'liq: T-059
  - Qabul: smena va Z-hisobot ekranlaridagi barcha raqamlar bitta agregat so'rovda; nasiya (`pending`) hujjatlar ham hisobga olinadi
  - Tekshirish: `npm run test:e2e -- shift-report`

- [ ] **T-062 · Xarajatlar (`/expenses`)**
  - Bog'liq: T-060
  - Qabul: naqd xarajat kassadan chiqadi; tahrirlashda eski ta'sir qaytarilib yangisi qo'llanadi; o'chirish/tiklashda ham kassa to'g'ri qoladi
  - Tekshirish: `npm run test:e2e -- expenses-cash-effect`

- [ ] **T-063 · Takrorlanuvchi xarajat shablonlari**
  - Bog'liq: T-062
  - Manba: [05 I21](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i21--takrorlanuvchi-xarajat-davriga-bir-marta), `packages/shared/recurring.ts`
  - Qabul: bir davrga bir marta (I21); server cron bilan ishlaydi, brauzer ochilishiga bog'liq emas; `lastRunKey` yangilanadi
  - Tekshirish: `npm test -w apps/api -- recurring-once-per-period`

- [ ] **T-064 · Qarz to'lovi (`POST /debts/payments`)**
  - Bog'liq: T-053
  - Manba: [05 I13, I14](../../backend-tz/profiles/qurilish-crm/03-invariants.md)
  - Qabul: to'lov qolgan qarzdan oshmaydi (I14); to'liq to'langanda chek `completed` bo'ladi; naqd to'lov kassaga kiradi; parallel ikki to'lovda ortiqcha yozilmaydi
  - Tekshirish: `npm run test:e2e -- debt-payment,debt-concurrency`

- [ ] **T-065 · Qarzlar ro'yxati (`GET /debts`)**
  - Bog'liq: T-064
  - Manba: [10 §10.6](../../backend-tz/core/10-performance.md#balanslar--oddiy-view)
  - Qabul: `client_balances` ko'rinishi ishlatiladi; eskirish (30/60/60+) va «muddati o'tgan» filtri; mijoz bo'yicha guruhlash
  - Tekshirish: `npm run test:e2e -- debts-list`

- [ ] **T-066 · Nasiya limiti servisi**
  - Bog'liq: T-039
  - Manba: [05 I16](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i16--nasiya-limiti-va-muddati-otgan-qarz), `packages/shared/finance.ts`
  - Qabul: `checkCredit` **shared**dan; muddati o'tgan qarz bo'lsa yangi nasiya rad etiladi; limit oshsa 409 `CREDIT_LIMIT_EXCEEDED` (aniq raqamlar bilan)
  - Tekshirish: `npm test -w apps/api -- credit-check`

- [ ] **T-067 · Sodiqlik (bonus) servisi**
  - Bog'liq: T-053
  - Manba: [05 I17](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i17--bonus-ball)
  - Qabul: bonus sozlamadagi foizdan hisoblanadi; bekor qilinganda qaytarib olinadi; mavjud balansdan ko'p sarflab bo'lmaydi; balans manfiy bo'lmaydi
  - Tekshirish: `npm run test:e2e -- loyalty`

---

## E8 — Ta'minot va kreditorlik

- [ ] **T-068 · Kirim buyurtmalari (`/purchase-orders`)**
  - Bog'liq: T-040, T-051
  - Qabul: CRUD + holat; `BUY-NNNN` raqami; bekor qilish faqat `ordered` holatida
  - Tekshirish: `npm run test:e2e -- purchase-orders`

- [ ] **T-069 · Qabul qilish (to'liq va qisman)**
  - Bog'liq: T-044, T-068
  - Manba: [05 I19](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i19--qabul-buyurtmadan-oshmaydi)
  - Qabul: qabul buyurtmadan oshmaydi (I19); qisman qabulda holat `partial`; har qator uchun kirim harakati va tannarx yangilanishi
  - Tekshirish: `npm run test:e2e -- po-receive`

- [ ] **T-070 · Ta'minotchiga to'lov**
  - Bog'liq: T-060, T-068
  - Manba: [05 I18](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i18--taminotchiga-qarz)
  - Qabul: naqd to'lov kassadan chiqadi va smena hisobotida ko'rinadi; to'lov qarzdan oshmaydi
  - Tekshirish: `npm run test:e2e -- supplier-payment`

- [ ] **T-071 · Kreditorlik hisobi**
  - Bog'liq: T-069, T-070
  - Manba: `packages/shared/finance.ts` (`poOutstanding`)
  - Qabul: qarz faqat **kelgan** tovar uchun hisoblanadi (I18); qisman qabulda ham to'g'ri
  - Tekshirish: `npm test -w packages/shared -- payables`

- [ ] **T-072 · Ta'minotchi kartasi (`GET /suppliers/:id`)**
  - Bog'liq: T-071
  - Qabul: buyurtmalar tarixi, jami qarz, oxirgi to'lovlar — bitta so'rovda (N+1 yo'q)
  - Tekshirish: `npm run test:e2e -- supplier-detail,query-budget`

- [ ] **T-073 · Ta'minot hodisalari audit'da**
  - Bog'liq: T-032, T-070
  - Qabul: buyurtma yaratish/qabul/to'lov jurnalda summa bilan ko'rinadi
  - Tekshirish: `npm run test:e2e -- audit-purchases`

---

## E9 — Yetkazib berish va xabarlar

- [ ] **T-074 · Yetkazib berish (`/deliveries`)**
  - Bog'liq: T-053
  - Manba: [10 §10.3](../../backend-tz/core/10-performance.md#d3-deliveryfee-va-saledeliveryfee)
  - Qabul: `fee` chekdan olinadi (D3); holat o'tishlari tekshiriladi (`pending→on_way→delivered`, teskari emas); haydovchi — `Employee`
  - Tekshirish: `npm run test:e2e -- deliveries`

- [ ] **T-075 · Haydovchi ko'rinishi va marshrut varaqasi**
  - Bog'liq: T-074
  - Qabul: haydovchi faqat **o'ziga** biriktirilgan yetkazishlarni ko'radi; marshrut ma'lumoti bitta so'rovda
  - Tekshirish: `npm run test:e2e -- deliveries-driver-scope`

- [ ] **T-076 · Xabarlar jurnali (`/messages`)**
  - Bog'liq: T-039
  - Qabul: qabul qiluvchilar (mijoz/guruh/qarzdorlar/hammasi) serverda hisoblanadi; shablon o'zgaruvchilari almashtiriladi; jurnal saqlanadi
  - Tekshirish: `npm run test:e2e -- messages`

- [ ] **T-077 · SMS provayderi**
  - Bog'liq: T-076
  - Manba: [08 §8.10](../../backend-tz/core/08-operations.md#810-sms-va-telegram)
  - Qabul: provayder interfeysi (`eskiz|playmobile|none`); xato bo'lsa qayta urinish navbati; `none` da faqat jurnalga yoziladi
  - Tekshirish: `npm test -w apps/api -- sms-provider`

- [ ] **T-078 · Xabar yuborishni cheklash**
  - Bog'liq: T-077
  - Qabul: bir tenant uchun kunlik chegara; ommaviy yuborish fon ishida bajariladi va so'rovni bloklamaydi
  - Tekshirish: `npm run test:e2e -- messages-rate-limit`

---

## E10 — Hisobot va analitika

- [ ] **T-079 · Kunlik agregat ko'rinishlari**
  - Bog'liq: T-053
  - Manba: [10 §10.6](../../backend-tz/core/10-performance.md#kunlik-agregatlar-materiallashgan)
  - Qabul: `daily_sales_summary` va `daily_product_sales` yaratildi; hisob [I4](../../backend-tz/profiles/qurilish-crm/03-invariants.md#i4--tushum-tan-olish) bilan **aynan** mos; noyob indeks bor (CONCURRENTLY yangilash uchun)
  - Tekshirish: `npm test -w apps/api -- mv-matches-live`

- [ ] **T-080 · Ko'rinishlarni yangilash ishi**
  - Bog'liq: T-079
  - Qabul: kecha 03:30 da `REFRESH … CONCURRENTLY`; bir nechta instansiyada faqat bittasi bajaradi (qulf); xato Sentry'ga tushadi
  - Tekshirish: `npm test -w apps/api -- mv-refresh-lock`

- [ ] **T-081 · Boshqaruv paneli (`GET /dashboard`)**
  - Bog'liq: T-079
  - Manba: profil — ekranlar jadvali ([01-domain](../../backend-tz/profiles/qurilish-crm/01-domain.md#5-ekranlar--resurslar))
  - Qabul: bugungi tushum/foyda/xarajat + kechagiga nisbatan farq, qarzlar, kreditorlik, kam qolgan tovar, trend, top mahsulot, top qarzdor — **bitta** so'rovda (byudjet 1); o'tgan kunlar ko'rinishdan, bugun jonli
  - Tekshirish: `npm run test:e2e -- dashboard,query-budget`

- [ ] **T-082 · Foyda/zarar hisoboti (`GET /reports/pnl`)**
  - Bog'liq: T-079
  - Manba: profil — ekranlar jadvali ([01-domain](../../backend-tz/profiles/qurilish-crm/01-domain.md#5-ekranlar--resurslar))
  - Qabul: tushum − COGS − xarajat; davr filtri va **oldingi davr bilan solishtirish**; to'lov turlari taqsimoti; top mahsulot/sotuvchi; sotilmayotgan tovar (dead stock); natija frontend hisobi bilan **bir xil** (solishtiruvchi test)
  - Tekshirish: `npm test -w apps/api -- pnl-matches-frontend`

- [ ] **T-083 · Analitika va ABC (`GET /analytics`)**
  - Bog'liq: T-079
  - Qabul: ABC sinflari (80/95 % chegarasi) SQL oyna funksiyasi bilan; kategoriya va to'lov taqsimoti; byudjet 1
  - Tekshirish: `npm run test:e2e -- analytics-abc`

- [ ] **T-084 · Eksport (CSV/JSON)**
  - Bog'liq: T-082, T-096
  - Manba: [09 §9.2](../../backend-tz/core/09-storage.md#92-fayl-oqimlarini-aniqlash)
  - Qabul: katta eksport fon ishida yasaladi va S3'ga qo'yiladi, foydalanuvchiga havola beriladi; kichik eksport darhol oqim bilan qaytadi; UTF-8 BOM (Excel uchun)
  - Tekshirish: `npm run test:e2e -- exports`

- [ ] **T-085 · Hisobotlarni keshlash**
  - Bog'liq: T-082
  - Manba: [10 §10.7](../../backend-tz/core/10-performance.md#107-keshlash)
  - Qabul: tugallangan davrlar keshlanadi (tenant versiya kaliti bilan); joriy kun keshlanmaydi; sotuv qo'shilganda kesh bekor bo'ladi
  - Tekshirish: `npm run test:e2e -- reports-cache-invalidation`

---

## E11 — Fayl saqlash (S3)

- [ ] **T-086 · S3 mijozi va konfiguratsiya**
  - Bog'liq: T-007
  - Manba: [09 §9.3](../../backend-tz/core/09-storage.md#93-provayder-tanlovi)
  - Fayllar: `modules/files/s3.service.ts`
  - Qabul: MinIO (lokal) va R2 (prod) bilan bir xil ishlaydi; `S3_FORCE_PATH_STYLE` qo'llab-quvvatlanadi; ishga tushishda bucket mavjudligi tekshiriladi
  - Tekshirish: `npm test -w apps/api -- s3-service`

- [ ] **T-087 · `files` jadvali va migratsiya**
  - Bog'liq: T-017, T-086
  - Manba: [09 §9.5](../../backend-tz/core/09-storage.md#95-files-jadvali--yagona-reyestr)
  - Qabul: `File` modeli, `Product.imageFileId` (`ON DELETE SET NULL`), `TenantState.storageUsedBytes`; `(tenantId, sha256, kind)` noyob
  - Tekshirish: `npx prisma migrate deploy && npm test -w apps/api -- files-schema`

- [ ] **T-088 · Presign (`POST /files/presign`)**
  - Bog'liq: T-087
  - Manba: [09 §9.6](../../backend-tz/core/09-storage.md#96-yuklash-oqimi--presigned-put), [09 §9.11](../../backend-tz/core/09-storage.md#911-kvota)
  - Qabul: MIME oq ro'yxati; hajm chegarasi; kvota **presign'dan oldin**; TTL ≤ 10 daq; kalitni faqat server yasaydi; takroriy `sha256` da mavjud fayl qaytariladi
  - Tekshirish: `npm run test:e2e -- files-presign`

- [ ] **T-089 · Tasdiqlash va tarkib tekshiruvi**
  - Bog'liq: T-088
  - Manba: [09 §9.6](../../backend-tz/core/09-storage.md#96-yuklash-oqimi--presigned-put)
  - Qabul: sehrli baytlar e'lon qilingan MIME bilan solishtiriladi; mos kelmasa obyekt o'chiriladi va audit'ga yoziladi; `storageUsedBytes` yangilanadi; `image/svg+xml` **hech qachon** qabul qilinmaydi
  - Tekshirish: `npm run test:e2e -- files-confirm-magic-bytes`

- [ ] **T-090 · O'qish (`GET /files/:id/raw`)**
  - Bog'liq: T-089
  - Manba: [09 §9.7](../../backend-tz/core/09-storage.md#97-oqish-oqimi)
  - Qabul: huquq tekshiriladi; 302 → qisqa muddatli presigned GET; boshqa tenant fayli **404**; havola logga yozilmaydi
  - Tekshirish: `npm run test:e2e -- files-read,isolation`

- [ ] **T-091 · Rasm variantlari (fon ishi)**
  - Bog'liq: T-089
  - Manba: [09 §9.8](../../backend-tz/core/09-storage.md#98-rasm-variantlari)
  - Qabul: `128` va `512` WebP yasaladi; navbat yo'q bo'lsa ilova buzilmaydi (faqat `orig` ishlatiladi); `concurrency: 1`
  - Tekshirish: `npm test -w apps/api -- image-variants`

- [ ] **T-092 · Tozalash ishlari (GC)**
  - Bog'liq: T-089
  - Manba: [09 §9.10](../../backend-tz/core/09-storage.md#910-hayot-sikli-va-tozalash-gc)
  - Qabul: 24 soatlik `pending` tozalanadi; havolasiz rasm 30 kundan keyin o'chiriladi; `storageUsedBytes` kamayadi; hech qachon havolasi bor fayl o'chmaydi
  - Tekshirish: `npm test -w apps/api -- files-gc`

- [ ] **T-093 · Mahsulot rasmini ulash**
  - Bog'liq: T-037, T-090
  - Qabul: `PATCH /products/:id` da `imageFileId` qabul qilinadi va fayl shu tenantniki ekani tekshiriladi; eski rasm havolasi uziladi
  - Tekshirish: `npm run test:e2e -- product-image`

---

## E12 — Realtime va offline (B5)

- [ ] **T-094 · WebSocket qatlami**
  - Bog'liq: T-029
  - Manba: [01 §1.9](../../backend-tz/core/01-architecture.md#19-realtime), [04 §4.14](../../backend-tz/profiles/qurilish-crm/04-api.md#9-realtime-hodisalar)
  - Qabul: ulanish JWT bilan autentifikatsiya qilinadi; xona = `tenantId`; boshqa tenant xonasiga kirib bo'lmaydi
  - Tekshirish: `npm run test:e2e -- ws-auth`

- [ ] **T-095 · Domen hodisalari**
  - Bog'liq: T-094, T-053
  - Qabul: `sale.created`, `stock.changed`, `shift.opened/closed`, `debt.paid` — **tranzaksiya tugagandan keyin** yuboriladi (yiqilgan tranzaksiya hodisa bermaydi)
  - Tekshirish: `npm run test:e2e -- events-after-commit`

- [ ] **T-096 · Fon navbati (BullMQ)**
  - Bog'liq: T-086
  - Qabul: rasm variantlari, SMS, eksport, MV yangilash — navbat orqali; Redis yo'q bo'lsa sinxron zaxira rejim
  - Tekshirish: `npm test -w apps/api -- queue`

- [ ] **T-097 · Offline navbat shartnomasi**
  - Bog'liq: T-050
  - Manba: [01 §1.10](../../backend-tz/core/01-architecture.md#110-offline-rejim-b5)
  - Qabul: brauzer navbatdagi amallarni `Idempotency-Key` bilan yuboradi; takroriy yuborish chekni ikkilantirmaydi; konflikt aniq xato bilan qaytadi
  - Tekshirish: `npm run test:e2e -- offline-replay`

- [ ] **T-098 · Optimistik qulf (`If-Match`)**
  - Bog'liq: T-033
  - Manba: [04 §4.5](../../backend-tz/core/04-api-conventions.md#44-raqobatli-tahrirlash)
  - Qabul: `version`/`updatedAt` mos kelmasa 412; frontend yangi holatni ko'rsatib qayta so'raydi
  - Tekshirish: `npm run test:e2e -- optimistic-lock`

---

## E13 — Frontend integratsiyasi

- [ ] **T-099 · API mijozi va tiplar**
  - Bog'liq: T-012
  - Manba: [06 §6.5](../../backend-tz/core/06-client-integration.md#63-api-mijozi), [12 §12.6](../../backend-tz/core/12-standards.md#frontend-uchun-mijoz)
  - Qabul: `openapi-typescript` bilan tiplar generatsiya qilinadi; token yangilash **bir vaqtda bitta** (parallel 401 lar bitta refresh'ni kutadi)
  - Tekshirish: `npm run gen:api -w apps/web && npm run typecheck -w apps/web`

- [ ] **T-100 · Auth oqimini serverga o'tkazish**
  - Bog'liq: T-099, T-024
  - Manba: [06 §6.12](../../backend-tz/core/06-client-integration.md#69-auth-oqimi)
  - Qabul: auth store serverdan ishlaydi; demo foydalanuvchilar va parollar **o'chiriladi**; parol brauzerda saqlanmaydi
  - Tekshirish: `grep -rn "password" apps/web/src | wc -l` → `0`

- [ ] **T-101 · So'rov qatlami (TanStack Query)**
  - Bog'liq: T-099
  - Manba: [06 §6.6](../../backend-tz/core/06-client-integration.md#64-query-kalitlari), [06 §6.7](../../backend-tz/core/06-client-integration.md#65-hook-qatlami)
  - Qabul: kalitlar konvensiyasi; xato ko'rsatish bir joyda; qayta urinish siyosati (yozuvchi amal qayta urinilmaydi)
  - Tekshirish: `npm test -w apps/web -- query-layer`

- [ ] **T-102 · Spravochnik sahifalarini o'tkazish**
  - Bog'liq: T-101, T-041
  - Qabul: Mahsulotlar, Mijozlar, Ta'minotchilar, Xodimlar, Foydalanuvchilar, Omborlar — serverdan; sahifalash/saralash **serverda**; ko'rinish o'zgarmaydi
  - Tekshirish: `npm test -w apps/web && npm run build -w apps/web`

- [ ] **T-103 · Kassa (POS) ni o'tkazish**
  - Bog'liq: T-101, T-053
  - Manba: [06 §6.11](../../backend-tz/profiles/qurilish-crm/05-client.md#3-kassa-pos--alohida-etibor)
  - Qabul: savat lokal qoladi; `checkout` bitta `POST /sales`; server xatosi (qoldiq, limit) kassada aniq ko'rsatiladi; F9/F2 yorliqlari ishlaydi; skaner ishlaydi
  - Tekshirish: `npm test -w apps/web -- pos`

- [ ] **T-104 · Ombor, kassa, qarz, ta'minot sahifalari**
  - Bog'liq: T-101, T-047, T-064, T-069
  - Qabul: barcha amallar server orqali; optimistik yangilash xatoda orqaga qaytariladi
  - Tekshirish: `npm test -w apps/web`

- [ ] **T-105 · Hisobot va analitika sahifalari**
  - Bog'liq: T-081, T-082, T-083
  - Qabul: hisob **serverdan** olinadi; brauzerdagi `reduce` hisoblari olib tashlanadi; grafiklar o'zgarmaydi
  - Tekshirish: `npm test -w apps/web -- reports`

- [ ] **T-106 · Rasm yuklashni S3'ga o'tkazish**
  - Bog'liq: T-088, T-093
  - Manba: [09 §9.6](../../backend-tz/core/09-storage.md#96-yuklash-oqimi--presigned-put)
  - Qabul: `resizeImage` maksimal o'lchami 1600 ga o'zgaradi; presign → PUT → confirm oqimi; `dataURL` **umuman ishlatilmaydi**; offline'da IndexedDB navbati
  - Tekshirish: `npm test -w apps/web -- image-upload`

- [ ] **T-107 · Realtime va uzilishga chidamlilik**
  - Bog'liq: T-095, T-097
  - Manba: [06 §6.9](../../backend-tz/core/06-client-integration.md#67-realtime)
  - Qabul: boshqa kassir sotgan tovar qoldig'i darhol yangilanadi; internet uzilganda ogohlantirish va navbat; tiklanganda avtomatik yuborish
  - Tekshirish: `npm test -w apps/web -- offline-queue`

---

## E14 — Ma'lumot migratsiyasi

- [ ] **T-108 · Import endpointi**
  - Bog'liq: T-021, T-053
  - Manba: [07 §7.4](../../backend-tz/core/07-migration.md#74-server-tomonda-import)
  - Qabul: to'g'ri tartib (spravochnik → hujjat → harakat); asl identifikatorlar saqlanadi; qayta yuborish ma'lumotni ikkilantirmaydi
  - Tekshirish: `npm run test:e2e -- migration-import`

- [ ] **T-109 · Tekshirish (dry-run)**
  - Bog'liq: T-108
  - Manba: [07 §7.6](../../backend-tz/core/07-migration.md#76-sinov-dry-run)
  - Qabul: yozmasdan hisobot beradi: nechta yozuv, nechta buzilgan havola, nechta invariant buzilgan
  - Tekshirish: `npm run test:e2e -- migration-dryrun`

- [ ] **T-110 · Buzilgan havolalar va invariantlarni tiklash**
  - Bog'liq: T-108
  - Manba: [07 §7.4](../../backend-tz/core/07-migration.md#havolasi-buzilgan-yozuvlar)
  - Qabul: yo'q mijozga havola — `NULL` qilinadi va hisobotga yoziladi; qoldiqlar harakatlardan qayta hisoblanadi; import **to'xtamaydi**
  - Tekshirish: `npm run test:e2e -- migration-repair`

- [ ] **T-111 · Rasmlarni ko'chirish**
  - Bog'liq: T-108, T-089
  - Manba: [09 §9.14](../../backend-tz/core/09-storage.md#914-mavjud-rasmlarni-kochirish)
  - Qabul: `dataURL` → S3; noto'g'ri/katta rasm o'tkazib yuboriladi va hisobotga yoziladi; migratsiya to'xtamaydi
  - Tekshirish: `npm run test:e2e -- migration-images`

- [ ] **T-112 · Migratsiya sehrgari (UI)**
  - Bog'liq: T-109, T-100
  - Manba: [07 §7.3](../../backend-tz/core/07-migration.md#73-migratsiya-sehrgari-ilova-ichida)
  - Qabul: 4 qadam (hisob → tekshirish → yuborish → natija); jarayon ko'rsatkichi; xato bo'lsa localStorage **o'chirilmaydi**
  - Tekshirish: `npm test -w apps/web -- migration-wizard`

- [ ] **T-113 · Orqaga qaytish yo'li**
  - Bog'liq: T-112
  - Manba: [07 §7.7](../../backend-tz/core/07-migration.md#77-orqaga-qaytish)
  - Qabul: migratsiyadan keyin ham localStorage nusxasi 30 kun saqlanadi; JSON zaxira yuklab olinadi
  - Tekshirish: `npm test -w apps/web -- migration-rollback`

---

## E15 — Deploy va ekspluatatsiya

- [ ] **T-114 · Production Dockerfile**
  - Bog'liq: T-004
  - Manba: [08 §8.3](../../backend-tz/core/08-operations.md#83-docker)
  - Qabul: ko'p bosqichli, `node:22-alpine`, root'siz, healthcheck bilan; ARM64 uchun yig'iladi
  - Tekshirish: `docker build --platform linux/arm64 -f apps/api/Dockerfile .`

- [ ] **T-115 · Bepul serverni tayyorlash**
  - Bog'liq: —
  - Manba: [11 §11.4](../../backend-tz/core/11-deploy-free.md#114-vm-ni-tayyorlash)
  - Qabul: Oracle Always Free VM (ARM), `ufw` + Oracle `iptables` + VCN qoidalari, swap, SSH faqat kalit bilan
  - Tekshirish: `ssh server 'sudo ufw status | head -3'`

- [ ] **T-116 · Production compose va Caddy**
  - Bog'liq: T-114, T-115
  - Manba: [11 §11.5](../../backend-tz/core/11-deploy-free.md#115-docker-composeprodyml)
  - Qabul: postgres + redis + api + caddy ishga tushdi; TLS avtomatik olindi; baza tashqariga chiqarilmagan; Swagger production'da 404
  - Tekshirish: `curl -fsS https://api.domen.uz/health/ready`

- [ ] **T-117 · Postgres sozlamalari**
  - Bog'liq: T-116
  - Manba: [11 §11.5](../../backend-tz/core/11-deploy-free.md#postgresconf--12-gb-xotira-uchun)
  - Qabul: `shared_buffers`, `work_mem`, `max_connections` mashina resursiga moslangan; `pg_stat_statements` va `auto_explain` yoqilgan
  - Tekshirish: `psql -c "SHOW shared_buffers; SELECT count(*) FROM pg_stat_statements;"`

- [ ] **T-118 · R2 bucket'lari va CORS**
  - Bog'liq: T-086
  - Manba: [11 §11.6](../../backend-tz/core/11-deploy-free.md#116-cloudflare-r2-ni-sozlash)
  - Qabul: `crm-media-prod`, `crm-backup-prod`; token faqat shu ikkisiga; CORS faqat frontend domeni uchun; lifecycle qoidalari o'rnatilgan
  - Tekshirish: `npm run test:e2e -- s3-prod-smoke`

- [ ] **T-119 · Frontend deploy (Cloudflare Pages)**
  - Bog'liq: T-099
  - Manba: [11 §11.7](../../backend-tz/core/11-deploy-free.md#117-frontend--cloudflare-pages)
  - Qabul: SPA yo'llari ishlaydi; `sw.js` keshlanmaydi; `VITE_API_URL` to'g'ri; PWA o'rnatiladi
  - Tekshirish: `curl -fsS https://crm.domen.uz/products -o /dev/null`

- [ ] **T-120 · CI/CD**
  - Bog'liq: T-114, T-116
  - Manba: [11 §11.9](../../backend-tz/core/11-deploy-free.md#119-cicd--github-actions)
  - Qabul: `main` ga push → ARM64 obraz → migratsiya **alohida qadam** → yangi versiya; migratsiya yiqilsa deploy to'xtaydi
  - Tekshirish: GitHub Actions oxirgi ishi yashil

- [ ] **T-121 · Zaxira va tiklashni sinash**
  - Bog'liq: T-116, T-118
  - Manba: [11 §11.8](../../backend-tz/core/11-deploy-free.md#118-zaxira--r2-ga-avtomatik), [08 §8.5](../../backend-tz/core/08-operations.md#tiklashni-sinash--majburiy)
  - Qabul: kunlik/haftalik/oylik zaxira R2'da; shifrlangan; **tiklash bir marta amalda sinaldi** va natija hujjatga yozildi
  - Tekshirish: `/opt/crm/verify-backup.sh`

- [ ] **T-122 · Kuzatuv va ogohlantirish**
  - Bog'liq: T-116
  - Manba: [11 §11.10](../../backend-tz/core/11-deploy-free.md#1110-kuzatuv--bepul), [08 §8.6](../../backend-tz/core/08-operations.md#86-monitoring)
  - Qabul: UptimeRobot `/health/ready` ni tekshiradi; Sentry ulangan; log rotatsiyasi sozlangan
  - Tekshirish: `curl -fsS https://api.domen.uz/health/ready` + Sentry'da sinov xatosi

- [ ] **T-123 · Tunlik invariant tekshiruvi**
  - Bog'liq: T-079, T-121
  - Manba: [10 §10.2](../../backend-tz/core/10-performance.md#102-denormalizatsiya-shartnomasi), [08 §8.6](../../backend-tz/core/08-operations.md#kunlik-invariant-tekshiruvi)
  - Qabul: barcha denormalizatsiyalar solishtiriladi; farq topilsa `critical` ogohlantirish; natija jurnalga yoziladi
  - Tekshirish: `npm run job:invariants -w apps/api`

---

## E16 — SaaS (obuna) — keyingi bosqich

- [ ] **T-124 · Ro'yxatdan o'tish va onboarding**
  - Bog'liq: T-021
  - Qabul: do'kon yaratish → admin hisobi → sozlash sehrgari (mavjud `OnboardingWizard` bilan mos)
  - Tekshirish: `npm run test:e2e -- signup`

- [ ] **T-125 · Tariflar va chegaralar**
  - Bog'liq: T-124
  - Manba: [09 §9.11](../../backend-tz/core/09-storage.md#911-kvota)
  - Qabul: `free|basic|pro` — foydalanuvchi soni, ombor soni, saqlash hajmi, SMS soni; chegara oshsa aniq xato
  - Tekshirish: `npm run test:e2e -- plan-limits`

- [ ] **T-126 · To'lov integratsiyasi**
  - Bog'liq: T-125
  - Qabul: Payme/Click webhook; to'lov tasdiqlanmaguncha tarif o'zgarmaydi; webhook idempotent
  - Tekshirish: `npm run test:e2e -- billing-webhook`

- [ ] **T-127 · Tenantni to'xtatish va o'chirish**
  - Bog'liq: T-125
  - Qabul: to'lanmasa `suspended` (o'qish mumkin, yozish yo'q); o'chirishda 30 kunlik muhlat, keyin ma'lumot va S3 fayllari to'liq o'chadi
  - Tekshirish: `npm run test:e2e -- tenant-suspend-delete`

- [ ] **T-128 · Tenant zaxirasini yuklab olish**
  - Bog'liq: T-084
  - Manba: [04 §4.13](../../backend-tz/profiles/qurilish-crm/04-api.md#8-zaxira)
  - Qabul: admin butun do'kon ma'lumotini JSON sifatida oladi (mavjud `Settings` zaxirasi formatida); fayl S3'da, havola 1 soat amal qiladi
  - Tekshirish: `npm run test:e2e -- tenant-export`

- [ ] **T-129 · Fiskal chek (OFD)**
  - Bog'liq: T-053
  - Manba: [08 §8.9](../../backend-tz/core/08-operations.md#89-fiskal-chek-ofd)
  - Qabul: `OFD_ENABLED=false` da ilova to'liq ishlaydi; yoqilganda chek fiskal ma'lumot bilan boyitiladi; OFD ishlamasa sotuv **to'xtamaydi** (navbatga tushadi)
  - Tekshirish: `npm run test:e2e -- ofd-degraded`

---

## Bajarish tartibi

```
E0 ─► E1 ─► E2 ─► E3 ─┬─► E4 ─┬─► E5 ─► E6 ─► E7 ─► E8 ─► E9
                      │       │
                      │       └─► E11 (fayllar — E5 bilan parallel)
                      │
                      └─► E15 (T-114…T-117 — erta sozlansa yaxshi)

E6 ─► E10 ─► E13 ─► E14 ─► E15 (qolgani) ─► E12 ─► E16
```

**Tavsiya:** E15 ning birinchi uchta vazifasi (Docker, VM, compose) E4 dan
keyin bajarilsin — shunda har bir keyingi epik **haqiqiy serverda** sinaladi
va oxirida «deploy qilib bo'lmadi» degan kutilmagan holat chiqmaydi.

## Progressni yangilash

Vazifa tugagach:

1. Katakcha `[x]` qilinadi
2. §«Umumiy holat» jadvalidagi epik hisobi yangilanadi (`3/9`)
3. Commit: `feat(sales): T-053 sotuv yaratish (I3, I5, I13)`
