# CRM backend API — frontend dasturchi uchun qo‘llanma

Bu hujjat backendda nima qilinganini, har bir API nima uchun va qanday ishlatilishini, frontend
qaysi qoidalarga amal qilishi kerakligini tushuntiradi. Maqsad — frontendni serverga ulashda
savol qolmasligi.

| Fayl | Nima bor |
|------|----------|
| **README.md** (shu fayl) | Umumiy qoidalar, auth oqimi, xatolar, rollar, realtime, biznes qoidalari, ekran → endpoint xaritasi, qadam-baqadam oqimlar, frontend vazifalari, ma’lum muammolar |
| [endpoints.md](endpoints.md) | **150 ta endpoint** — har biri: nima uchun/qachon, huquq, sarlavhalar, parametrlar, so‘rov tanasi, javob, xatolar, realtime hodisa |
| [schemas.md](schemas.md) | **193 ta DTO** — har bir maydon: tip, majburiymi, izoh, cheklovlar |

**Haqiqat manbai** — kod. `endpoints.md` va `schemas.md` `apps/api/openapi.json` dan generatsiya
qilingan (`npm run docs:api`, generator — `scripts/api-docs/`); `openapi.json` esa kodning o‘zidan
yasaladi va CI undagi farqni (drift) tekshiradi.
Jonli, sinab ko‘rish mumkin bo‘lgan versiya — Swagger UI: `http://localhost:3000/api/docs`
(production — `https://crm.workspaces.uz/api/docs`)
(production’da o‘chiq).

> Tavsiflarda uchraydigan `(I8)`, `(D1)`, `(04 §4.3)` kabi belgilar — backend texnik topshirig‘idagi
> (`backend-tz/`) invariant va bo‘lim raqamlari. Ularning ma’nosi [Ilova A](#glossary) da.

## Mundarija

1. [Qisqacha: backendda nima qilingan](#overview)
2. [Lokal ishga tushirish](#local)
3. [Frontendni ulash: manzil, proksi, cookie, tiplar, API mijozi](#connect)
4. [Umumiy qoidalar (konvensiyalar)](#conventions)
5. [Autentifikatsiya](#auth)
6. [Rollar, huquqlar va yashirin maydonlar](#roles)
7. [Xatolar](#errors)
8. [Do‘kon holati, tarif chegaralari va to‘lov](#tenant)
9. [Realtime (WebSocket) va keshni yangilash](#realtime)
10. [Biznes qoidalari](#rules)
11. [Ekran → endpoint xaritasi](#screens)
12. [Qadam-baqadam oqimlar (namuna kod)](#flows)
13. [Frontend vazifalari va qabul mezonlari](#tasks)
14. [Ma’lum muammolar va cheklovlar](#muammolar)
15. [Ilova A — invariantlar lug‘ati](#glossary)

---

<a id="overview"></a>

## 1. Qisqacha: backendda nima qilingan

**Stek:** NestJS 11 (Node ≥ 22), PostgreSQL 16 + Prisma 6, Redis (ixtiyoriy: kesh, navbat),
S3-mos obyekt saqlagich (lokal — MinIO, production — Cloudflare R2), socket.io (realtime).
Monorepo: `apps/api` (server) va `packages/shared` (`@crm/shared` — frontend bilan UMUMIY sof
funksiyalar: chek hisobi, birliklar, nasiya, bonus, huquqlar matritsasi, tariflar, CSV).

**Ko‘p do‘konli (multi-tenant):** bitta server ko‘p do‘konga xizmat qiladi. Do‘kon (tenant) ma’lumoti
uch qatlamda ajratilgan (so‘rov konteksti, Prisma filtri, PostgreSQL RLS). `tenantId` HECH QACHON
so‘rovdan olinmaydi — faqat access token’dan. Frontend `tenantId` yubormaydi (yagona istisno —
login’da do‘kon tanlash).

**Bo‘limlar (modullar) va ular nima beradi:**

| Bo‘lim | Imkoniyat |
|--------|-----------|
| Auth | Kirish (bir email bir necha do‘konda), JWT access token (15 daq) + httpOnly refresh cookie (30 kun, rotatsiya, o‘g‘irlik aniqlash), chiqish, barcha qurilmalardan chiqish, parol o‘zgartirish, yangi do‘kon ro‘yxatdan o‘tishi |
| Rollar | `admin`, `manager`, `sotuvchi`, `omborchi` — resurs × amal matritsasi; tannarx/foyda maydonlari rolga qarab javobdan olib tashlanadi |
| Spravochniklar | Omborlar (arxiv), kategoriyalar, mahsulotlar (qo‘shimcha birlik, import, ommaviy narx, rasm), mijozlar, ta’minotchilar, xodimlar, foydalanuvchilar — sahifalash, saralash, qidiruv, yumshoq o‘chirish + tiklash, optimistik qulf |
| Ombor | Kirim (o‘rtacha tannarx), chiqim, inventarizatsiya, ko‘chirish, harakatlar jurnali, buyurtma taklifi; qoldiq manfiy bo‘lmaydi |
| Sotuv | Chek (bitta tranzaksiya: qoldiq, kassa, bonus, yetkazish), qaytarish, bekor qilish, chop etish uchun chek (JSON yoki tayyor 80 mm PDF), OFD fiskal chek (navbat orqali) |
| Kassa | Smena ochish/yopish, joriy balans, naqd kirim/chiqim, X/Z hisobot |
| Moliya | Nasiya va qarzlar (eskirish 30/60/60+), qarz to‘lovi, xarajatlar va takrorlanuvchi shablonlar, kirim buyurtmalari (qabul, ta’minotchiga to‘lov) |
| Savdo | Takliflar (smeta) → sotuvga aylantirish, yetkazib berish (haydovchi ko‘rinishi, marshrut) |
| Hisobot | Boshqaruv paneli, foyda/zarar (oldingi davr bilan), analitika (ABC), keshlangan agregatlar |
| Xabarlar | Telegram bot (shaxsiy QR bilan ulangan mijozga xabar va chek — bepul) va SMS (Eskiz / Playmobile), shablon o‘zgaruvchilari, fon navbati, kunlik SMS chegarasi |
| Fayllar | Presigned yuklash (server orqali o‘tmaydi), tekshiruv (MIME, xesh), rasm variantlari 128/512 WebP, kvota |
| Eksport / zaxira | CSV/JSON eksport (katta — fonda), butun do‘kon zaxirasi (gzip JSON) |
| Migratsiya | Brauzerdagi eski (localStorage) ma’lumotni serverga ko‘chirish: dry-run + import |
| Tarif / to‘lov | `free`/`basic`/`pro` chegaralari, hisob-faktura, Payme va Click webhook’lari, muddati o‘tgan do‘kon — faqat o‘qish |
| Hayot sikli | Do‘konni o‘chirish (30 kun muhlat, bekor qilish mumkin) |
| Realtime | `/events` — sotuv, qoldiq, smena, qarz, yetkazish, kirim hodisalari |
| Audit | Har bir pul/ombor/spravochnik amali jurnalga yoziladi |

**Frontend ahvoli:** frontend (`crm-qurilish`) hozir brauzerda (localStorage/zustand) ishlaydi.
Uni serverga ulash — frontend vazifasi ([13-bo‘lim](#tasks)). Backend tomoni tayyor va sinalgan
(130 unit + 539 e2e test).

---

<a id="local"></a>

## 2. Lokal ishga tushirish

Kerak: Node ≥ 22, Docker.

```bash
cd crm-api
npm install

# Postgres :5433, Redis :6380, MinIO :9000 (konsol :9001, login minioadmin/minioadmin)
npm run services:up            # docker compose plagini bo'lmasa ham ishlaydi
# yoki: docker compose up -d

cp apps/api/.env.example apps/api/.env
# .env da lokal MinIO kalitlarini yozing:
#   S3_ACCESS_KEY=minioadmin
#   S3_SECRET_KEY=minioadmin
# Frontend boshqa portda bo'lsa: WEB_ORIGINS=http://localhost:5173 (sukut shu)

bash scripts/gen-keys.sh       # JWT kalitlari → apps/api/secrets/
npm run db:deploy              # migratsiyalar (ilova roli crm_app ham yaratiladi)
npm run build -w packages/shared
npm run db:seed -w @crm/api    # demo do'kon
npm run start:dev -w @crm/api  # http://localhost:3000
```

Tekshirish: `curl http://localhost:3000/health/ready` → `200`. Swagger: `http://localhost:3000/api/docs`.

**Demo do‘kon** («Qurilish Mollari (demo)», tarif `pro`, 2 ombor, 12 mahsulot, 3 mijoz, 3 ta’minotchi).
Hammasining paroli — `admin12345`:

| Email | Rol |
|-------|-----|
| `admin@crm.uz` | admin (Bobur Toshmatov, Direktor) |
| `manager@crm.uz` | manager |
| `sotuvchi@crm.uz` | sotuvchi |
| `ombor@crm.uz` | omborchi |

Seed smena ochmaydi — POS’da avval smena oching. Ixtiyoriy imkoniyatlar lokalda o‘chiq:
`SMS_PROVIDER=none` (SMS faqat jurnalga yoziladi, yuborilmaydi), `OFD_ENABLED=false` (chekda
`fiscal: null`), Payme/Click kalitlari bo‘sh (hisob-fakturada havolalar `null`). PDF chek lokalda
ham ishlaydi (qo‘shimcha dastur kerak emas).

> Demo sement: asosiy birlik `qop`, qo‘shimcha `kg` (`altFactor: 0.02` — 1 kg = 0,02 qop, kg narxi = qop narxi / 50).

---

<a id="connect"></a>

## 3. Frontendni ulash

### 3.1 Manzil va proksi

- REST: `/api/v1/...` (masalan `GET /api/v1/products`). Faqat `/health/live`, `/health/ready` — prefiksiz.
- Realtime: socket.io, nomlar fazosi `/events`, yo‘l — sukut `/socket.io`.

**Dev — Vite proksi (yagona qo‘llab-quvvatlanadigan yo‘l):** brauzer uchun frontend va API bitta
manbada (origin) bo‘ladi — CORS kerak emas, refresh cookie ishlaydi. Proksi lokal backendga ham,
**production’ga ham** yo‘naltiriladi:

```ts
// vite.config.ts — lokal backend: API_PROXY_TARGET berilmaydi;
// production: API_PROXY_TARGET=https://crm.workspaces.uz npm run dev
const target = process.env.API_PROXY_TARGET ?? 'http://localhost:3000'
export default defineConfig({
  server: {
    proxy: {
      '/api': { target, changeOrigin: true },
      '/socket.io': { target, ws: true, changeOrigin: true },
      '/health': { target, changeOrigin: true },
    },
  },
})
```

- `VITE_API_URL` bo‘sh, socket — `io('/events')`: kod dev’da ham, production’da ham bir xil.
- Production’ga proksi sinalgan (2026-09-29): `/health/ready` 200, API va login javob beradi, WebSocket
  ulanadi (token tekshiruvigacha yetadi).
- `http://localhost:5173` — refresh cookie (`Secure`) ham ishlaydi: brauzer `localhost` ni xavfsiz
  manzil deb hisoblaydi.
- LAN’dan (masalan `http://10.10.112.11:5173`) — `Secure` cookie oddiy `http` da saqlanmaydi: refresh
  ishlamaydi, 15 daqiqadan keyin qayta login. Yechim — dev serverni HTTPS bilan:
  `npm i -D @vitejs/plugin-basic-ssl`, `plugins: [basicSsl()]`, `server: { host: true }` →
  `https://10.10.112.11:5173` (brauzer sertifikat ogohlantirishini bir marta qabul qiladi).

**Production API’ga boshqa origin’dan to‘g‘ridan-to‘g‘ri murojaat qo‘llab-quvvatlanmaydi** (masalan
`localhost:5173` dan `VITE_API_URL=https://crm.workspaces.uz` bilan): production CORS ro‘yxati
(`WEB_ORIGINS`) — faqat `https://crm.workspaces.uz`, refresh cookie — `SameSite=Strict` (boshqa saytdan
kelgan so‘rovga qo‘shilmaydi). Ularni bo‘shatish xavfsizlikni pasaytiradi: ro‘yxatdagi `localhost:5173`
da ishlagan istalgan sahifa (boshqa loyiha, zararli paket) foydalanuvchi nomidan production’ga so‘rov
yubora olardi; `SameSite=None` CSRF himoyasini talab qiladi, Safari va Firefox esa bunday uchinchi
tomon cookie’larini baribir bloklaydi. Proksi bularning hammasini backend o‘zgarishisiz hal qiladi.

**Production — `https://crm.workspaces.uz`** (ishlayapti): frontend va API **bitta serverda, bitta
domenda**. API — `https://crm.workspaces.uz/api/v1`, Swagger — `https://crm.workspaces.uz/api/docs`,
sog‘liq — `https://crm.workspaces.uz/health/ready`. Server (Caddy) `/api/*`, `/socket.io/*`, `/health/*` ni
API’ga, qolganini frontend build’iga beradi — dev’dagi Vite proksi bilan aynan bir xil yo‘llar:

- Production bazasi **bo‘sh** (demo ma’lumot yo‘q): sinov uchun o‘z do‘koningizni ro‘yxatdan o‘tkazing
  (ro‘yxatdan o‘tish sahifasi yoki `POST /api/v1/tenants/register`, bir IP’dan soatiga 5 tagacha). Demo
  loginlar (`admin@crm.uz` …) — faqat lokal seed’da.
- `VITE_API_URL` **bo‘sh** (yoki berilmaydi): so‘rovlar nisbiy (`/api/v1/...`), socket — `io('/events')`.
  CORS va preflight yo‘q, refresh cookie (`SameSite=Strict`) muammosiz yuboriladi.
- Service worker (`vite-plugin-pwa`) API yo‘llarini ushlamasin — aks holda yangi oynada ochilgan
  `/api/...` havolasiga `navigateFallback` `index.html` qaytaradi:
  `workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/health\//] }`.
- Deploy (build → server, kesh, kalit, GitHub secret va variable’lar) — frontend repo’sidagi
  [DEPLOY.md](https://github.com/gayipovdostonbek/crm-qurilish/blob/main/DEPLOY.md); uni server egasi bajaradi.

API boshqa domenda bo‘lsa (hozir rejada yo‘q): `VITE_API_URL=https://api.domen.uz`, ikkalasi bitta
ro‘yxatdan o‘tgan domen ostida bo‘lishi shart (`crm.domen.uz` + `api.domen.uz` — ishlaydi;
`crm.pages.dev` + `api.domen.uz` — cookie yuborilmaydi). Server CORS ro‘yxati — `WEB_ORIGINS`
(vergul bilan), `credentials: true`; `*` hech qachon.

CORS’da ruxsat etilgan so‘rov sarlavhalari: `Content-Type`, `Authorization`, `Idempotency-Key`,
`If-Match`, `X-Request-Id`. JS o‘qiy oladigan javob sarlavhalari: `X-Request-Id`,
`Idempotent-Replay`, `Content-Disposition`.

### 3.2 Cookie

- Nomi `refresh_token`, `httpOnly` (JS ko‘rmaydi), `SameSite=Strict`, `Path=/api/v1/auth`
  (faqat auth yo‘llariga yuboriladi), 30 kun, production’da `Secure`.
- Brauzer uni yuborishi uchun HAR BIR auth so‘rovi `credentials: 'include'` bilan
  (boshqa so‘rovlarga ham `include` qo‘yish zararsiz).
- Proksi yo‘lni qayta yozmasin: cookie `/api/v1/auth` yo‘liga bog‘langan.

### 3.3 Tiplar (TypeScript)

`openapi.json` — backend repoda `apps/api/openapi.json` (yoki ishlayotgan serverda
`GET /api/docs-json`). Tiplar `openapi-typescript` bilan:

```bash
npx openapi-typescript ../crm-api/apps/api/openapi.json -o src/api/schema.d.ts
# package.json: "gen:api": "openapi-typescript ../crm-api/apps/api/openapi.json -o src/api/schema.d.ts"
```

```ts
import type { components, paths } from './schema'
export type Schemas = components['schemas']
type Product = Schemas['ProductDto']
type ProductQuery = paths['/api/v1/products']['get']['parameters']['query']
```

Backend DTO o‘zgarsa: backendda `npm run build -w @crm/api && npm run openapi -w @crm/api`,
keyin frontendda `npm run gen:api` va `typecheck`.

Yashirin maydonlar (masalan `cost`) sxemada **ixtiyoriy** (`cost?: number`) — sotuvchi rolida
ular javobda umuman bo‘lmaydi. Kodda `product.cost ?? null` kabi tekshiring.

### 3.4 Umumiy formulalar — `@crm/shared`

Kassadagi jami, qo‘shimcha birlik narxi, nasiya tekshiruvi, bonus — ekranda oldindan ko‘rsatiladi,
lekin server ham AYNAN SHU formulalar bilan qayta hisoblaydi. Farq bo‘lsa — 422 `TOTAL_MISMATCH`.
Shuning uchun frontend `packages/shared/src/*` dagi funksiyalardan foydalansin:

| Fayl | Funksiyalar |
|------|-------------|
| `pos.ts` | `lineTotal`, `saleTotals`, `refundTotals` |
| `units.ts` | `unitOptions`, `hasAltUnit`, `toBaseQty`, `fromBaseQty`, `priceForUnit` |
| `finance.ts` | `evaluateCredit`, `dueDateFor`, `isRevenueSale`, ... |
| `loyalty.ts` | `bonusEarned` |
| `permissions.ts` | `hasPermission(role, resource, action)` |
| `plans.ts` | `PLANS`, `planLimits`, `PLAN_MONTHLY_PRICE` |
| `csv.ts` | `csvLine`, `CSV_BOM` (formula in’yeksiyasidan himoya bilan) |
| `recurring.ts`, `reorder.ts`, `warehouse.ts`, `cost.ts` | shablon muddati, buyurtma taklifi, ombor, o‘rtacha tannarx |

Hammasi paketning ildizidan import qilinadi (`import { saleTotals } from '@crm/shared'` — `@crm/shared/pos`
kabi sub-path yo‘q). `packages/shared` frontenddagi `src/lib/*.ts` dan nusxa olingan va biroz tuzatilgan (masalan
`pos.ts` — 8 qator, `finance.ts` — 54 qator farq). Variantlar: (a) frontend `@crm/shared` ni
to‘g‘ridan-to‘g‘ri ishlatadi (`"@crm/shared": "file:../crm-api/packages/shared"`, oldin
`npm run build -w packages/shared`) — tavsiya; (b) nusxani `packages/shared` bilan
tenglashtirib, keyin sinxron saqlash.

### 3.5 API mijozi — talablar

1. `Authorization: Bearer <accessToken>` — token faqat xotirada (o‘zgaruvchi/store, persist’siz).
2. `credentials: 'include'`.
3. 401 kelsa (`/auth/login`, `/auth/refresh`, `/auth/logout` dan tashqari — `/auth/me`,
   `/auth/change-password`, `/auth/logout-all` ham token talab qiladi) → **bitta** refresh → so‘rov bir
   marta qayta yuboriladi → yana 401 bo‘lsa xato (refresh ham yiqilsa — login sahifasi). Parallel 401’lar o‘sha bitta refresh’ni kutadi ([5.3](#auth-refresh)).
4. Xato tanasi `ApiError` ga aylantiriladi: `status`, `code`, `title`, `detail`, `errors`,
   `current`, `traceId` ([7-bo‘lim](#errors)).
5. Pul/ombor amallarida `Idempotency-Key` ([4.6](#idempotency)).
6. Yozuvchi so‘rov (POST/PATCH/DELETE) avtomatik QAYTA URINILMAYDI (faqat idempotent kalit bilan,
   foydalanuvchi bilgan holda). GET — tarmoq xatosida 1–2 marta qayta urinish mumkin.
7. `204` — tana yo‘q; `302` (fayl, eksport) — `fetch` o‘zi ergashadi yoki `window.open` ishlatiladi.

To‘liq namuna kod — [12.1](#flow-client).

---

<a id="conventions"></a>

## 4. Umumiy qoidalar (konvensiyalar)

### 4.1 Format va identifikatorlar

- JSON (`Content-Type: application/json`), UTF-8. Istisno: Click webhook (form-urlencoded),
  fayl yuklash (to‘g‘ridan-to‘g‘ri S3’ga), eksport javobi (CSV).
- Barcha `id` — UUID: yangi yozuvlar **v7** (vaqt tartibida), migratsiya bilan ko‘chganlari — v5 (vaqt
  tartibida emas; tartib uchun `createdAt`/`date` ishlating). Yo‘ldagi `:id` UUID bo‘lmasa — 400.
- DTO’da e’lon qilinmagan maydon yuborilsa — **400** (`forbidNonWhitelisted`): masalan mahsulot
  tahririda `stock` yoki foydalanuvchi yaratishda `tenantId`. Faqat hujjatdagi maydonlarni yuboring.
- Query’da boolean — `true` / `false` matni (`?archived=false`).
- Matnli maydonlar boshi/oxiridagi bo‘shliqlar serverda kesiladi (`Trim`).
- Hujjat raqamlari do‘kon ichida ketma-ket va noyob, 1001 dan: chek `CHEK-1001`, qaytarish
  `QAYT-1001`, taklif `TKLF-1001`, kirim buyurtmasi `BUY-1001`.

### 4.2 Pul, miqdor, sana, vaqt

| Tur | Ko‘rinishi | Qoida |
|-----|-----------|-------|
| Pul | `number`, butun so‘m | Tiyin yo‘q. Manfiy emas, `≤ 2^53−1`. Ko‘rsatishda formatlang (`1 250 000 so‘m`) |
| Miqdor | `number`, ≤ 3 kasr | `0.001` dan katta. Ombor miqdori — mahsulotning ASOSIY birligida (`unit`) |
| Foiz | `number`, butun 0–100 | `taxRate`, `maxDiscountPct`, `loyaltyRate` (12 = 12 %) |
| Sana | `"YYYY-MM-DD"` | Biznes kuni — **Asia/Tashkent** (00:30 dagi sotuv — o‘sha kun). `date`, `dueDate`, `scheduledDate`, `dateFrom`/`dateTo` (ikkala chegara ham KIRADI) |
| Vaqt | ISO 8601, UTC (`...Z`) | `createdAt`, `updatedAt`, `openedAt`, ... — ko‘rsatishda mahalliy vaqtga o‘giring |

Sana filtrlari (`dateFrom`, `dateTo`) ham Toshkent kuni bo‘yicha. `date` (chek sanasi) kelajakda
bo‘lmaydi; o‘tgan sana bilan chek yozish mumkin (offline navbat uchun).

<a id="lists"></a>

### 4.3 Ro‘yxatlar: sahifalash, saralash, qidiruv, filtr

**Ikki xil sahifalash bor:**

| | Oddiy (offset) | Kursorli (keyset) |
|---|---|---|
| Qayerda | Spravochniklar va kichik jurnallar (mahsulot, mijoz, ta’minotchi, xodim, foydalanuvchi, ombor, kategoriya, smena, kassa harakati, taklif, xarajat, qarz, kirim buyurtmasi, yetkazish, xabar) | Uzun jurnallar: `GET /sales`, `GET /stock/movements`, `GET /audit` |
| So‘rov | `page` (≥ 1, sukut 1), `pageSize` (1–200, sukut 20) | `cursor` (oldingi javobdagi `nextCursor`), `limit` (1–200, sukut 50) |
| Javob | `{ items, page, pageSize, total, pageCount }` | `{ items, nextCursor, hasMore }` |
| UI | Sahifa raqamlari | «Ko‘proq» tugmasi / cheksiz aylantirish |

- Kursorli ro‘yxatda sahifalar orasida filtrlar O‘ZGARMASIN; filtr o‘zgarsa — kursorsiz boshidan.
  Buzilgan kursor — 400.
- `pageSize` > 200 — 400 (hammasini bir so‘rovda olib bo‘lmaydi). CSV uchun — eksport
  endpointi yoki sahifalarni ketma-ket yig‘ish.

**Saralash** — `sort=<kalit>` (o‘sish) yoki `sort=-<kalit>` (kamayish). Kalitlar har ro‘yxatda o‘z
OQ RO‘YXATI bilan (boshqa kalit — 400):

| Ro‘yxat | `sort` kalitlari | Sukut |
|---------|------------------|-------|
| `/products` | `name`, `sku`, `price`, `stock`, `createdAt`, `id` | `name` |
| `/clients` | `name`, `createdAt`, `bonusPoints`, `id` | `-createdAt` |
| `/suppliers` | `name`, `createdAt`, `id` | `name` |
| `/employees` | `name`, `hiredAt`, `createdAt`, `id` | `name` |
| `/users` | `name`, `email`, `createdAt`, `lastLoginAt`, `id` | `name` |
| `/warehouses` | `name`, `createdAt`, `id` | `createdAt` |
| `/categories` | `name`, `sortOrder`, `id` | `sortOrder` |

Qolgan ro‘yxatlar (cheklar, smenalar, xarajatlar, takliflar, kirim buyurtmalari, yetkazishlar,
qarzlar, xabarlar, harakatlar, audit) `sort` qabul QILMAYDI — server tartibi (odatda yangisi birinchi).
Bu jadvallarda sarlavha bosib saralash bo‘lmasin.

**Qidiruv** — `q` (≤ 100 belgi), katta-kichik harfga qaramaydi, so‘z qismi bo‘yicha. Qaysi
maydonlarda qidirishi har endpoint tavsifida (masalan mahsulot — nom, SKU qismi + shtrix-kod
aniq; mijoz — nom, kompaniya, telefon). **Filtrlar** — har endpointning parametrlar jadvalida
([endpoints.md](endpoints.md)).

**Xulosa kartalari** — sahifa tepasidagi jami/son kartalari uchun alohida `.../summary`
endpointlari bor (`/products/summary`, `/suppliers/summary`, `/quotes/summary`,
`/purchase-orders/summary`, `/expenses/summary`, `/deliveries/summary`; qarzlarda `summary` —
ro‘yxat javobi ichida). Jami summani joriy SAHIFA qatorlaridan hisoblamang — noto‘g‘ri chiqadi.

### 4.4 O‘chirish, tiklash (undo), arxivlash

- `DELETE /x/:id` → `204`. Yozuv **yumshoq** o‘chiriladi (ro‘yxatlardan yo‘qoladi).
- `POST /x/:id/restore` → `200` + tiklangan yozuv. Toast’dagi «Qaytarish» tugmasi shuni chaqiradi.
  Tiklash bor: kategoriya, mahsulot, mijoz, ta’minotchi, xodim, foydalanuvchi, taklif, xarajat,
  kirim buyurtmasi, yetkazish. O‘chirilganlar ro‘yxati (keyinroq tiklash uchun) — hozircha faqat
  foydalanuvchilarda: `GET /users?deleted=true` ([10.12](#rules)).
- O‘chirishni to‘suvchi bog‘liqlik — 409 (`CATEGORY_IN_USE`, `CLIENT_HAS_DEBT`,
  `SUPPLIER_HAS_OPEN_ORDERS`, `EMPLOYEE_HAS_USER`, `QUOTE_ALREADY_CONVERTED`).
- **Ombor** o‘chirilmaydi — `POST /warehouses/:id/archive` / `.../restore`.
- **Chek** o‘chirilmaydi — faqat bekor qilinadi (`POST /sales/:id/cancel`).
- **Mahsulotni sotuvdan olish** — `PATCH {"archived": true}` (o‘chirmasdan).

<a id="ifmatch"></a>

### 4.5 Optimistik qulf — `If-Match`

Ikki kishi bir yozuvni bir vaqtda tahrirlasa, ikkinchisi birinchisining o‘zgarishini bilmasdan
ustiga yozmasligi uchun:

1. Tahrir formasi ochilganda yozuvning `updatedAt` qiymatini eslab qoling.
2. `PATCH` da `If-Match: <o‘sha updatedAt>` sarlavhasini yuboring (aynan kelgan ISO satr;
   qo‘shtirnoq ixtiyoriy).
3. Shu orada boshqa birov o‘zgartirgan bo‘lsa — **409 `VERSION_CONFLICT`**, javobda `current`
   (serverdagi joriy yozuv, rolga qarab tozalangan). UI: «Yozuv boshqa foydalanuvchi tomonidan
   o‘zgartirilgan» + yangi qiymatlarni ko‘rsatib, qayta tahrirlash yoki ustiga yozishni taklif qiling.
4. Muvaffaqiyatli javobdagi yangi `updatedAt` — keyingi tahrir uchun.

Qo‘llanadi: `PATCH` — `/categories`, `/clients`, `/employees`, `/products`, `/suppliers`,
`/users`, `/warehouses`. Sarlavha yuborilmasa tekshirilmaydi (oxirgi yozuv yutadi). Sotuv, oddiy
qoldiq o‘zgarishi va bonus `updatedAt` ga tegmaydi — kassa sotuvi mahsulot kartasini tahrirlayotgan
adminni to‘smaydi. Lekin tannarxni o‘zgartiradigan amallar — `unitCost` bilan kirim, kirim
buyurtmasini qabul qilish, ommaviy narx, import — mahsulotning `updatedAt` ini yangilaydi (parallel
tahrir 409 oladi). Javoblarda Express’ning avtomatik `ETag` sarlavhasi bo‘lishi mumkin — uni
`If-Match` ga QO‘YMANG (400): versiya faqat DTO’dagi `updatedAt`.

<a id="idempotency"></a>

### 4.6 Idempotentlik — `Idempotency-Key`

Kassir «Sotish» ni bosdi, javob kelmadi (internet uzildi), qayta bosdi — ikkinchi chek yozilmasligi
kerak. Shuning uchun pul va ombor amallarida sarlavha **MAJBURIY** (yo‘q bo‘lsa — 400):

`POST /sales`, `/sales/:id/return`, `/sales/:id/cancel`, `/quotes/:id/convert`,
`/cash/shifts/open`, `/cash/shifts/close`, `/cash/movements`, `/debts/payments`, `/expenses`,
`/purchase-orders/:id/receive`, `/purchase-orders/:id/pay`, `/stock/intake`, `/stock/writeoff`,
`/stock/adjust`, `/stock/transfer`.

Qoidalar:

- Kalit: 8–100 belgi, faqat `A-Z a-z 0-9 - _`. Eng osoni — `crypto.randomUUID()`.
- **Bitta foydalanuvchi amali — bitta kalit.** Kalit amal (masalan «shu savatni to‘lash»)
  boshlanganda yaratiladi va QAYTA URINISHLARDA O‘ZGARMAYDI. Savat/forma o‘zgarsa — yangi kalit.
- Xuddi shu kalit + xuddi shu tana → server amalni qayta bajarmaydi, saqlangan javobni qaytaradi
  (status bir xil, sarlavha `Idempotent-Replay: true`).
- Xuddi shu kalit + boshqa tana (yoki boshqa endpoint) → **409 `IDEMPOTENCY_MISMATCH`**.
- Amal xato bilan tugasa (4xx) kalit saqlanmaydi — tuzatib, xuddi shu kalit bilan qayta yuborish mumkin.
- Javob kelmadi (tarmoq) yoki 502/504 (proksi) — natija NOMA’LUM: amal serverda bajarilgan bo‘lishi
  mumkin. Faqat XUDDI SHU kalit bilan qayta yuboring — bajarilgan bo‘lsa saqlangan javob qaytadi.
- Parallel ikkita bir xil so‘rov — ikkinchisi birinchisini kutadi va uning javobini oladi.
- Kalit 24 soat saqlanadi. Tana xeshi maydonlar tartibiga bog‘liq emas.
- Offline navbatdagi chek keyin XUDDI SHU kalit bilan yuboriladi ([12.4](#flow-offline)).

### 4.7 Sarlavhalar va chegaralar

- `X-Request-Id` — har javobda (so‘rovda yuborsangiz — o‘sha qaytadi, ≤ 64 belgi). Xato
  tanasidagi `traceId` — shu qiymat. 500 xatoda foydalanuvchiga «Xato kodi: …» deb ko‘rsating —
  loglardan topiladi.
- **Rate limit** — har ENDPOINT va IP bo‘yicha alohida hisob: sukut — daqiqasiga 300 so‘rov (har yo‘lga);
  `POST /auth/login` — 10/daq; `POST /auth/refresh` — 30/daq; `POST /tenants/register` — 5/soat.
  Proksi ortida IP — `X-Forwarded-For` dan (serverda `TRUST_PROXY=1`; proksisiz `0` — sarlavha e’tiborsiz). Oshsa — **429** (bu holatda
  `code: "INTERNAL"`, shuning uchun `status === 429` bo‘yicha aniqlang: «Juda ko‘p urinish,
  birozdan keyin»).
- **Tana hajmi:** JSON ≤ 4 MB (`/migration/*` — 25 MB) → oshsa 413 `PAYLOAD_TOO_LARGE`.
  Fayllar API orqali o‘tmaydi ([10.16](#files)).
- Mahsulot importi ≤ 5000 qator; chekda ≤ 200 qator; ommaviy narx ≤ 1000 mahsulot; inventarizatsiya
  ≤ 500 qator; kirim buyurtmasi ≤ 500 qator; `/files/urls` ≤ 100 id.

---

<a id="auth"></a>

## 5. Autentifikatsiya

### 5.1 Tokenlar

| | Access token | Refresh token |
|---|---|---|
| Qayerda | Javob tanasida (`accessToken`) | `refresh_token` httpOnly cookie |
| Muddati | 15 daqiqa (`expiresIn: 900`, soniya) | 30 kun |
| Saqlash | Faqat XOTIRADA (localStorage’ga yozilmaydi) | Brauzer o‘zi |
| Yuborish | `Authorization: Bearer …` | Avtomatik (`credentials: 'include'`), faqat `/api/v1/auth/*` ga |

Access token — RS256 JWT: `sub` (user id), `tid` (do‘kon), `role`, `eid` (xodim id), `jti`.
Frontend uni dekodlashi shart emas — foydalanuvchi ma’lumoti login/refresh javobidagi `user` da:

```json
{
  "accessToken": "eyJ…",
  "expiresIn": 900,
  "user": {
    "id": "…", "name": "Bobur Toshmatov", "email": "admin@crm.uz", "role": "admin",
    "position": "Direktor", "employeeId": "…", "tenant": { "id": "…", "name": "Qurilish Mollari (demo)", "status": "active" }
  }
}
```

### 5.2 Kirish

`POST /auth/login` `{ email, password }`:

- **201** — yuqoridagi javob + cookie.
- **401 `AUTH_INVALID_CREDENTIALS`** — email yoki parol xato (qaysi biri — aytilmaydi).
- **409 `AUTH_TENANT_REQUIRED`** — bu email + parol bir nechta do‘konda bor. `errors[]` da
  `meta: { tenantId, tenantName }` ro‘yxati → do‘kon tanlash oynasi → xuddi shu so‘rov + `tenantId`.
- **423 `AUTH_ACCOUNT_LOCKED`** — xodim ishdan bo‘shatilgan. To‘xtatilgan (`suspended`) yoki
  o‘chirilayotgan (`deleting`) do‘konga kirish MUMKIN — `user.tenant.status` bo‘yicha faqat-o‘qish
  bannerini ko‘rsating ([8.1](#tenant)).
- **429** — daqiqasiga 10 urinishdan oshdi.

Yangi do‘kon — `POST /tenants/register` (javob login bilan bir xil, foydalanuvchi darhol kirgan,
roli `admin`). Keyin `settings.onboarded === false` bo‘lsa — dastlabki sozlash sehrgari.

<a id="auth-refresh"></a>

### 5.3 Tokenni yangilash — `POST /auth/refresh`

Tanasi yo‘q, cookie bilan. Javob — login bilan bir xil (yangi access token + yangi cookie).

Qachon chaqiriladi:

1. **Ilova ochilganda** (sahifa yangilanganda xotirada token yo‘q): refresh muvaffaqiyatli —
   foydalanuvchi kirgan; 401 — login sahifasi. Bu «meni eslab qol» vazifasini bajaradi.
2. **Himoyalangan so‘rov 401 qaytarganda** — refresh, keyin asl so‘rov bir marta qayta.
3. Ixtiyoriy: muddat tugashidan ~1 daqiqa oldin (taymer) — foydalanuvchi 401 ni sezmaydi.

> ⚠️ **Bir vaqtda faqat BITTA refresh — hatto bir nechta tabda ham.** Har refresh eski cookie’ni
> bekor qiladi (rotatsiya). Ikki so‘rov bir xil eski cookie bilan parallel ketsa, ikkinchisi
> «bekor qilingan token qayta ishlatildi» deb qabul qilinadi → **401 `AUTH_TOKEN_REUSE` va
> foydalanuvchining BARCHA sessiyalari (hamma qurilmada) yopiladi.** Himoya:
> - tab ichida — bitta umumiy `Promise` (parallel 401’lar o‘shani kutadi);
> - tablar orasida — `navigator.locks.request('crm-auth-refresh', …)` (Web Locks API): ikkinchi
>   tab navbat kutadi va o‘z so‘rovini yangi cookie bilan yuboradi;
> - React StrictMode’da ilova ochilishidagi refresh ikki marta chaqirilmasin.
>
> Namuna — [12.1](#flow-client).

Refresh xatolari — barchasida xotirani tozalab login sahifasiga («Sessiya tugadi, qayta kiring»):

- 401 `AUTH_INVALID_REFRESH` — cookie yo‘q, noma’lum yoki muddati (30 kun) o‘tgan;
- 401 `AUTH_TOKEN_REUSE` — cookie BEKOR QILINGAN: parallel refresh, shuningdek boshqa qurilmada
  «barcha qurilmalardan chiqish», parol o‘zgarishi, admin parolni tiklashi yoki hisobni o‘chirishidan
  keyin — bu oddiy holat, foydalanuvchiga «o‘g‘irlik» ogohlantirishi ko‘rsatmang;
- 423 `AUTH_ACCOUNT_LOCKED` — xodim ishdan bo‘shatilgan.

### 5.4 Chiqish va sessiyalar

| Amal | Endpoint | Natija |
|------|----------|--------|
| Chiqish | `POST /auth/logout` | Shu qurilma sessiyasi bekor, cookie o‘chadi. Frontend: xotiradagi token, so‘rovlar keshi, socket — tozalanadi |
| Barcha qurilmalardan | `POST /auth/logout-all` | Foydalanuvchining barcha refresh tokenlari bekor (`{ revoked: n }`) |
| Parolni o‘zgartirish | `POST /auth/change-password` `{ currentPassword, newPassword }` | Barcha sessiyalar (shu qurilma ham) yopiladi → login sahifasi |
| Admin parolni tiklasa / hisobni o‘chirsa | `PATCH /users/:id` (`password` yoki `isActive:false`) | O‘sha foydalanuvchining barcha sessiyalari yopiladi |

Access token bekor qilinmaydi — muddati tugaguncha (≤ 15 daq) ishlaydi. Shuning uchun rol
o‘zgarishi foydalanuvchiga ≤ 15 daqiqada yetib boradi.

Parol siyosati: kamida 8 belgi, ommabop parollar rad etiladi (400 `VALIDATION_FAILED`).

---

<a id="roles"></a>

## 6. Rollar, huquqlar va yashirin maydonlar

### 6.1 Huquqlar matritsasi

Manba — `packages/shared/src/permissions.ts` (frontend ham shuni ishlatsin: menyu, tugmalar,
yo‘llar). `admin` — hammasi. ✔ = view + create + edit + delete; `V` — faqat ko‘rish;
`VCE` — o‘chirishsiz.

| Resurs → | products | sales | customers | suppliers | employees | users | settings | expenses | finance | deliveries | quotes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **admin** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **manager** | ✔ | ✔ | ✔ | ✔ | VCE | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| **sotuvchi** | V | VCE | ✔ | V | — | — | — | — | VCE | VCE | VCE |
| **omborchi** | ✔ | V | V | ✔ | — | — | — | — | — | V | — |

Resurslar ma’nosi: `finance` — kassa, smena, qarzlar, hisobotlar, ta’minotchiga to‘lov;
`products` — katalog va ombor amallari; `suppliers` — ta’minotchilar va kirim buyurtmalari;
`customers` — mijozlar va SMS; `users` — kirish hisoblari va audit jurnali.

Har endpointning aniq huquqi — [endpoints.md](endpoints.md) da («Huquq» qatori, qaysi rollarga
ochiqligi bilan). Huquq yetmasa — **403 `PERMISSION_DENIED`**. UI huquqi yo‘q tugmani umuman
ko‘rsatmasin, lekin server baribir tekshiradi.

**Faqat administrator** (servisda tekshiriladi): `GET/POST /tenants/current*`, `/billing/invoices`,
`/backup/export`, `/migration/*`, shuningdek `users:*` (foydalanuvchilar, audit).

**Muhim nozikliklar:**

- `GET /settings` — hamma rol o‘qiydi (kassaga QQS va chegirma chegarasi kerak); o‘zgartirish —
  `settings:edit`.
- `GET /dashboard`, `/reports/pnl`, `/analytics` — `finance:view`: omborchida yo‘q → omborchining
  bosh sahifasi boshqa bo‘lsin (masalan katalog/ombor).
- `GET /employees` — faqat admin/manager. Sotuvchi yetkazish yaratishi mumkin, lekin haydovchi
  tanlash ro‘yxatini ololmaydi → unga haydovchi maydonini ko‘rsatmang (keyin manager biriktiradi).
- Kirim buyurtmasi yaratish/qabul — `suppliers` (omborchi ham), to‘lov — `finance:create`
  (omborchida yo‘q). Sotuvchida ham `finance:create` bor, lekin u xarid summalarini ko‘rmaydi
  ([6.2](#hidden)) — to‘lov tugmasini unga ko‘rsatmang.
- Sotuvchi `suppliers:view` bilan ta’minotchilar va kirim buyurtmalarini KO‘RADI (kim, nima, qachon
  keladi), lekin pul maydonlarisiz — «Ta’minotchilar»/«Xaridlar» sahifasida pul ustunlari va kartalarini
  `field in obj` bilan yashiring.
- Yetkazish holati — `deliveries:view` bilan chaqiriladi: `edit` huquqisiz foydalanuvchi (haydovchi)
  faqat O‘ZIGA biriktirilganini o‘zgartiradi.
- Fayl huquqi fayl turiga bog‘liq; eksport huquqi ro‘yxatga bog‘liq (endpoints.md’da).

### <a id="hidden"></a>6.2 Yashirin maydonlar (rolga qarab)

Server bu maydonlarni javobdan **butunlay olib tashlaydi** (`null` emas — kalit yo‘q). Barcha
javoblarga, ichma-ich obyektlarga, 409 dagi `current` ga va eksport ustunlariga qo‘llanadi.

| Rol | Yashirin maydonlar |
|-----|--------------------|
| sotuvchi | `cost`, `unitCost`, `stockValue`, `stockValueByCategory`, `deadValue`, `wholesalePrice`\*, `salary`, `grossProfit`, `netProfit`, `profit`, `cogs`, `margin`, `payables` |
| omborchi | `salary`, `grossProfit`, `netProfit`, `profit`, `cogs`, `margin` |

\* **Ulgurji narx sotuvchiga do‘kon sozlamasi bilan ochiladi.** `wholesaleEnabled` va
`sellerWholesaleEnabled` ikkalasi `true` bo‘lsa sotuvchi `wholesalePrice` ni ko‘radi (katalog, eksport)
va `priceTier: "wholesale"` bilan sota oladi. Aks holda narx javobda yo‘q, `priceTier: "wholesale"`
yuborsa — 403 `PERMISSION_DENIED` ([10.1](#pos)). Sozlama o‘zgargach sotuvchi katalogni qayta so‘rasin
(kesh ≤ 1 daqiqa).

**Xarid summalari — sotuvchida yo‘q.** Bitta qatorli kirim buyurtmasida summa ÷ miqdor = tannarx.
Shuning uchun sotuvchi ta’minotchilar va buyurtmalarni ko‘radi, lekin pul maydonlarisiz. Bu kalitlar
(`total`, `paid`, `debt` …) chek va mijoz qarzida ham bor — ular FAQAT quyidagi javoblardan olinadi:

| Javob | Sotuvchida yo‘q |
|-------|-----------------|
| `GET /purchase-orders`, `/purchase-orders/:id` va buyurtma qaytaradigan amallar | `total`, `receivedValue`, `paid`, `outstanding`; `items[].cost` |
| `GET /purchase-orders/summary` | `outstanding`, `monthTotal`, `receivedTotal` (faqat `openOrders`) |
| `GET /suppliers`, `/suppliers/summary` | `debt` (`suppliersWithDebt` — soni qoladi) |
| `GET /suppliers/:id` | `debt`, `totalPurchased`; `orders[]` da `total`, `paid`, `outstanding`; `payments[]` da `amount` |
| `GET /dashboard` | `payables` (ta’minotchilarga qarz) |
| 422 `PAYMENT_EXCEEDS_DEBT` (`POST /purchase-orders/:id/pay`) | `meta.outstanding` (faqat `meta.requested`) |

Frontend bu ustun/kartalarni `field in obj` tekshiruvi bilan ko‘rsatsin (yo‘q kalitni `0` deb
ko‘rsatmang); alohida rol shartini yozish shart emas.

---

<a id="errors"></a>

## 7. Xatolar

### 7.1 Shakl

Barcha xatolar bitta shaklda (RFC 9457 ga yaqin):

```json
{
  "type": "https://api.crm.uz/errors/stock-insufficient",
  "title": "Omborda yetarli tovar yo‘q",
  "status": 422,
  "code": "STOCK_INSUFFICIENT",
  "detail": "«Sement M400»: kerak 20, mavjud 12",
  "instance": "/api/v1/sales",
  "traceId": "01J9F3K8QW2M4X7Y",
  "errors": [
    {
      "field": "items[0].qty",
      "code": "STOCK_INSUFFICIENT",
      "meta": { "productId": "…", "warehouseId": "…", "available": 12, "requested": 20 }
    }
  ]
}
```

| Maydon | Ma’nosi | Frontendda |
|--------|---------|-----------|
| `code` | Mashina uchun kod (o‘zgarmaydi) | Mantiq faqat shunga qarab; tarjima kaliti |
| `title` | Kodning umumiy o‘zbekcha sarlavhasi | Toast sarlavhasi (yoki o‘z tarjimangiz) |
| `detail` | Aniq holat (raqamlar, nomlar bilan) | Toast/oyna matni — foydalanuvchiga eng foydali qism |
| `errors[]` | Maydon bo‘yicha xatolar: `field` (ixtiyoriy), `code`, `meta` | Forma maydoni ostida / savat qatorida |
| `current` | Faqat `VERSION_CONFLICT` da — serverdagi joriy yozuv | Farqni ko‘rsatish |
| `traceId` | So‘rov identifikatori (`X-Request-Id`) | 500 da «Xato kodi» sifatida |

**`field` yo‘li:** biznes xatolarida — `items[0].qty`, `customerId`, `discount`, `If-Match` kabi
(massiv indeksi bilan). **DTO validatsiyasi (400)** xatolarida `field` YO‘Q — `errors[].meta.message`
da matn (masalan `"email must be an email"` yoki o‘zbekcha xabar), `detail` da hammasi `; ` bilan.
Forma validatsiyasini frontendda ham qiling (maydon cheklovlari — [schemas.md](schemas.md)).

### 7.2 Umumiy qayta ishlash

| Status | Nima qilish kerak |
|--------|-------------------|
| 400 `VALIDATION_FAILED` | Forma xatosi — `detail`/`errors` ni ko‘rsating; qayta urinmang |
| 401 | Auth yo‘lidan tashqari — refresh + bir marta qayta; auth yo‘lida — login xatosi |
| 402 `PLAN_LIMIT_EXCEEDED` | «Tarif chegarasi: N ta» + «Tarifni oshirish» havolasi (`meta.limit`, `meta.used`) |
| 403 `PERMISSION_DENIED` | «Ruxsat yo‘q»; menyu/tugma bu holatga yetkazmasligi kerak |
| 404 `NOT_FOUND` | Yozuv o‘chirilgan yoki boshqa do‘konniki — ro‘yxatga qaytish |
| 409 | Holat to‘qnashuvi — `detail` ni ko‘rsating (`VERSION_CONFLICT` — [4.5](#ifmatch)) |
| 413 | Hajm — `PAYLOAD_TOO_LARGE` yoki `STORAGE_QUOTA_EXCEEDED` |
| 422 | Biznes qoidasi — `detail` + `errors[].meta` (masalan savatda yetmagan tovar qatorini belgilash) |
| 423 | `SHIFT_REQUIRED` → smena ochish oynasi; `TENANT_READ_ONLY` → banner; `AUTH_ACCOUNT_LOCKED` → login |
| 429 | Juda ko‘p so‘rov / SMS chegarasi — keyinroq |
| 500 `INTERNAL` | «Kutilmagan xato, kod: {traceId}» |
| 503 | Server tayyor emas — qayta urinish |
| Tarmoq xatosi | Offline — banner; chek bo‘lsa navbatga ([12.4](#flow-offline)) |

### 7.3 Xato kodlari katalogi

| Kod | Status | Qachon | UI tavsiyasi |
|-----|:-:|--------|-------------|
| `VALIDATION_FAILED` | 400 | So‘rov shakli noto‘g‘ri (maydon, format, kuchsiz parol, `Idempotency-Key` yo‘q, kursor buzuq) | Forma xatolari |
| `AUTH_INVALID_CREDENTIALS` | 401 | Login xato; token yo‘q/yaroqsiz/eskirgan; joriy parol xato | Login: «Email yoki parol xato»; boshqa joyda — refresh |
| `AUTH_INVALID_REFRESH` | 401 | Refresh cookie yo‘q, noma’lum yoki muddati o‘tgan | Login sahifasi |
| `AUTH_TOKEN_REUSE` | 401 | Bekor qilingan refresh cookie ishlatildi (parallel refresh, logout-all / parol almashishidan keyin boshqa qurilmada) — barcha sessiyalar yopildi | «Sessiya tugadi» → login sahifasi |
| `PLAN_LIMIT_EXCEEDED` | 402 | Tarif chegarasi (foydalanuvchi, ombor): `meta.resource`, `plan`, `limit`, `used` | Tarifni oshirish taklifi |
| `PERMISSION_DENIED` | 403 | Rol huquqi yetmaydi; sotuvchi `priceTier: "wholesale"` yubordi, lekin `sellerWholesaleEnabled` o‘chiq | «Ruxsat yo‘q» |
| `NOT_FOUND` | 404 | Yo‘ldagi yozuv yo‘q / o‘chirilgan / boshqa do‘konniki | Ro‘yxatga qaytish |
| `AUTH_TENANT_REQUIRED` | 409 | Email bir necha do‘konda — `errors[].meta.{tenantId, tenantName}` | Do‘kon tanlash |
| `ALREADY_EXISTS` | 409 | Noyob qiymat band (ombor/kategoriya nomi, shtrix-kod, email) — `errors[].field` | Maydon ostida |
| `DUPLICATE_SKU` | 409 | SKU band | «Bunday artikul bor» |
| `VERSION_CONFLICT` | 409 | `If-Match` eskirgan — `current` bilan | [4.5](#ifmatch) |
| `IDEMPOTENCY_MISMATCH` | 409 | Kalit boshqa tana bilan ishlatilgan | Frontend xatosi: yangi amalga yangi kalit |
| `SHIFT_ALREADY_OPEN` / `SHIFT_NOT_OPEN` | 409 | Smena allaqachon ochiq / yopiq | Smena holatini qayta so‘rash |
| `PO_ALREADY_RECEIVED` / `PO_CANCELLED` | 409 | Buyurtmaga tovar kela boshlagan (qisman yoki to‘liq) — tahrir/bekor/o‘chirish/qayta qabul yo‘q; yoki buyurtma bekor qilingan | Holatni yangilash |
| `QUOTE_ALREADY_CONVERTED` | 409 | Taklif allaqachon sotuvga aylantirilgan | Chekka havola (`saleId`) |
| `SALE_ALREADY_CANCELLED` | 409 | Chek allaqachon bekor | Ro‘yxatni yangilash |
| `SALE_NOT_CANCELLABLE` | 409 | Chekda qaytarish (`meta.reason: "returns"`) yoki qarz to‘lovi (`"payments"`) bor | «Avval qaytarishni bekor qiling» / «qarz to‘langan» |
| `EMPLOYEE_HAS_USER` | 409 | Xodimning kirish hisobi bor: xodimni o‘chirish yoki ikkinchi hisob. `POST /users` da `errors[0].meta: { userId, deleted }` | `deleted: true` — «Tiklash» (`POST /users/{userId}/restore`); aks holda avval hisobni o‘chirish |
| `CATEGORY_IN_USE` | 409 | Kategoriyada mahsulot bor | — |
| `CLIENT_HAS_DEBT` | 409 | Mijozda to‘lanmagan nasiya (`meta.debt`) | — |
| `SUPPLIER_HAS_OPEN_ORDERS` | 409 | `ordered`/`partial` buyurtma bor | — |
| `FILE_NOT_UPLOADED` | 409 | `confirm` PUT’dan oldin chaqirildi | PUT’ni tugating |
| `PAYLOAD_TOO_LARGE` | 413 | Tana > 4 MB; fayl hajmi chegaradan katta (`meta.max`) | «Fayl juda katta» |
| `STORAGE_QUOTA_EXCEEDED` | 413 | Tarif saqlash hajmi tugadi (`meta.used/limit`) | Tarifni oshirish / fayl o‘chirish |
| `STOCK_INSUFFICIENT` | 422 | Qoldiq yetmaydi — har qator: `field`, `meta.{productId, warehouseId, available, requested}` (asosiy birlikda) | Savat qatorini belgilash |
| `WAREHOUSE_SAME` | 422 | Ko‘chirishda bir xil ombor | — |
| `WAREHOUSE_DEFAULT_LOCKED` | 422 | Sukut omborni arxivlash | Tugmani yashiring |
| `WAREHOUSE_ARCHIVED` | 422 | Arxiv omborga kirim/ko‘chirish/sotuv | Omborni tanlatish |
| `PRODUCT_ARCHIVED` | 422 | Arxivlangan tovarni sotish | Savatdan olib tashlash |
| `CREDIT_REQUIRES_CUSTOMER` | 422 | Nasiya, lekin mijoz tanlanmagan | Mijoz tanlash |
| `CREDIT_OVERDUE` | 422 | Mijozda muddati o‘tgan qarz (`meta.overdue`) | «Avval qarzni yopsin» |
| `CREDIT_LIMIT_EXCEEDED` | 422 | `meta.limit`, `current`, `extra` | Limitni ko‘rsatish |
| `PAYMENT_EXCEEDS_DEBT` | 422 | To‘lov qarzdan (mijoz yoki ta’minotchi) ko‘p: `meta.outstanding` (sotuvchida ta’minotchi qarzi yo‘q), `requested` | Qolgan qarzni taklif qilish |
| `PAYMENT_EXCEEDS_TOTAL` | 422 | Karta + o‘tkazma chekdan ko‘p (qaytim faqat naqddan) | — |
| `DISCOUNT_LIMIT` | 422 | Chegirma `maxDiscountPct` dan ko‘p yoki qator chegirmasi qator summasidan katta (`meta.max`, `requested`) | Maksimumni ko‘rsatish |
| `TOTAL_MISMATCH` | 422 | Ekrandagi jami ≠ server hisobi (`meta.client`, `server`) — chek YOZILMAGAN | Qayta hisoblab, yangi jamini ko‘rsatish |
| `PO_OVER_RECEIVE` | 422 | Buyurtmadan ko‘p qabul | — |
| `QUOTE_STOCK_SHORT` | 422 | Taklifni aylantirishga qoldiq yetmaydi (`errors[]` — qaysi tovar) | — |
| `SALE_NOT_RETURNABLE` | 422 | Qaytarish hujjatidan qaytarib bo‘lmaydi | — |
| `RETURN_EXCEEDS_SOLD` | 422 | Qaytarish sotilgandan ko‘p (`meta.sold`, `returned`, `requested`) | — |
| `LAST_ADMIN` | 422 | Oxirgi administratorni o‘chirish/bo‘shatish/rolini olish | — |
| `SELF_DELETE` / `SELF_ROLE_CHANGE` | 422 | O‘zini o‘chirish / o‘z rolini o‘zgartirish | Tugmani yashiring |
| `FILE_REJECTED` | 422 | Fayl tarkibi e’lon qilingan MIME/xeshga mos emas — karantinda (`meta.id`) | «Fayl buzilgan yoki turi noto‘g‘ri» |
| `INVALID_STATUS_TRANSITION` | 422 | Yetkazish holati orqaga (`meta.from/to`); do‘kon o‘chirish muhlatida emas | — |
| `REFERENCE_NOT_FOUND` | 422 | Tanadagi havola (kategoriya, mijoz, mahsulot…) yo‘q yoki boshqa do‘konniki — `errors[].field`; xodimi o‘chirilgan hisobni tiklash (`field: employeeId`) | Tanlovni yangilash |
| `SHIFT_REQUIRED` | 423 | Smena ochilmagan (sotuv, qaytarish, naqd amal) | Smena ochish oynasi |
| `TENANT_READ_ONLY` | 423 | Do‘kon `suspended`/`deleting` — yozish yopiq (`meta.status`) | Banner + to‘lov/qaytarish tugmasi |
| `AUTH_ACCOUNT_LOCKED` | 423 | Xodim ishdan bo‘shatilgan (login/refresh) | Login sahifasida xabar |
| `RECIPIENT_UNREACHABLE` | 422 | Mijozga yetkazib bo‘lmaydi (xabar, chek, Telegram havolasi): `meta.reason` — `not_linked` (botga ulanmagan), `blocked` (botni bloklagan), `no_customer` (chekda mijoz yo‘q), `no_channel` (bot/SMS sozlanmagan); guruhda `meta.unreachable` | «Telegram’ga ulash» (shaxsiy QR) |
| `MESSAGE_LIMIT_EXCEEDED` | 429 | Kunlik SMS chegarasi (`meta.limit`, `used`, `requested`) | — |
| `INTERNAL` | 500 | Kutilmagan xato (tafsilot loglarda, `traceId` bo‘yicha) | Xato kodi bilan |

---

<a id="tenant"></a>

## 8. Do‘kon holati, tarif chegaralari va to‘lov

### 8.1 Holatlar

| `status` | Qachon | Nima mumkin |
|----------|--------|-------------|
| `active` | Oddiy holat | Hammasi |
| `suspended` | Pullik tarif muddati (`planExpiresAt`) + 3 kun imtiyoz o‘tdi (har kecha 01:00 da tekshiriladi) | Faqat O‘QISH + to‘lov (`POST /billing/invoices`), zaxira, chiqish, parol |
| `deleting` | Admin do‘konni o‘chirishni so‘radi (`POST /tenants/current/delete`) | Faqat O‘QISH + o‘chirishni bekor qilish, zaxira, chiqish, parol. 30 kundan keyin hamma ma’lumot va fayllar o‘chadi |

Faqat-o‘qish holatida har yozuvchi so‘rov (POST/PATCH/DELETE) → **423 `TENANT_READ_ONLY`**
(`errors[0].meta.status`). Istisnolar: `POST /billing/invoices`, `/tenants/current/delete`,
`/tenants/current/restore`, `/auth/logout-all`, `/auth/change-password` (va GET’lar, jumladan
`/backup/export`). Holat serverda ~30 soniya keshlanadi.

Bunday do‘konga kirish va token yangilash ISHLAYDI (admin kirib to‘laydi, zaxira oladi, o‘chirishni
bekor qiladi). Holat har login/refresh javobida — `user.tenant.status` (barcha rollar uchun); admin
uchun batafsil — `GET /tenants/current` (`planExpiresAt`, `deletionScheduledAt`).

UI: `status` bo‘yicha butun ilova tepasida banner, yozuvchi tugmalar o‘chirilgan:
`suspended` — «Tarif muddati tugagan — to‘lovdan keyin yozish ochiladi» + «To‘lash» (admin);
`deleting` — «Do‘kon {deletionScheduledAt} da o‘chiriladi» + «Bekor qilish» (admin). To‘lov yoki
bekor qilishdan keyin holatni yangilash uchun `POST /auth/refresh` yoki `GET /auth/me` ni qayta
chaqiring (yoki 423 dagi `meta.status` ga tayaning).

### 8.2 Tariflar va chegaralar

Manba — `packages/shared/src/plans.ts`. Narx — oyiga.

| Tarif | Narx | Faol foydalanuvchi | Arxivlanmagan ombor | Saqlash hajmi | Bitta fayl | SMS / kun |
|-------|------|:-:|:-:|:-:|:-:|:-:|
| `free` | 0 | 3 | 2 | 200 MB | 5 MB | 50 |
| `basic` | 99 000 so‘m | 10 | 5 | 2 GB | 10 MB | 500 |
| `pro` | 249 000 so‘m | 50 | 20 | 20 GB | 50 MB | 5 000 |

- Chegara oshsa — **402 `PLAN_LIMIT_EXCEEDED`** (`errors[0].meta`: `resource` — `users`/`warehouses`,
  `plan`, `limit`, `used`). Tekshiriladi: `POST /users`, `PATCH /users/:id` (qayta faollashtirish),
  `POST /users/:id/restore`, `POST /warehouses`, `POST /warehouses/:id/restore`, `POST /migration/import`.
- Saqlash hajmi — **413 `STORAGE_QUOTA_EXCEEDED`**; bitta fayl — 413 `PAYLOAD_TOO_LARGE`
  (fayl turi chegarasi va tarif chegarasining kichigi).
- SMS — **429 `MESSAGE_LIMIT_EXCEEDED`**. Amaldagi kunlik chegara = tarif `smsPerDay` va server
  `SMS_DAILY_LIMIT` (sukut 1000) ning kichigi (Toshkent kuni). `GET /tenants/current` esa tarif qiymatini
  ko‘rsatadi (`pro` — 5000) — UI’da «≈» deb ko‘rsating yoki 429 dagi `meta.limit` ni ishlating.
- «Ishlatilgan / chegara» — `GET /tenants/current` (`limits`, `usage`) va `GET /files/usage`.

### 8.3 To‘lov (obuna)

1. Admin tarif va oy sonini tanlaydi → `POST /billing/invoices { plan, months }` →
   `{ invoice, payme, click }` (summa = oylik narx × oy).
2. Frontend `payme` yoki `click` havolasini yangi oynada ochadi (`null` — provayder sozlanmagan).
3. Foydalanuvchi provayder sahifasida to‘laydi; provayder serverimizga webhook yuboradi
   (`/billing/payme`, `/billing/click/*` — frontend chaqirmaydi).
4. Tasdiqlangach: hisob-faktura `paid`, tarif uzayadi (o‘sha tarif — joriy muddat oxiridan,
   boshqa tarif — hozirdan), `suspended` do‘kon `active` bo‘ladi.
5. Frontend natijani so‘rov bilan biladi: oynaga qaytilganda (focus) yoki har 5–10 soniyada
   `GET /billing/invoices` (`state`) va `GET /tenants/current` — realtime hodisa YO‘Q.

Hisob-faktura holatlari: `created` → `pending` (provayder boshladi) → `paid` / `cancelled`.

### 8.4 Do‘konni o‘chirish

`POST /tenants/current/delete { password }` → `status: deleting`, `deletionScheduledAt` (+30 kun).
Muhlat ichida `POST /tenants/current/restore` qaytaradi (tarif muddati o‘tgan bo‘lsa — `suspended`).
Muhlat tugagach barcha ma’lumot va fayllar butunlay o‘chadi. O‘chirishdan oldin zaxira taklif
qiling (`GET /backup/export`).

---

<a id="realtime"></a>

## 9. Realtime (WebSocket) va keshni yangilash

### 9.1 Ulanish

- socket.io, nomlar fazosi **`/events`**; token — `auth: { token }` (URL’da EMAS).
- Server faqat token’dagi do‘kon xonasiga qo‘shadi — boshqa do‘kon hodisasi kelmaydi. Mijoz
  xona tanlamaydi, serverga hech narsa yubormaydi — faqat tinglaydi.
- Token noto‘g‘ri/yo‘q — ulanish rad etiladi: `connect_error` (`err.message === "unauthorized"`).
- **Token muddati tugaganda server ulanishni uzadi** (`disconnect` sababi `"io server disconnect"`) —
  socket.io bu holatda o‘zi QAYTA ULANMAYDI: refresh qilib, `socket.connect()` chaqiring.
  `auth` ni funksiya qilib bering — har ulanishda joriy token olinadi.
- Qayta ulanganda uzilish paytidagi hodisalar kelmaydi → faol so‘rovlarni (ekrandagi ma’lumotni)
  qayta so‘rang.

```ts
import { io } from 'socket.io-client'

// dev (Vite proksi) va production (bitta domen) — io('/events'); API boshqa domenda bo'lsa — VITE_API_URL
export const socket = io(`${import.meta.env.VITE_API_URL ?? ''}/events`, {
  autoConnect: false,
  auth: (cb) => cb({ token: getAccessToken() }),
})
socket.on('connect_error', async (err) => {
  if (err.message === 'unauthorized' && (await refreshAccessToken())) socket.connect()
})
socket.on('disconnect', async (reason) => {
  if (reason === 'io server disconnect' && (await refreshAccessToken())) socket.connect()
})
socket.io.on('reconnect', () => queryClient.invalidateQueries())   // uzilishdagi hodisalar
// login/refresh’dan keyin: socket.connect(); logout’da: socket.disconnect()
```

### 9.2 Hodisalar

Yukda FAQAT identifikatorlar (tannarx kabi maydonlar rol huquqini chetlab o‘tmasligi uchun). Mijoz
tegishli keshni bekor qiladi va ma’lumotni o‘z huquqi bilan qayta so‘raydi. Hodisa tranzaksiya
COMMIT’dan keyin, do‘konning BARCHA ulanishlariga (amalni qilgan foydalanuvchiga ham) yuboriladi.

| Hodisa | Yuk | Qaysi amaldan | Qaysi ma’lumot eskiradi (qayta so‘rash) |
|--------|-----|---------------|-----------------------------------------|
| `sale.created` | `{ saleId, warehouseId, productIds }` | Sotuv, qaytarish, taklifni aylantirish | cheklar ro‘yxati; `productIds` mahsulotlari/qoldiqlari (POS katalogi!); joriy smena/kassa balansi; qarzlar; mijozlar (bonus, qarz); yetkazishlar; dashboard/hisobotlar |
| `sale.cancelled` | `{ saleId }` | Chekni bekor qilish | yuqoridagining hammasi; mahsulot id’lari YO‘Q — barcha mahsulot/qoldiq so‘rovlari |
| `sale.fiscalized` | `{ saleId }` | OFD fiskal raqam berdi (fonda) | shu chek va uning `receipt` i (QR bilan qayta chop etish mumkin) |
| `stock.changed` | `{ productIds, warehouseId }` | Kirim, chiqim, inventarizatsiya, ko‘chirish (ko‘chirishda — 2 ta, har omborga) | mahsulotlar (`productIds`), `/warehouses/stock`, `/products/summary`, harakatlar jurnali, buyurtma taklifi |
| `shift.opened` / `shift.closed` | `{ shiftId }` | Smena ochish/yopish | `/cash/shifts/current`, smenalar ro‘yxati |
| `debt.paid` | `{ saleId, customerId }` | Qarz to‘lovi | qarzlar, to‘lovlar tarixi, shu chek, mijoz, joriy smena |
| `delivery.status` | `{ deliveryId, status }` | Yetkazish holati | yetkazishlar (ro‘yxat, summary, `/my`, `/route`), shu yetkazish |
| `po.received` | `{ orderId, productIds }` | Kirim buyurtmasini qabul qilish | buyurtmalar (ro‘yxat, summary, karta), mahsulotlar (`productIds`), ta’minotchilar (qarz), harakatlar |

Hodisa kelmaydigan amallar (masalan spravochnik tahriri, xarajat, naqd harakat, SMS, migratsiya)
— o‘z mutatsiyasidan keyin kesh bekor qilinadi; boshqa foydalanuvchilarda ma’lumot sahifa
qayta ochilganda/focus’da yangilanadi.

**Tavsiya:** hodisalarni ~250 ms oynada yig‘ib, har kesh prefiksini bir marta bekor qiling (band
paytda bir nechta kassir — so‘rovlar yomg‘iri bo‘lmasin). Mutatsiya va hodisa uchun bitta
«nima nimani eskirtiradi» xaritasi — [12.2](#flow-query).

---

<a id="rules"></a>

## 10. Biznes qoidalari

<a id="pos"></a>

### 10.1 Kassa (POS) va chek — `POST /sales`

**Oqim:** savat brauzerda (mahsulot, birlik, miqdor, qator chegirmasi, narx) → «To‘lash» → bitta
`POST /sales` (+ `Idempotency-Key`) → javob — yozilgan chek → chop etish.

**Oldingi shartlar:** ochiq smena (aks holda 423 `SHIFT_REQUIRED`); `sales:create`.

**Summa hisobi** (`@crm/shared` → `lineTotal`, `saleTotals`; server AYNAN shunday hisoblaydi):

1. Qator narxi: berilmasa — `priceTier` bo‘yicha (`retail` → `price`, `wholesale` → `wholesalePrice`;
   `wholesaleEnabled=false` bo‘lsa har doim `retail`), tanlangan birlikka o‘giriladi
   (`priceForUnit`). Sotuvchi ulgurji narxda faqat `sellerWholesaleEnabled` bilan sotadi: o‘chiq bo‘lsa
   `wholesalePrice` unga kelmaydi va `priceTier: "wholesale"` — 403 `PERMISSION_DENIED` (ulgurji tugmasini
   yashiring, [6.2](#hidden)). `price` berilsa — savdolashilgan narx: server uni SO‘ZSIZ qabul qiladi (eski
   narx bo‘lsa ham, `TOTAL_MISMATCH` ushlamaydi; cheklanmagan — [14.1](#muammolar)). Shuning uchun `price`
   ni FAQAT kassir narxni qo‘lda o‘zgartirganda yuboring.
2. `qator jami = round(narx × miqdor) − qator chegirmasi` (qator chegirmasi qator summasidan oshmaydi).
3. `subtotal = Σ qator jami`.
4. Umumiy chegirma ≤ `round(subtotal × maxDiscountPct / 100)` — aks holda 422 `DISCOUNT_LIMIT` (`meta.max`).
5. `taxable = subtotal − chegirma`; `tax = taxEnabled ? round(taxable × taxRate / 100) : 0` —
   **QQS narx ustiga qo‘shiladi**.
6. Bonus (`loyaltyEnabled` va mijoz tanlangan bo‘lsa): `bonusUsed = min(so‘ralgan, mijozdagi ball,
   taxable + tax)` — 1 ball = 1 so‘m.
7. Yaxlitlash (`roundTo`: 0 | 500 | 1000) — ENG YAQIN qadamga (yuqoriga ham, pastga ham).
8. `total = yaxlitlangan tovar summasi + yetkazish narxi (delivery.fee)` — yetkazish narxi chek ICHIDA.

**To‘lov (`paid`):** `{ cash, card, transfer }` — hammasi majburiy (0 bo‘lishi mumkin).

- `cash` — mijoz BERGAN naqd; qaytim `change = max(0, cash + card + transfer − total)` —
  faqat naqddan. Javobdagi `paid.cash` ham berilgan naqd.
- `card + transfer > total` — 422 `PAYMENT_EXCEEDS_TOTAL`.
- To‘lanmagan qismi `outstanding = total − (cash + card + transfer)` > 0 → **nasiya**:
  - mijoz shart (422 `CREDIT_REQUIRES_CUSTOMER`);
  - mijozda muddati o‘tgan qarz bo‘lsa — 422 `CREDIT_OVERDUE`;
  - `creditLimit > 0` va `joriy qarz + outstanding > creditLimit` — 422 `CREDIT_LIMIT_EXCEEDED`;
  - chek holati `pending`, `dueDate = sana + mijozning paymentTermDays` (berilmagan bo‘lsa `null`).
- To‘liq to‘langan chek — `completed`.

**Bonus berish:** mijoz tanlangan va `loyaltyEnabled` bo‘lsa `bonusEarned = floor(total × loyaltyRate / 100)`
(nasiya ham ball oladi).

**`total` ni yuboring:** ekranda ko‘rsatilgan jami. Server hisobi boshqacha bo‘lsa (masalan narx
shu orada o‘zgargan) — 422 `TOTAL_MISMATCH` (`meta.client`, `meta.server`), chek YOZILMAYDI.
UI mahsulotlarni qayta yuklab, yangi jamini ko‘rsatsin. `total` yuborilmasa solishtirilmaydi.

**Javobdagi `discount`** = umumiy chegirma + ishlatilgan bonus. **`number`** — `CHEK-1001`.

**Ombor:** `warehouseId` berilmasa — do‘konning joriy ombori (amalda sukut ombor, [10.6](#rules)).
Qoldiq AYNAN shu omborda tekshiriladi va kamayadi (asosiy birlikda: `baseQty`). Yetmasa —
422 `STOCK_INSUFFICIENT`, `errors[]` har yetmagan qator uchun (`field: "items[i].qty"`, `meta.available`).

**Yetkazish:** `delivery: { address, phone, fee?, scheduledDate?, lat?, lng?, note? }` — chek bilan
birga `pending` yetkazish yaratiladi (javobda `delivery: { id, status }`); haydovchi keyin biriktiriladi.

**Sana:** `date` berilmasa — bugun; kelajak — 400; o‘tgan sana mumkin (offline).

**Chop etish** — ikki yo‘l:

- `GET /sales/:id/receipt` → `{ store, sale, customer, seller, fiscal }` — do‘kon nomi, telefon,
  manzil, pastki matn, valyuta; chek qatorlari; fiskal ma’lumot. O‘z shabloningiz bilan chop etish uchun.
- `GET /sales/:id/receipt?format=pdf` → tayyor **80 mm termal chek** (`application/pdf`,
  `Content-Disposition: inline; filename="CHEK-1042.pdf"`) — brauzerdagi chek ko‘rinishida: rekvizitlar,
  qatorlar, jami, to‘lov va qaytim, nasiya qarzi va muddati, fiskal belgi va QR, pastki matn; bekor
  qilingan chekda «BEKOR QILINGAN». Lenta balandligi mazmunga teng. Token bilan olinadi (`<a href>`
  ishlamaydi): `fetch` → `blob` → yangi oyna / chop etish / saqlash ([12.3](#flows)). Qaytarish hujjati
  (`QAYT-…`) ham shu yo‘l bilan.

**Qisqa yo‘llar (F9 to‘lash, F2 qidiruv), skaner, «qoldirilgan savatlar»** — to‘liq frontend
ichida; serverda savat saqlanmaydi. Skaner kodi → `GET /products?q=<kod>&pageSize=5`
(shtrix-kod aniq moslik bilan topiladi).

### 10.2 Qaytarish va bekor qilish

**Qaytarish** — `POST /sales/:id/return { items: [{ saleItemId, qty }], reason }`:

- Faqat asl chek QATORI bo‘yicha: `saleItemId` = `GET /sales/:id` dagi `items[].id`; miqdor —
  o‘sha qator birligida; oldingi qaytarishlar bilan birga sotilgandan oshmaydi (422 `RETURN_EXCEEDS_SOLD`).
- **Qancha qaytarish mumkin:** `GET /sales/:id` → `items[].returnedQty` (bekor qilinmagan
  qaytarishlar yig‘indisi, qator birligida) — maksimum `qty − returnedQty`. Chekning qaytarish
  hujjatlari — `GET /sales?relatedSaleId=<chek id>`.
- Bekor qilingan chekdan — 409 `SALE_ALREADY_CANCELLED`; qaytarish hujjatidan — 422 `SALE_NOT_RETURNABLE`.
- Tovar asl omborga qaytadi (ombor qoldig‘i bilan cheklanmaydi). Ochiq smena shart.
- Pul: QQS asl chek foizi bo‘yicha, chegirma va bonus ulushi bilan hisoblanadi. **Nasiya chekda
  avval QARZ yopiladi** (qaytarish hujjatida `debtPaid`), qolgani kassadan naqd (`paid.cash`).
  Ishlatilgan bonus ulushi ballga qaytadi, berilgan bonus ulushi olib qo‘yiladi.
- Javob — yangi qaytarish hujjati (`type: "return"`, `number: "QAYT-…"`, `relatedSaleId` — asl chek).
  **Summani brauzerda hisoblamang** — javobdagi `total`, `paid.cash`, `debtPaid` ni ko‘rsating.
- Hodisa: `sale.created` (qaytarish hujjati bilan).

**Bekor qilish** — `POST /sales/:id/cancel` (`sales:delete` — admin, manager):

- Tovar AYNAN sotilgan omborga qaytadi, naqd kassadan qaytariladi (naqd bo‘lsa ochiq smena shart),
  bonus: ishlatilgani qaytadi, berilgani olinadi; faol yetkazish (`pending`/`on_way`) bekor bo‘ladi.
- Chekda qaytarish bo‘lsa — avval qaytarishni bekor qiling; qarz to‘lovi bo‘lsa — bekor qilib
  bo‘lmaydi (409 `SALE_NOT_CANCELLABLE`, `meta.reason`).
- Qaytarish hujjatini bekor qilish — uning ta’sirini teskari qiladi (tovar yana chiqadi, qarz qayta ochiladi).
- Javob — yangilangan chek (`status: "cancelled"`). Hodisa: `sale.cancelled`.
- Chekni O‘CHIRISH yo‘q.

### 10.3 Smena va kassa

- **Bitta do‘konda bir vaqtda bitta ochiq smena** (bitta kassa yashigi) — kassirlar bo‘yicha emas.
  Smenani kim ochgan bo‘lsa ham, hamma kassir shu smenada sotadi.
- Ochish — `POST /cash/shifts/open { openingBalance }` (yashikdagi SANALGAN naqd; kassa balansi
  shunga tenglashadi). Ochiq bo‘lsa — 409 `SHIFT_ALREADY_OPEN`.
- Joriy holat — `GET /cash/shifts/current` → `{ shift | null, cashBalance }`.
- Yopish — `POST /cash/shifts/close { countedBalance, note?, denominations? }` →
  `expectedBalance`, `countedBalance`, `difference` saqlanadi. `denominations` — `{"100000": 3, "50000": 2}`
  (kupyura → soni, yig‘indisi `countedBalance` ga teng bo‘lishi shart).
- Hisobot — `GET /cash/shifts/:id/report`: ochiq smena — X, yopilgan — Z (sotuv/qaytarish to‘lov
  turlari bo‘yicha, naqd kirim/chiqim, xarajat, qarz va ta’minotchi to‘lovlari, kutilgan balans).
- Kassa balansi faqat ochiq smenada o‘zgaradi.

**Ochiq smena talab qiladigan amallar** (aks holda 423 `SHIFT_REQUIRED`):

| Amal | Qachon |
|------|--------|
| `POST /sales`, `POST /sales/:id/return`, `POST /quotes/:id/convert` | Har doim (naqdsiz bo‘lsa ham) |
| `POST /sales/:id/cancel` | Naqd qaytarilsa |
| `POST /cash/movements` | Har doim |
| `POST/PATCH/DELETE /expenses`, `.../restore` | Kassa ta’siri bo‘lsa: naqd xarajat yaratish/o‘chirish/tiklash, tahrirda — summa yoki usul o‘zgarsa |
| `POST /debts/payments` | `method: cash` |
| `POST /purchase-orders/:id/pay` | `method: cash` |

Takrorlanuvchi naqd xarajat (cron) smena yopiq bo‘lsa kassaga ta’sirsiz yoziladi.

### 10.4 Nasiya va qarzlar

- Chek qarzi — `outstanding = total − to‘langan − keyin to‘langan (debtPaid)`, bazada hisoblanadi,
  manfiy emas. Mijoz qarzi — uning `pending` cheklari yig‘indisi.
- `GET /debts?view=customers` — mijoz bo‘yicha (sukut), `view=receipts` — chek bo‘yicha.
  `aging`: `d30` (0–30 kun), `d60` (31–60), `d60plus` (60+) — chek sanasidan (mijoz ko‘rinishida —
  eng eski qarzli chek sanasidan). `overdue=true` — `dueDate` o‘tganlar. `summary` — jami qarz,
  muddati o‘tgan, qarzdorlar soni, eng eski sana (sahifa kartalari).
- To‘lov — `POST /debts/payments { saleId, amount, method: cash|bank }` — ANIQ chek bo‘yicha;
  qarzdan oshmaydi (422 `PAYMENT_EXCEEDS_DEBT`); to‘liq yopilsa chek `completed`; `cash` — kassaga.
  Mijozning umumiy qarzini to‘lash kerak bo‘lsa — cheklarni eng eskisidan boshlab ketma-ket
  (har biriga alohida `Idempotency-Key`) yoki foydalanuvchiga chek tanlatish.
- Javob — `{ payment, sale: { id, number, status, debtPaid, outstanding } }` (to‘lovdan keyingi
  holat). Hodisa: `debt.paid`.

### <a id="units"></a>10.5 Mahsulot, birlik, narx

- **Asosiy birlik** (`unit`: `dona | kg | metr | m2 | m3 | litr | qop | rulon`) — qoldiq (`stock`),
  tannarx (`cost`), `minStock`, ombor amallari, kirim buyurtmasi miqdori va narxi HAR DOIM shu birlikda.
- **Qo‘shimcha birlik** (ixtiyoriy): `altUnit` + `altFactor` birga. Ma’nosi:
  **1 `altUnit` = `altFactor` ta asosiy birlik.** Masalan asosiy `kg`, qo‘shimcha `qop`, `altFactor: 50`
  → 1 qop = 50 kg; qop narxi = `round(kg narxi × 50)`.
- Sotuv/taklif qatorida `unit` — asosiy yoki qo‘shimcha birlik (boshqasi — 400). Server `baseQty`
  (asosiy birlikdagi miqdor) ni hisoblaydi va qoldiqni shundan kamaytiradi. Funksiyalar —
  `unitOptions`, `toBaseQty`, `fromBaseQty`, `priceForUnit` (`@crm/shared` dan — paketda sub-path yo‘q).
- Narxlar: `price` (chakana), `wholesalePrice` (ulgurji; sotuvchiga — `sellerWholesaleEnabled` bilan),
  `cost` (o‘rtacha tannarx) — butun so‘m, asosiy birlik uchun. `cost` qo‘lda kiritiladi, keyin har
  kirimda (`unitCost` bilan) va kirim buyurtmasi qabulida **o‘rtacha tortilgan** usulda qayta hisoblanadi.
- `stock` — barcha omborlar yig‘indisi; `stocks` — `{ [warehouseId]: qty }`; `warehouseStock` —
  so‘rovda `warehouseId` berilganda shu ombor qoldig‘i. Qoldiq mahsulot formasida o‘zgarmaydi.
- `sku` — do‘kon ichida noyob (409 `DUPLICATE_SKU`); `barcode` — noyob (409 `ALREADY_EXISTS`).
- `archived: true` — sotilmaydi (422 `PRODUCT_ARCHIVED`), ro‘yxatda sukut bo‘yicha ko‘rinmaydi
  (`archived=true` filtri bilan ko‘rinadi).
- Kam qolgan: `stock ≤ minStock` → `GET /products?lowStock=true`, dashboard’dagi `lowStock`.
- Rasm — `imageFileId` ([10.16](#files)); ko‘rsatish — `GET /files/urls`.
- Import — `POST /products/import { rows, mode }` (≤ 5000; qoldiqsiz; xato qatorlar `errors` da,
  qolganlari saqlanadi). CSV’ni brauzerda o‘qib, ustunlarni `ProductImportRowDto` ga moslang
  (kategoriya — nomi bilan).
- Ommaviy narx — `POST /products/bulk-price { ids, mode: percent|fixed|set, value, target: price|wholesalePrice }`.

### 10.6 Omborlar va ombor amallari

- Ro‘yxatdan o‘tishda «Asosiy ombor» (`isDefault: true`) yaratiladi — arxivlanmaydi.
- **Ombor tanlash — frontendda.** Tanlangan omborni qurilmada (foydalanuvchi bo‘yicha) saqlab,
  `warehouseId` ni HAR DOIM aniq yuboring — uni barcha amallar qabul qiladi: sotuv, ombor amallari,
  kirim buyurtmasi, taklifni sotuvga aylantirish.
- **Joriy ombor** — `warehouseId` berilmaganda ishlatiladigan zaxira qiymat: butun do‘kon uchun BITTA
  (ro‘yxatdan o‘tishda sukut ombor, faqat u arxivlanganda o‘zgaradi). Uni API orqali o‘zgartirish
  ataylab yo‘q: bir kassir almashtirsa, boshqa kassirlarniki ham almashardi.
- Arxiv ombor: kirim, ko‘chirib kiritish, sotuv yo‘q (422 `WAREHOUSE_ARCHIVED`); undan chiqim/ko‘chirib
  chiqarish mumkin. Arxivlashda tovar qolgan bo‘lsa — javobda `stockWarning.productCount`.
- Qoldiq manfiy bo‘lmaydi: chiqim, ko‘chirish, sotuv — 422 `STOCK_INSUFFICIENT`.
- Amallar (hammasi idempotent, miqdor asosiy birlikda; `product` — yangilangan qoldiq `{ id, name, stock, cost?, stocks }`):

| Amal | Endpoint | Izoh |
|------|----------|------|
| Kirim | `POST /stock/intake { productId, warehouseId?, qty, unitCost?, supplierId?, note? }` | `unitCost` — o‘rtacha tannarxni yangilaydi. Javob `{ movementId, product }` |
| Chiqim | `POST /stock/writeoff { productId, warehouseId?, qty, reason }` | Sabab majburiy. Javob `{ movementId, product }` |
| Inventarizatsiya | `POST /stock/adjust { items: [{ productId, countedQty }], warehouseId?, note? }` | Farq serverda; takror mahsulot — 400. Javob `{ adjusted: [{ productId, movementId, delta, balanceAfter }], unchanged }` |
| Ko‘chirish | `POST /stock/transfer { productId, fromWarehouseId, toWarehouseId, qty, note? }` | `transfer_out` + `transfer_in`. Javob `{ outMovementId, inMovementId, product }` |

- Harakat turlari (`GET /stock/movements`): `intake`, `writeoff`, `adjustment`, `sale`, `return`,
  `transfer_out`, `transfer_in`.
- Buyurtma taklifi: `max(minStock × 2 − stock, minStock)` — ta’minotchi bo‘yicha guruhlangan.

### 10.7 Kirim buyurtmalari va ta’minotchilar

- Yaratish: `POST /purchase-orders { supplierId, items: [{ productId, qty, cost }], warehouseId?, date?, dueDate?, note? }`
  — `qty` va `cost` asosiy birlikda; `dueDate` berilmasa — sana + ta’minotchining `paymentTermDays`.
  Raqam `BUY-1001`.
- Holatlar: `ordered` → (qisman qabul) `partial` → `received`; `cancelled` — faqat `ordered` dan.
- Tahrir va bekor qilish — faqat `ordered` (hech narsa kelmagan). O‘chirish — `ordered` yoki `cancelled`
  va to‘lanmagan. Tovar kela boshlagan buyurtmada — 409 `PO_ALREADY_RECEIVED`.
- Qabul: `POST /purchase-orders/:id/receive { items?: [{ poItemId, qty }] }` — `items` yo‘q bo‘lsa
  qolgani hammasi; buyurtmadan ko‘p — 422 `PO_OVER_RECEIVE`. Har qator — kirim harakati + o‘rtacha tannarx.
  Ombor: buyurtmadagi `warehouseId` yoki joriy ombor. Hodisa: `po.received`.
- To‘lov: `POST /purchase-orders/:id/pay { amount, method: cash|bank }` — faqat KELGAN tovar
  qarzigacha (`outstanding = receivedValue − paid`), oldindan to‘lov yo‘q (422 `PAYMENT_EXCEEDS_DEBT`).
- Ta’minotchiga qarzimiz — faqat kelgan tovar bo‘yicha: `GET /suppliers` (qatorda), `/suppliers/summary`,
  `/suppliers/:id` (buyurtmalar, to‘lovlar).
- Sotuvchi buyurtma va ta’minotchilarni summalarsiz oladi (qarz, buyurtma summasi, to‘lov miqdori yo‘q —
  [6.2](#hidden)); pul ustunlarini `field in obj` bilan yashiring.

### 10.8 Takliflar (smeta)

- `POST /quotes { customerId?, sellerId?, priceTier?, items, discount?, validUntil?, note? }` —
  summalar sotuv qoidasida (QQS, chegirma chegarasi; bonus va yetkazishsiz). `priceTier` berilmasa:
  `wholesaleEnabled` bo‘lsa — `retail` bo‘lmagan har qanday guruh (`wholesale`, `vip`) → ulgurji, aks holda
  chakana; `wholesaleEnabled=false` da har doim chakana (aniq berilgan `priceTier` ham — sotuvdagidek).
  Sotuvchi (`sellerWholesaleEnabled` o‘chiq): so‘ralgan `wholesale` — 403, mijoz guruhidan kelgani — chakana.
  Qoldiq band QILINMAYDI. Raqam `TKLF-1001`.
- Holatlar (`PATCH`): `draft` → `sent` → `accepted` / `rejected`; `converted` — faqat aylantirish bilan.
  Server o‘tish tartibini TEKSHIRMAYDI (istalgan holatga `PATCH` mumkin) — tartib frontend qoidasi.
  `expired: true` — `validUntil` o‘tgan ochiq taklif (ro‘yxatda `expired=true` filtri).
- Aylantirish: `POST /quotes/:id/convert { method: cash|card|transfer|debt, warehouseId? }` — to‘liq to‘lov
  shu usulda yoki nasiya (`debt` — mijoz shart, nasiya qoidalari). Qoldiq AYNAN tanlangan omborda
  (`warehouseId` — kassada tanlangani; berilmasa — joriy ombor) tekshiriladi va kamayadi (422
  `QUOTE_STOCK_SHORT`, arxiv ombor — 422 `WAREHOUSE_ARCHIVED`), bir marta (409 `QUOTE_ALREADY_CONVERTED`),
  ochiq smena shart. Aylantirilmagan HAR QANDAY
  taklif (`draft`, `rejected`, muddati o‘tgan ham) aylantiriladi — «Sotuvga aylantirish» tugmasini faqat
  `accepted` da ko‘rsating. Javob — yaratilgan chek (`SaleDto`); taklifda `saleId`.

### 10.9 Yetkazib berish

- Yaratish: POS’da chek bilan (`POST /sales` → `delivery`) yoki alohida `POST /deliveries`
  (`saleId` bilan — narx chekdan; cheksiz — `fee` alohida xizmat).
- Holat — `POST /deliveries/:id/status { status }`: `pending` → `on_way` → `delivered`; faol holatdan
  `cancelled`. Orqaga — 422 `INVALID_STATUS_TRANSITION`. Chek bekor qilinsa faol yetkazish avtomatik bekor.
- Haydovchi — xodim (`driverId`). Alohida haydovchi roli yo‘q: haydovchi odatda `sotuvchi` yoki
  `omborchi` rolidagi foydalanuvchi; `GET /deliveries/my` — unga biriktirilgan faol yetkazishlar.
  Holatni o‘zgartirish: `deliveries:edit` bor rollar (admin, manager, **sotuvchi**) — HAR QANDAY
  yetkazishni; `edit` siz omborchi — faqat o‘ziga biriktirilganini (aks holda 403).
- `GET /deliveries/route?date&driverId` — marshrut varaqasi (olinadigan pul bilan).
- `overdue: true` — `scheduledDate` o‘tgan faol yetkazish. Tahrir — faqat faol holatda.

### 10.10 Xarajatlar

- Kategoriyalar: `rent`, `utilities`, `salary`, `transport`, `tax`, `other`; usul: `cash` (kassadan) | `bank`.
- Naqd xarajatni yaratish/o‘chirish/tiklash kassaga ta’sir qiladi (ochiq smena shart); tahrirda eski
  ta’sir qaytarilib, yangisi joriy smenaga yoziladi — smena faqat summa yoki usul o‘zgarsa kerak.
- Shablonlar: `monthly` (`dayOfPeriod` 1–28) yoki `weekly` (1–7, dushanba = 1); har kuni 00:05 da
  (Toshkent) muddati kelganlari xarajatga aylanadi — davrga bir marta; `POST /expense-templates/run-due` — qo‘lda.

### 10.11 Mijozlar va bonus

- `type`: `individual | company`; `status`: `lead | active | inactive`; `group`: `retail | wholesale | vip`
  (taklifda sukut narx darajasi); `creditLimit` (`null`/0 — cheklanmagan); `paymentTermDays` (nasiya muddati).
- Telefon saqlashda normallashtiriladi (raqamlar + boshidagi `+`); aniq qidiruv — `?phone=`.
- `bonusPoints` faqat o‘qiladi — sotuv/qaytarish/bekor qilishda o‘zgaradi.
- `telegramStatus` (faqat o‘qiladi) — Telegram bot: `linked` (xabar va chek Telegram’da), `none`
  (ulanmagan), `blocked` (mijoz botni bloklagan). Filtr: `GET /clients?telegramStatus=none` —
  ulanmaganlar. Ulash — `POST /clients/:id/telegram-link` ([10.13](#telegram)).
- `GET /clients/:id/stats` — jami xarid, qarz, muddati o‘tgan qarz, oxirgi xarid (POS ogohlantirishi).

### 10.12 Xodimlar va foydalanuvchilar

- **Xodim** (`/employees`) — shaxs: ism, lavozim, telefon, maosh (`salary` — faqat admin/manager
  ko‘radi), holat `active | on_leave | fired`, ishga kirgan sana. `fired` — tizimga kira olmaydi.
- **Foydalanuvchi** (`/users`) — kirish hisobi: email, parol, rol, `isActive`; mavjud xodimga 1:1
  bog‘lanadi. Ism va lavozim xodimdan keladi (foydalanuvchida takrorlanmaydi). Hisob ochish: avval xodim,
  keyin `POST /users { employeeId, email, password, role }`. Hisobsiz xodim — `EmployeeDto.userId === null`
  (hisobi O‘CHIRILGAN xodim ham `null` ko‘rinadi — unga yangi hisob ochilmaydi: 409 `EMPLOYEE_HAS_USER`,
  `errors[0].meta: { userId, deleted: true }` → yangisi o‘rniga «Tiklash» taklif qiling).
- **O‘chirilgan hisoblar:** `GET /users?deleted=true` — faqat o‘chirilganlar (`deletedAt` bilan; qidiruv,
  saralash, sahifalash odatdagidek) → «Tiklash» — `POST /users/:id/restore`. Parol, rol va email
  o‘zgarmaydi, eski sessiyalar qaytmaydi (qayta kiradi); faol hisob tarif joyini oladi (402). Xodimi ham
  o‘chirilgan bo‘lsa — 422 `REFERENCE_NOT_FOUND` (`field: employeeId`): avval `POST /employees/:id/restore`.
- Email do‘kon ichida noyob; bir email bir necha do‘konda bo‘lishi mumkin (login’da do‘kon tanlanadi).
- Himoya: oxirgi admin (422 `LAST_ADMIN`), o‘zini o‘chirish (`SELF_DELETE`), o‘z rolini o‘zgartirish
  (`SELF_ROLE_CHANGE`); tarif chegarasi (402).

### 10.13 Xabarlar (SMS va Telegram)

- Oqim: auditoriya tanlash → `POST /messages/preview` (nechta qabul qiluvchi) → matn →
  `POST /messages` (fonda yuboriladi) → `GET /messages` (holat statistikasi).
- `target`: `customer` (+ `customerId`), `group` (+ `group`), `debtors` (qarzi borlar), `all`.
- Matnda o‘zgaruvchilar: `{name}`, `{phone}`, `{debt}`, `{bonus}`, `{store}` — har qabul qiluvchiga
  serverda almashtiriladi. Matn ≤ 600 belgi. Kunlik chegara — [8.2](#tenant) (faqat SMS sanaladi).
- Kanal har mijoz uchun SERVERDA tanlanadi (frontend tanlamaydi): **botga ulangan → Telegram**; aks holda
  **SMS sozlangan bo‘lsa → SMS** (telefoni bo‘lsa); aks holda **yetib bormaydi**:
  - bitta mijoz (`target=customer`) — 422 `RECIPIENT_UNREACHABLE`, `detail`: «Mijoz botga ulanmagan»
    (`meta.reason: not_linked`) yoki «Mijoz botni bloklagan» (`blocked`); bot ham, SMS ham sozlanmagan —
    `no_channel`. Oynada «Telegram’ga ulash» (shaxsiy QR) taklif qiling;
  - guruh / qarzdorlar / hammasi — yetib boradiganlarga yuboriladi, qolganlari faqat SANALADI
    (`unreachable`); hech kimga yetib bo‘lmasa — 422 (`meta.unreachable`). Yuborishdan OLDIN
    `preview` bo‘yicha ogohlantiring (pastda).

<a id="telegram"></a>

#### Telegram bot

Bitta bot — barcha do‘konlar uchun. Bot Start bosgan odamning telefon raqamini **bilmaydi** va odamga
raqami bo‘yicha yoza **olmaydi** (Telegram qoidasi) — shuning uchun har mijozga **shaxsiy havola**:
mijoz uni ochib **Start** bosadi va ulanadi. Raqam yuborish yoki biror narsa yozish shart emas.

| Qadam | Kim | Nima bo‘ladi |
|-------|-----|--------------|
| 1 | Xodim | Mijoz kartasida «Telegram’ga ulash» → `POST /clients/:id/telegram-link` → `link` dan QR (ekranda) |
| 2 | Mijoz | QR’ni telefon kamerasi bilan skanerlaydi → Telegram ochiladi → **Start** → ✅ «Tayyor, Ali!» |
| 3 | Xodim | Odatdagidek `POST /messages`, chekda — «Telegram’ga yuborish» (`POST /sales/:id/receipt/telegram`) |

Frontendda:

- **Bot holati:** `GET /telegram` → `{ enabled, botUsername }`. `enabled: false` — serverda bot sozlanmagan:
  Telegram tugmalarini ko‘rsatmang.
- **Ulash (QR):** `POST /clients/:id/telegram-link` → `{ link, expiresAt }` — QR’ni brauzerda chizing
  (masalan `qrcode` kutubxonasi). Havola **bir martalik**, 7 kun amal qiladi; har chaqiruv yangisini
  beradi (eskisi bekor) — QR oynasi ochilganda so‘rang, keshlamang. Havolani mijozga boshqa yo‘l bilan
  (masalan boshqa messenjer) ham yuborish mumkin. Huquq: `customers:edit`.
- **Mijoz holati:** `ClientDto.telegramStatus` — `linked` (Telegram belgisi), `none`, `blocked`
  («botni bloklagan» — mijozga ayting). Ulanmaganlar ro‘yxati: `GET /clients?telegramStatus=none`.
- **Xabar oynasi:** `POST /messages/preview` → `{ recipients, telegram, unreachable, label }`:
  «42 ta mijozga boradi (12 tasi Telegram’da, 30 tasi SMS). 5 tasiga yetib bormaydi — botga ulanmagan»
  → tasdiqlash. `unreachable > 0` bo‘lsa «Ulanmaganlar» havolasi → `GET /clients?telegramStatus=none`.
- **Jurnal:** `MessageDto`: `recipients` (yuborilganlar), `telegram` (shundan Telegram), `unreachable`
  (yetib bormaganlar); holat (`stats`) ikkala kanal uchun umumiy.
- **Chek:** chek ko‘rinishi/POS’da «Telegram’ga yuborish» → `POST /sales/:id/receipt/telegram` (204).
  Mijozga PDF chek (chop etiladigan bilan bir xil, fiskal QR bilan) va izoh boradi. 422
  `RECIPIENT_UNREACHABLE` — `meta.reason`: `no_customer` (chekda mijoz yo‘q), `not_linked`, `blocked`,
  `no_channel`; 503 — Telegram javob bermadi (qayta urinish). Huquq: `sales:view`.

Mijoz Telegram’da ko‘radigan xabar (HTML; o‘zgaruvchi qiymatlari qalin, aloqa — sozlamadagi
chek telefoni va manzili, bo‘sh bo‘lsa chiqmaydi):

```
🏪 Qurilish Mollari

Hurmatli Ali, qarzingiz 1 250 000 so‘m. Iltimos, to‘lovni kechiktirmang.

📞 +998 71 200-00-00
📍 Chilonzor 5
```

Chek (PDF fayl, izohi):

```
🧾 Chek CHEK-1042 · 29.09.2026
🏪 Qurilish Mollari

💰 Jami: 188 600 so'm
⏳ Qarz: 50 000 so'm · muddat 20.10.2026
🎁 Bonus: +1 886
```

Qoidalar:

- Mijoz botni o‘zi to‘xtata olmaydi (`/stop` yo‘q). Botni **bloklash** — Telegram’ning o‘z imkoniyati,
  uni taqiqlab bo‘lmaydi: mijoz `blocked` bo‘ladi, xabarlar unga SMS bilan (sozlangan bo‘lsa) yoki
  yetib bormaydi; botni qayta ochsa — avtomatik `linked`.
- Bir Telegram hisobi bir necha mijoz yozuviga (va do‘konga) ulanishi mumkin — har biri o‘z havolasi bilan.
- Faol bo‘lmagan (to‘xtatilgan, o‘chirilayotgan) do‘kon havolasi ishlamaydi.

### 10.14 Hisobotlar

- Barcha raqamlar SERVERDA; brauzerda `reduce` bilan yig‘ilmaydi. Tushum qoidasi (I4): bekor
  qilinmagan sotuvlar (nasiya ham), qaytarishlar ayiriladi — dashboard jamlari va P&L `current`/`previous`
  da bir xil. P&L `trend`, top ro‘yxatlar va `/analytics` — YALPI sotuv (qaytarishsiz); `trend` faqat
  sotuv bo‘lgan kunlarni o‘z ichiga oladi (bo‘sh kunlarni grafikda 0 bilan to‘ldiring).
- `GET /dashboard?days=7|30|90` — bugun/kecha, debitor (`receivables`, `debtors`), kreditor
  (`payables` — sotuvchida yo‘q), kam qolganlar, trend, top mahsulot/qarzdor, oxirgi cheklar.
- `GET /reports/pnl?from&to&limit` — davr ≤ ~3 yil («butun davr» = so‘nggi 3 yil); oldingi teng davr
  bilan solishtirish (`change`), `granularity` (kun/oy), to‘lov turlari, xarajat kategoriyalari, top
  mahsulotlar, sotuvchilar (`sellers`) va sotilmayotgan tovar (`deadStock`) — uchalasining uzunligi `limit`
  bilan (sukut 20, ≤ 100; tushum bo‘yicha kamayish tartibida).
- `GET /analytics?from&to` — ABC (80/95 %) — sotilgan BARCHA mahsulot (jadvalni brauzerda sahifalang),
  kategoriya va to‘lov taqsimoti, trend. `limit` parametri yo‘q (yuborilsa 400).
- Foyda/tannarx maydonlari rolga qarab yo‘q ([6.2](#roles)). Tugagan davrlar keshlanadi, bugun — jonli.

### 10.15 Audit jurnali

`GET /audit` (admin) — kursorli. Filtrlar: `userId`, `group` (amal prefiksi: `sale` → `sale.create`,
`sale.return`, `sale.cancel`), `entityId` (bitta yozuv tarixi), sana, `q`. `diff` — o‘zgarish (maxfiy
maydonlarsiz), `user: null` — tizim (fon ishi). Amallar: `sale.create|return|cancel`,
`shift.open|close`, `debt.pay`, `stock.intake|writeoff|adjust|transfer`, `po.create|update|delete|restore|cancel|pay`,
`quote.create|update|delete|restore|convert`, `delivery.create|update|delete|restore|status`,
`expense.create|update|delete|restore|recurring`, `expense-template.*`, `product.create|update|delete|restore|import|bulk_price`,
`category.*`, `client.*`, `supplier.*`, `employee.*`, `user.*`, `warehouse.create|update|archive|restore`,
`settings.update`, `file.upload|delete|quarantine`, `export.create|download`, `backup.export`,
`message.send`, `migration.import`, `billing.invoice|paid`, `tenant.deletionRequested|deletionCancelled`,
`po.receive|receivePartial`, `cash.in|out`, `fiscal.rejected|overdue` (tizim). Alohida nom berilmagan
yozuvchi so‘rovlar `POST /yo‘l` ko‘rinishidagi action bilan yoziladi.

<a id="files"></a>

### 10.16 Fayllar (rasm, hujjat)

Fayl API serveri orqali O‘TMAYDI: server ruxsat beradi → brauzer to‘g‘ridan-to‘g‘ri S3/MinIO’ga
yuklaydi → server tekshiradi.

| `kind` | MIME | Maks. (tur) | Huquq (resurs) |
|--------|------|:-:|------|
| `product_image` | `image/jpeg`, `image/png`, `image/webp` | 5 MB | `products` |
| `avatar` | `image/jpeg`, `image/png`, `image/webp` | 5 MB | `employees` |
| `document` | `application/pdf` | 10 MB | `sales` |
| `import` | `text/csv` | 10 MB | `products` |
| `export`, `tenant_backup` | — (server o‘zi yaratadi) | | |

Tarif `fileBytes` kichikroq bo‘lsa — o‘sha amal qiladi. SVG/HTML ATAYLAB taqiqlangan.

**Oqim** (namuna kod — [12.5](#flow-upload)):

1. (Tavsiya) rasmni brauzerda kichraytiring (uzun tomoni ≤ 1600 px, WebP/JPEG).
2. SHA-256 (hex) — `crypto.subtle.digest('SHA-256', bytes)`.
3. `POST /files/presign { kind, mime, size, sha256, originalName? }`:
   - `reused: true` → shu tarkib bor, `file.id` ni darhol ishlating (4–5 qadam kerak emas);
   - aks holda `upload: { url, method: "PUT", headers, expiresAt }` (10 daqiqa).
4. `PUT upload.url` — tana: faylning o‘zi, sarlavhalar AYNAN `upload.headers` (`Content-Type`),
   `Authorization` YUBORILMAYDI (havola imzolangan).
5. `POST /files/:id/confirm` → `status: "ready"`. Mos kelmasa — 422 `FILE_REJECTED` (fayl karantinda);
   PUT bo‘lmagan — 409 `FILE_NOT_UPLOADED`.
6. Bog‘lash: `PATCH /products/:id { imageFileId }` (yoki yaratishda). `null` — rasmni olib tashlash.

**Ko‘rsatish:** `<img src>` `Authorization` yubora olmaydi → `GET /files/urls?ids=a,b,c&variant=128`
(≤ 100 id, BITTA so‘rov) → `{ urls: { id: signedUrl }, expiresAt }`; havolalar 10 daqiqa amal qiladi
(keshni ~9 daqiqa). Variantlar: `128` (ro‘yxat), `512` (karta), `orig`; variant hali tayyor bo‘lmasa —
asl fayl. Yo‘q/tayyor emas/huquq yetmagan fayl javobda bo‘lmaydi (bitta buzuq rasm sahifani yiqitmaydi).
`GET /files/:id/raw` — 302 (token talab qiladi, `<img>` uchun emas).

Takroriy tarkib (bir xil `sha256` + `kind`) qayta saqlanmaydi. O‘chirilgan fayl 30 kundan keyin tozalanadi.
S3 bucket CORS’i frontend domeniga ruxsat berishi kerak (lokal MinIO — ochiq).

### 10.17 Eksport

`GET /exports/:resource?format=csv|json&dateFrom&dateTo`, `resource`: `products`, `clients`, `sales`,
`stock-movements`, `expenses`, `audit` (sana — faqat sanali ro‘yxatlarda).

- ≤ 5000 qator → **200**, fayl javobda (CSV — UTF-8 BOM bilan, Excel to‘g‘ri ochadi). Fayl nomi —
  `Content-Disposition` (`sotuvlar-2026-09-24.csv`). `fetch` → `blob` → yuklab olish.
- \> 5000 qator → **202** `ExportJobDto`: `GET /exports/jobs/:id` ni `status: "ready"` bo‘lguncha so‘rang
  (2–3 s oraliq). `ready` bo‘lganda javobda **`url`** (imzolangan havola, `attachment`, `expiresAt` gacha
  ~10 daqiqa) — `window.location.href = job.url` bilan oching: token ham, CORS ham kerak emas. `failed` —
  `error` da sabab. Faqat so‘rovchi ko‘radi; fayl 7 kun saqlanadi.
- Muqobil: `GET /exports/jobs/:id/download` — 302 bilan o‘sha havolaga. `Authorization` talab qiladi
  (`<a href>` bilan ochib bo‘lmaydi); `fetch` bilan faqat API frontend bilan BIR manbada bo‘lganda
  ishlaydi — API alohida domenda bo‘lsa brauzer yo‘naltirilgan so‘rovga `Origin: null` qo‘yadi va S3/R2
  CORS uni rad etadi. Shuning uchun `url` afzal.
- Ustunlar rolga qarab (tannarx sotuvchiga chiqmaydi); qiymatlar xom (so‘m — butun, miqdor — son).
- Kichik jurnallar (smenalar, qarzlar, takliflar va h.k.) uchun server eksporti yo‘q — sahifalarni
  ketma-ket olib (`pageSize=200`), brauzerda `csvLine`/`CSV_BOM` (`@crm/shared`) bilan yig‘ish mumkin.

### 10.18 Zaxira

`GET /backup/export` (admin) → `{ fileId, filename, sizeBytes, url, expiresAt }` — butun do‘kon
bitta izchil surat, gzip JSON (brauzerdagi eski «Sozlamalar → Zaxira» shakli: `CrmSnapshot` +
`settings` + parolsiz `users`). `url` 1 soat amal qiladi. To‘xtatilgan/o‘chirilayotgan do‘konda ham
ishlaydi.

Fayl tarkibi: `{ version, exportedAt, tenant, products, clients, sales, …, categories, users, audit,
cashBalance, activeShiftId, settings }`. Kirmaydi: rasmlar (S3’da), o‘chirilgan yozuvlar; audit — oxirgi
1000 ta. **Tiklash** (boshqa, bo‘sh do‘konga): faylni ochish (`DecompressionStream('gzip')`) va
`POST /migration/import { source: "localStorage", version: b.version, exportedAt: b.exportedAt, data: b,
settings: b.settings, users: b.users }` (≤ 25 MB OCHILGAN holda). Foydalanuvchilar yangi vaqtinchalik parol oladi.

<a id="migration"></a>

### 10.19 Migratsiya (eski brauzer ma’lumotini ko‘chirish)

Eski frontend ma’lumotni `localStorage` da saqlagan. Ko‘chirish sehrgari (T-112) va orqaga qaytish
yo‘li (T-113) — frontend vazifasi; backend tayyor. Faqat administrator.

**Eski kalitlar** (zustand `persist`, `{ state, version }` ko‘rinishida):

| Kalit | Ichida | Serverga |
|-------|--------|----------|
| `crm-qurilish-store` | `CrmSnapshot` (mahsulotlar, cheklar, mijozlar, ... `cashBalance`) | `data` = `state` (o‘zgartirmasdan), `version` = persist `version` (12–15) |
| `crm-settings` | `state.settings` | `settings` |
| `crm-users` | `state.users` (parollar bilan!) | `users: [{ name, email, role }]` — **parolsiz**, email to‘g‘ri, takrorsiz |

**So‘rov:** `{ source: "localStorage", version, exportedAt?, data, settings?, users? }` (≤ 25 MB).

**Sehrgar qadamlari** (T-112 qabul mezoni — 4 qadam, jarayon ko‘rsatkichi):

1. **Hisob** — brauzerdagi ma’lumot bormi (`crm-qurilish-store`), qancha yozuv (ro‘yxatlar bo‘yicha
   son), qaysi foydalanuvchilar ko‘chiriladi (tanlash). JSON buzuq bo‘lsa — ko‘chirib bo‘lmaydi, lekin
   xom nusxani yuklab olish taklif qilinsin.
2. **Tekshirish** — `POST /migration/validate` (hech narsa yozmaydi): `counts`, `accepted`, `existing`
   (serverda allaqachon bor — takroriy import ogohlantirishi), `issues` (`error` — yozuv o‘tkazib
   yuboriladi, `warning` — tuzatiladi; `entity`, `id`, `code`, `detail`). `valid: false` — error bor.
3. **Yuborish** — `POST /migration/import` (bitta tranzaksiya, 5 daqiqagacha; qayta yuborish
   ikkilantirmaydi — id’lar eski id’dan deterministik). Tarif chegarasi — 402.
4. **Natija** — `accepted`, `issues`, **`users[]` — vaqtinchalik parollar faqat SHU javobda**
   (ko‘rsating, nusxalash/yuklab olish imkoni; birinchi kirishda almashtirilsin).

**Xavfsizlik qoidalari (T-112/T-113):**

- Ko‘chirish paytida va xatoda `localStorage` **O‘CHIRILMAYDI**.
- Muvaffaqiyatdan keyin ham nusxa **30 kun** saqlanadi (belgi, masalan `crm-migrated = { at, tenantId }`),
  30 kundan keyin ilova ochilganda tozalanadi.
- Sehrgar oxirida **JSON zaxira** (uchala kalit, `crm-users` dan parollar olib tashlangan) yuklab olinadi.
- Orqaga qaytish — oldingi frontend relizi (xuddi shu `localStorage` kalitlari bilan) + JSON zaxira.
- Server tomonda (hammasi `issues` da ko‘rinadi):
  - qoldiq — nusxadagi `stocks` (yoki `stock`) dan olinadi, manfiy qoldiq 0 bo‘ladi (`warning`); ombor
    harakatlari tarix sifatida ko‘chadi;
  - yo‘q mijozga havola — `null` (`warning`); lekin mijozi yo‘q NASIYA chek o‘tkazib yuboriladi (`error`
    `MISSING_CUSTOMER` — qarz egasiz qolmasin); mahsuloti yo‘q chek — o‘tkazib yuboriladi;
  - band SKU, hujjat raqami, ombor nomi — `-2`, `-3` … qo‘shimchasi bilan; band shtrix-kod — olib tashlanadi;
  - `dataURL` rasmlar S3’ga ko‘chadi (noto‘g‘ri/katta rasm o‘tkazib yuboriladi); sukut ombor mavjudiga birlashadi.

### 10.20 Fiskal chek (OFD)

`OFD_ENABLED=true` serverda har sotuv va qaytarish navbat orqali OFD’ga yuboriladi (sotuv OFD
javobini KUTMAYDI va OFD ishlamasa ham to‘xtamaydi). `GET /sales/:id/receipt` → `fiscal`:
`status` (`pending`/`sent` — navbatda, `confirmed` — fiskal raqam bor, `failed` — OFD rad etdi),
`fiscalId`, `qrPayload` (chekdagi QR mazmuni), `fiscalizedAt`. `confirmed` bo‘lganda
`sale.fiscalized` hodisasi keladi — chekni QR bilan qayta chop etish mumkin. OFD o‘chiq — `fiscal: null`.

### 10.21 Sozlamalar va dastlabki sozlash

`GET /settings` — ilova ochilganda (hamma rol). Maydonlar: `storeName`, `currency`, `taxEnabled`,
`taxRate`, `wholesaleEnabled`, `sellerWholesaleEnabled`, `loyaltyEnabled`, `loyaltyRate`, `maxDiscountPct`,
`receiptPhone`, `receiptAddress`, `receiptFooter`, `onboarded`. `PATCH /settings` — faqat o‘zgarganlarini.
`sellerWholesaleEnabled` (sukut `false`) — «Sotuvchiga ulgurji narxda sotishga ruxsat»: yoqilsa sotuvchi
`wholesalePrice` ni ko‘radi va ulgurji chek qila oladi ([6.2](#hidden)); faqat `wholesaleEnabled` bilan
ma’noga ega.
Ro‘yxatdan o‘tgan yangi do‘konda `onboarded: false` → sehrgar (do‘kon ma’lumoti, QQS, ombor,
kategoriyalar, birinchi mahsulotlar, xodimlar) → oxirida `PATCH /settings { onboarded: true }`.

---

<a id="screens"></a>

## 11. Ekran → endpoint xaritasi

Frontenddagi mavjud sahifalar (`src/pages`) va ular chaqiradigan API. «Hodisa» — sahifa qaysi
realtime hodisada yangilanadi.

| Sahifa (yo‘l, huquq) | Ochilganda | Amallar | Hodisa |
|---|---|---|---|
| **Login** (`/login`) | — | `POST /auth/login` (+ do‘kon tanlash), keyin `GET /settings` | — |
| **Ro‘yxatdan o‘tish** (yangi) | — | `POST /tenants/register` → sehrgar: `PATCH /settings`, `POST /warehouses`, `/categories`, `/products`, `/employees`, `/users` | — |
| **Ilova qobig‘i** (Header, UserMenu, Sidebar) | `POST /auth/refresh` (token yo‘q bo‘lsa), `GET /settings`, socket ulanishi; admin — `GET /tenants/current` (banner) | `POST /auth/logout`, `/auth/logout-all`, `/auth/change-password` | — |
| **Dashboard** (`/`, finance) | `GET /dashboard?days=30` | davr 7/30/90 | `sale.*`, `debt.paid`, `po.received`, `stock.changed` |
| **POS** (`/pos`, sales) | `GET /cash/shifts/current`, `GET /warehouses?archived=false`, `GET /categories`, `GET /products?warehouseId&categoryId&q&pageSize=60`, `GET /files/urls` | mijoz: `GET /clients?q=`, `GET /clients/:id/stats`; skaner: `GET /products?q=`; smena: `POST /cash/shifts/open`; to‘lash: `POST /sales` → `GET /sales/:id/receipt` (yoki `?format=pdf`); mijoz botga ulangan bo‘lsa — «Telegram’ga» (`POST /sales/:id/receipt/telegram`) | `sale.*`, `stock.changed`, `shift.*`, `po.received` |
| **Cheklar** (`/sales`, sales) | `GET /sales` (kursor, filtrlar) | `GET /sales/:id` (`returnedQty`), `GET /sales?relatedSaleId=` (qaytarishlar), `GET /sales/:id/receipt` (JSON yoki `?format=pdf`), `POST /sales/:id/receipt/telegram`, `POST /sales/:id/return`, `POST /sales/:id/cancel`, `GET /exports/sales` | `sale.*`, `debt.paid` |
| **Mahsulotlar** (`/products`, products) | `GET /products` (server sahifa/saralash), `GET /products/summary`, `GET /categories`, `GET /suppliers` (filtr), `GET /files/urls` | CRUD, `.../restore`, `POST /products/import`, `/products/bulk-price`, rasm (`/files/*`), `GET /exports/products` | `stock.changed`, `sale.*`, `po.received` |
| **Mahsulot kartasi** (`/products/:id`) | `GET /products/:id`, `/products/:id/stats`, `GET /stock/movements?productId=`, admin: `GET /audit?entityId=` | tahrir, rasm | `stock.changed` (shu id) |
| **Ombor** (`/warehouse`, products) | `GET /warehouses`, `GET /warehouses/stock`, `GET /stock/movements`, `GET /stock/reorder-suggestions` | `POST /stock/intake`, `/writeoff`, `/adjust`, `/transfer`, ombor CRUD/arxiv, `GET /exports/stock-movements` | `stock.changed`, `sale.*`, `po.received` |
| **Yetkazish** (`/deliveries`, deliveries) | `GET /deliveries`, `/deliveries/summary`; haydovchi: `GET /deliveries/my`; admin/manager: `GET /employees?status=active` | `POST/PATCH/DELETE /deliveries`, `.../status`, `.../restore`, `GET /deliveries/route` | `delivery.status`, `sale.*` |
| **Takliflar** (`/quotes`, quotes) | `GET /quotes`, `/quotes/summary` | CRUD, `.../restore`, `POST /quotes/:id/convert` (`warehouseId` — tanlangan ombor), chop etish (`GET /quotes/:id` + `GET /settings`) | `sale.created` |
| **Ta’minotchilar** (`/suppliers`, suppliers) | `GET /suppliers`, `/suppliers/summary` (sotuvchida qarz yo‘q) | CRUD, `.../restore` | `po.received` |
| **Ta’minotchi kartasi** (`/suppliers/:id`) | `GET /suppliers/:id` | tahrir, buyurtma yaratish | `po.received` |
| **Xaridlar** (`/purchases`, suppliers) | `GET /purchase-orders`, `/purchase-orders/summary` (sotuvchida summalar yo‘q), `GET /suppliers`, `GET /stock/reorder-suggestions` (to‘ldirish) | CRUD, `.../cancel`, `.../receive`, `.../pay` (finance), `.../restore` | `po.received` |
| **Kassa** (`/cash`, finance) | `GET /cash/shifts/current`, `GET /cash/shifts`, `GET /cash/movements` | `POST /cash/shifts/open`, `/close`, `POST /cash/movements`, `GET /cash/shifts/:id/report` | `shift.*`, `sale.*`, `debt.paid` |
| **Qarzlar** (`/debts`, finance) | `GET /debts?view=customers` (+ `summary`) | `view=receipts`, `aging`, `overdue`; `POST /debts/payments`, `GET /debts/payments`; eslatma SMS → Xabarlar | `debt.paid`, `sale.*` |
| **Xarajatlar** (`/expenses`, expenses) | `GET /expenses`, `/expenses/summary`, `GET /expense-templates` | CRUD, `.../restore`, shablon CRUD, `POST /expense-templates/run-due`, `GET /exports/expenses` | — |
| **Hisobotlar** (`/reports`, finance) | `GET /reports/pnl?from&to` | davr tanlash | — (focus’da yangilash) |
| **Analitika** (`/analytics`, finance) | `GET /analytics?from&to` | davr tanlash | — |
| **Mijozlar** (`/clients`, customers) | `GET /clients` (`telegramStatus` — belgi va filtr) | CRUD, `.../restore`, `GET /exports/clients` | `sale.*`, `debt.paid` |
| **Mijoz kartasi** (`/clients/:id`) | `GET /clients/:id`, `/clients/:id/stats`, `GET /sales?customerId=`, `GET /debts?view=receipts&customerId=`, `GET /debts/payments?customerId=` | tahrir, qarz to‘lovi, xabar, «Telegram’ga ulash» (`POST /clients/:id/telegram-link` → QR) | `sale.*`, `debt.paid` |
| **Xabarlar** (`/messages`, customers) | `GET /messages`, `GET /telegram` (bot holati) | `POST /messages/preview` (kanal bo‘yicha son), `POST /messages`; ulanmaganlar — `GET /clients?telegramStatus=none` | — |
| **Xodimlar** (`/employees`, employees) | `GET /employees` | CRUD, `.../restore` | — |
| **Foydalanuvchilar** (`/users`, users) | `GET /users`, `GET /employees` (hisobsiz xodimlar: `userId === null`, 10.12 izohi bilan) | CRUD, «O‘chirilganlar» (`GET /users?deleted=true`) → `.../restore`, parolni tiklash | — |
| **Sozlamalar** (`/settings`, settings) | `GET /settings`; admin: `GET /tenants/current`, `GET /files/usage`, `GET /billing/invoices` | `PATCH /settings` (shu jumladan «Sotuvchiga ulgurji» — `sellerWholesaleEnabled`); admin: `POST /billing/invoices`, `GET /backup/export`, `POST /tenants/current/delete`, `/restore`, migratsiya sehrgari | — |
| **Audit** (`/audit`, users) | `GET /audit` (kursor) | filtrlar, `GET /exports/audit` | — |
| **Migratsiya sehrgari** (yangi, admin) | brauzer `localStorage` | `POST /migration/validate`, `POST /migration/import` | — |
| **Bildirishnomalar** (Notifications) | `GET /products?lowStock=true&pageSize=5`, `GET /debts?overdue=true&pageSize=5` (finance) | — | `stock.changed`, `sale.*`, `debt.paid` |
| **Buyruqlar paneli** (CommandPalette) | — | `GET /products?q=`, `GET /clients?q=` (debounce 250 ms) | — |

«Tez-tez sotiladigan» tugmalari uchun alohida endpoint yo‘q — POS to‘ri server qidiruvi bilan
(kategoriya + `q`), top mahsulotlar `/dashboard` da (moliya huquqi bilan).

---

<a id="flows"></a>

## 12. Qadam-baqadam oqimlar (namuna kod)

Namunalar framework’ga bog‘lanmagan (TypeScript + `fetch`); React/TanStack Query’ga moslash oson.

<a id="flow-client"></a>

### 12.1 API mijozi: token, bitta refresh, xatolar

```ts
const BASE = import.meta.env.VITE_API_URL ?? ''          // dev proksida bo'sh
let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null
/** Token talab qilmaydigan yo'llar — ularning 401 i "login xato" degani, refresh emas */
const NO_REFRESH = new Set(['/auth/login', '/auth/refresh', '/auth/logout'])

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string | undefined,
    readonly errors: { field?: string; code: string; meta?: Record<string, unknown> }[] = [],
    readonly current?: unknown,
    readonly traceId?: string,
  ) { super(detail ?? code) }
}

/** Tab ichida bitta Promise, tablar orasida Web Locks — rotatsiya uchun SHART */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= navigator.locks
    .request('crm-auth-refresh', async () => {
      const res = await fetch(`${BASE}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!res.ok) { accessToken = null; return false }
      const body = await res.json()
      accessToken = body.accessToken
      authStore.setUser(body.user)                      // o'z store'ingiz
      return true
    })
    .finally(() => { refreshing = null })
  return refreshing
}

interface Options {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  idempotencyKey?: string
  ifMatch?: string
}

export async function api<T>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const url = new URL(`${BASE}/api/v1${path}`, location.origin)
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey
  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

  if (res.status === 401 && !retried && !NO_REFRESH.has(path)) {
    if (await refreshAccessToken()) return api<T>(path, opts, true)
    authStore.logoutLocal()                             // login sahifasiga
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => undefined)
  if (!res.ok) {
    throw new ApiError(res.status, body?.code ?? 'INTERNAL', body?.detail ?? body?.title, body?.errors, body?.current, body?.traceId)
  }
  return body as T
}
```

Ilova ochilganda: `await refreshAccessToken()` → `true` bo‘lsa ilova, aks holda login sahifasi.

<a id="flow-query"></a>

### 12.2 Kesh (TanStack Query) — tavsiya etilgan kalitlar va bekor qilish

- Kalit — resurs prefiksi + parametrlar: `['products', 'list', query]`, `['products', 'detail', id]`,
  `['sales', 'list', filters]`, `['cash', 'current']`, `['dashboard', days]`.
- Mutatsiyalar avtomatik qayta urinilmaydi (`retry: 0`); xatolar bitta joyda (global `onError` → toast).
- Bitta xarita «nima nimani eskirtiradi» — mutatsiya muvaffaqiyatida ham, realtime hodisada ham:

```ts
const AFFECTS: Record<string, string[]> = {
  'sale.created':   ['sales', 'products', 'warehouses', 'cash', 'debts', 'clients', 'deliveries', 'dashboard', 'reports'],
  'sale.cancelled': ['sales', 'products', 'warehouses', 'cash', 'debts', 'clients', 'deliveries', 'dashboard', 'reports'],
  'sale.fiscalized':['sales'],
  'stock.changed':  ['products', 'warehouses', 'stock'],
  'shift.opened':   ['cash'],
  'shift.closed':   ['cash'],
  'debt.paid':      ['debts', 'sales', 'clients', 'cash', 'dashboard'],
  'delivery.status':['deliveries', 'sales'],
  'po.received':    ['purchase-orders', 'products', 'suppliers', 'stock', 'dashboard'],
}
```

- Ro‘yxat sahifasi: filtr o‘zgarsa — 1-sahifa; `placeholderData: keepPreviousData` (jadval sakramasin).

### 12.3 POS: savatdan chekkacha

```ts
// 1) Oldindan ko'rish — @crm/shared bilan (server bilan bir xil).
//    l.price — tanlangan birlik narxi: priceForUnit(product, tierPrice, l.unit)
const lines = cart.map((l) => ({ ...l, total: lineTotal(l.price, l.qty, l.discount) }))
const subtotal = lines.reduce((s, l) => s + l.total, 0)
const useBonus = settings.loyaltyEnabled && customer ? bonusRequested : 0
const totals = saleTotals({
  subtotal, discount,
  taxRate: settings.taxEnabled ? settings.taxRate : 0,
  bonusRequested: useBonus, bonusAvailable: customer?.bonusPoints ?? 0,
  roundTo, deliveryFee: delivery?.fee ?? 0,
})

// 2) "To'lash". Kalit — SHU savat uchun: savat yoki to'lov o'zgarganda `checkoutKey = null`,
//    qayta urinishda (xato, tarmoq) — o'zgarmaydi.
// Ulgurji: do'konda yoqilgan va sotuvchiga ochilgan bo'lsa (aks holda server 403 qaytaradi)
const wholesaleAllowed = settings.wholesaleEnabled && (user.role !== 'sotuvchi' || settings.sellerWholesaleEnabled)
const body = {
  customerId: customer?.id, warehouseId,
  priceTier: wholesaleAllowed ? priceTier : 'retail',
  // price — FAQAT kassir qo'lda o'zgartirgan bo'lsa (aks holda server narxni o'zi qo'yadi va solishtiradi)
  items: cart.map(({ productId, unit, qty, manualPrice, discount }) =>
    ({ productId, unit, qty, discount, ...(manualPrice !== undefined && { price: manualPrice }) })),
  discount, bonusUsed: useBonus, roundTo, delivery,
  paid: { cash, card, transfer },                      // cash — mijoz BERGAN naqd
  total: totals.total,                                 // server solishtiradi
}
checkoutKey ??= crypto.randomUUID()
try {
  const sale = await api<Schemas['SaleDto']>('/sales', { method: 'POST', idempotencyKey: checkoutKey, body })
  checkoutKey = null
  clearCart()
  await openReceiptPdf(sale.id)                         // yoki o'z shabloningiz: api(`/sales/${sale.id}/receipt`); qaytim: sale.change
} catch (e) {
  if (!(e instanceof ApiError)) return enqueueOffline(checkoutKey, body)  // javob yo'q — o'sha kalit bilan navbat
  if (e.status >= 500) return toast(`Server xatosi (${e.traceId}) — qayta urinib ko'ring`)  // kalit o'zgarmaydi
  if (e.code === 'SHIFT_REQUIRED') openShiftDialog()
  else if (e.code === 'STOCK_INSUFFICIENT') markShortLines(e.errors)       // field: items[i].qty, meta.available
  else if (e.code === 'TOTAL_MISMATCH') { await reloadProducts(); toast(e.detail) }
  else toast(e.detail)                                                     // CREDIT_*, DISCOUNT_LIMIT, ...
}

/** Tayyor 80 mm PDF chek. Token kerak — `<a href>` yoki `window.open(apiUrl)` ishlamaydi */
async function openReceiptPdf(saleId: string, retried = false): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/sales/${saleId}/receipt?format=pdf`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401 && !retried && (await refreshAccessToken())) return openReceiptPdf(saleId, true)
  if (!res.ok) throw new Error(`Chek PDF: ${res.status}`)
  const url = URL.createObjectURL(await res.blob())
  window.open(url)                                      // brauzer PDF ko'ruvchisi: chop etish
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  // Faylga saqlash kerak bo'lsa — 12.6 dagi saveBlob(blob, nom): blob havolada brauzer
  // Content-Disposition dagi nomni (CHEK-….pdf) o'zi qo'ymaydi
}
```

<a id="flow-offline"></a>

### 12.4 Offline navbat (faqat sotuv uchun tavsiya)

- Tarmoq xatosi (`TypeError: Failed to fetch`, javob yo‘q) bo‘lgan `POST /sales` — IndexedDB’ga
  `{ key, body, createdAt }` bilan; UI’da «Navbatda: N ta chek» banneri.
- Internet qaytganda (`online` hodisasi / socket ulandi) navbat ketma-ket yuboriladi — **xuddi shu
  `Idempotency-Key` bilan**: agar birinchi urinish aslida serverga yetgan bo‘lsa, server saqlangan javobni
  qaytaradi (`Idempotent-Replay: true`), ikkinchi chek yozilmaydi.
- Offline chekda `date` — yaratilgan kun (server o‘tgan sanani qabul qiladi).
- 423 `SHIFT_REQUIRED` / `TENANT_READ_ONLY`, 429 va 5xx — element navbatda QOLADI (smena ochilgach,
  keyinroq qayta yuboriladi); 401 — refresh, keyin qayta. Qolgan 4xx (400, 409, 422 — masalan qoldiq
  yetmadi) — navbatdan chiqarib, foydalanuvchiga ko‘rsatiladi (qo‘lda hal qilish).
- Boshqa amallarni (narx o‘zgartirish, kirim va h.k.) offline navbatga qo‘ymang — eskirgan holat
  ustiga yozilishi mumkin; ular uchun «Internet yo‘q» xabari yetarli.

<a id="flow-upload"></a>

### 12.5 Rasm yuklash

```ts
async function uploadProductImage(file: Blob, name: string): Promise<string> {
  const bytes = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const pre = await api<Schemas['PresignResultDto']>('/files/presign', {
    method: 'POST',
    body: { kind: 'product_image', mime: file.type, size: file.size, sha256, originalName: name },
  })
  if (pre.reused) return pre.file.id                      // shu tarkib allaqachon bor

  const put = await fetch(pre.upload!.url, { method: 'PUT', headers: pre.upload!.headers, body: file })
  if (!put.ok) throw new Error(`Yuklash xatosi: ${put.status}`)

  const ready = await api<Schemas['FileDto']>(`/files/${pre.file.id}/confirm`, { method: 'POST' })
  return ready.id                                         // → PATCH /products/:id { imageFileId }
}
```

### 12.6 Eksport (200 yoki 202)

```ts
async function exportList(resource: string, query: Record<string, string>) {
  const url = new URL(`${BASE}/api/v1/exports/${resource}`, location.origin)
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include' })
  if (res.status === 200) {
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `${resource}.csv`
    return saveBlob(await res.blob(), name)
  }
  if (res.status === 202) {
    let job = await res.json()
    while (job.status === 'queued' || job.status === 'running') {
      await new Promise((r) => setTimeout(r, 2500))
      job = await api(`/exports/jobs/${job.id}`)
    }
    if (job.status === 'ready') {
      window.location.href = job.url          // imzolangan havola: token va CORS kerak emas, fayl nomi bilan yuklanadi
      return
    }
    throw new Error(job.error ?? 'Eksport yiqildi')
  }
  const err = await res.json().catch(() => ({}))
  throw new ApiError(res.status, err.code ?? 'INTERNAL', err.detail ?? err.title, err.errors, err.current, err.traceId)
}
```

> `…/download` va `/files/:id/raw` (302) — muqobil yo‘llar, cheklovi [10.17](#rules) da. Rasmlar uchun
> doim `/files/urls`.

### 12.7 Smena

```ts
const { shift, cashBalance } = await api<Schemas['CurrentShiftDto']>('/cash/shifts/current')
if (!shift) {
  await api('/cash/shifts/open', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { openingBalance: counted } })
}
// Yopish
const closed = await api<Schemas['ShiftDto']>('/cash/shifts/close', {
  method: 'POST', idempotencyKey: crypto.randomUUID(),
  body: { countedBalance, note, denominations: { '100000': 3, '50000': 2 } },
})
const z = await api<Schemas['ShiftReportDto']>(`/cash/shifts/${closed.id}/report`)
```

### 12.8 Qolgan oqimlar — qisqa

| Oqim | Qadamlar |
|------|----------|
| Qaytarish | `GET /sales/:id` → qatorlarni tanlash (`items[].id`, miqdor ≤ `qty − returnedQty`; oshsa 422 `RETURN_EXCEEDS_SOLD`, `meta.returned`) → `POST /sales/:id/return` (kalit) → javobdagi `paid.cash` ni kassir beradi → chop etish (`GET /sales/{qaytarish id}/receipt`, `?format=pdf` bilan ham) |
| Qarz to‘lovi | `GET /debts?view=receipts&customerId=` → chek tanlash → `POST /debts/payments { saleId, amount, method }` (kalit) → javobdagi `sale.outstanding` |
| Kirim buyurtmasi | `GET /stock/reorder-suggestions` (ixtiyoriy) → `POST /purchase-orders` → tovar kelganda `POST /purchase-orders/:id/receive` (kalit) → `POST /purchase-orders/:id/pay` (kalit) |
| Taklif | `POST /quotes` → `PATCH { status: "sent" }` → chop etish → `PATCH { status: "accepted" }` → `POST /quotes/:id/convert { method, warehouseId }` (kalit) → chek |
| Yetkazish | `POST /sales` (`delivery` bilan) → manager `PATCH /deliveries/:id { driverId }` → haydovchi `GET /deliveries/my` → `POST .../status { on_way }` → `{ delivered }` |
| Inventarizatsiya | `GET /products` (filtrsiz, sahifalab; ombor qoldig‘i — `stocks[warehouseId] ?? 0`; `?warehouseId=` faqat qoldig‘i bor tovarlarni beradi) → `POST /stock/adjust { warehouseId, items: [{ productId, countedQty }] }` (kalit) |
| Tarif to‘lovi | `GET /tenants/current` → `POST /billing/invoices` → havolani ochish → qaytganda `GET /billing/invoices`, `GET /tenants/current` |
| Do‘konni o‘chirish | `GET /backup/export` (taklif) → `POST /tenants/current/delete { password }` → banner → `POST /tenants/current/restore` |

---

<a id="tasks"></a>

## 13. Frontend vazifalari va qabul mezonlari

Backend rejasidagi (PLAN.md) frontend vazifalari. Backend tomoni hammasi uchun tayyor.

| # | Vazifa | Qabul mezoni |
|---|--------|--------------|
| T-099 | API mijozi va tiplar | `openapi-typescript` bilan tiplar generatsiya qilinadi; token yangilash **bir vaqtda bitta** (parallel 401’lar bitta refresh’ni kutadi) — [3.3](#connect), [12.1](#flow-client) |
| T-100 | Auth oqimini serverga o‘tkazish | Auth store serverdan ishlaydi; demo foydalanuvchilar va parollar **o‘chiriladi**; parol brauzerda saqlanmaydi (formalar parolni faqat serverga yuboradi) — [5](#auth) |
| T-101 | So‘rov qatlami (TanStack Query) | Kalitlar konvensiyasi; xato ko‘rsatish bir joyda; yozuvchi amal qayta urinilmaydi — [12.2](#flow-query) |
| T-102 | Spravochnik sahifalari | Mahsulotlar, Mijozlar, Ta’minotchilar, Xodimlar, Foydalanuvchilar (+ «O‘chirilganlar» va tiklash), Omborlar — serverdan; sahifalash/saralash **serverda**; ko‘rinish o‘zgarmaydi; sotuvchida yashirin maydonlar ko‘rinmaydi — [4.3](#lists), [6.2](#hidden) |
| T-103 | Kassa (POS) | Savat lokal; `checkout` — bitta `POST /sales`; server xatosi (qoldiq, limit) kassada aniq ko‘rsatiladi; F9/F2 yorliqlari va skaner ishlaydi; ulgurji tugmasi sotuvchida `sellerWholesaleEnabled` ga qarab; chek chop etish (JSON shablon yoki `?format=pdf`) — [10.1](#pos), [12.3](#flows) |
| T-104 | Ombor, kassa, qarz, ta’minot sahifalari | Barcha amallar server orqali; optimistik yangilash xatoda orqaga qaytariladi |
| T-105 | Hisobot va analitika | Hisob **serverdan**; brauzerdagi `reduce` hisoblari olib tashlanadi; grafiklar o‘zgarmaydi — [10.14](#rules) |
| T-106 | Rasm yuklash S3’ga | `resizeImage` maksimal o‘lchami 1600; presign → PUT → confirm; `dataURL` **umuman ishlatilmaydi**; offline’da IndexedDB navbati — [10.16](#files) |
| T-107 | Realtime va uzilishga chidamlilik | Boshqa kassir sotgan tovar qoldig‘i darhol yangilanadi; internet uzilganda ogohlantirish va navbat; tiklanganda avtomatik yuborish — [9](#realtime), [12.4](#flow-offline) |
| T-112 | Migratsiya sehrgari (UI) | 4 qadam (hisob → tekshirish → yuborish → natija); jarayon ko‘rsatkichi; xato bo‘lsa localStorage **o‘chirilmaydi** — [10.19](#migration) |
| T-113 | Orqaga qaytish yo‘li | Migratsiyadan keyin ham localStorage nusxasi 30 kun saqlanadi; JSON zaxira yuklab olinadi — [10.19](#migration) |

Qo‘shimcha (rejada alohida vazifa emas, lekin kerak): ro‘yxatdan o‘tish sahifasi va dastlabki
sozlash sehrgari (`/tenants/register`, `onboarded`), «Tarif va hisob» sahifasi (tarif, to‘lov, zaxira,
do‘konni o‘chirish), faqat-o‘qish banneri, haydovchi ko‘rinishi (`/deliveries/my`), audit sahifasi
(serverdan), eksport tugmalari (server eksporti).

**Brauzerdan olib tashlanadigan narsalar:** lokal store’dagi biznes ma’lumoti (mahsulot, chek,
qoldiq…), demo foydalanuvchilar va parollar, brauzerdagi moliyaviy hisoblar (tushum, qarz, foyda
yig‘indilari — endi server), `dataURL` rasmlar. Brauzerda qoladi: savat, qoldirilgan savatlar,
tanlangan ombor, til, mavzu, offline navbat.

---

<a id="muammolar"></a>

## 14. Ma’lum muammolar va cheklovlar

### 14.1 Backend’da ochiq qolgan masalalar (qaror kutilmoqda)

1. **Narxni qo‘lda o‘zgartirish cheklanmagan.** Chek qatorida `price` (savdolashish) `maxDiscountPct` ga
   bo‘ysunmaydi va har qanday rol (sotuvchi ham) yubora oladi — UI’da kimga ruxsat berishni hal qiling.

### 14.2 Hujjat yozilgach o‘zgarganlar

**2026-09-29** — frontendga ta’sir qiladi:

| Avval | Endi | Frontendda |
|-------|------|-----------|
| Dev proksi faqat lokal backend (`localhost:3000`) uchun ko‘rsatilgan edi | Proksi production’ga ham (`API_PROXY_TARGET=https://crm.workspaces.uz`), `/health` qo‘shildi; LAN uchun HTTPS; production’ga boshqa origin’dan to‘g‘ridan-to‘g‘ri murojaat nega yo‘qligi ([3.1](#connect)) | `vite.config.ts` ga proksi; CORS ro‘yxatini kengaytirish va `SameSite=None` — qilinmaydi |
| Xabarlar faqat SMS edi; SMS sozlanmaganda xabar faqat jurnalga yozilardi (`logged`, «demo») | Telegram bot: mijoz shaxsiy QR orqali Start bosib ulanadi; xabar — botga ulangan → Telegram (zamonaviy karta), aks holda SMS, aks holda yetmaydi (bitta mijozda 422 `RECIPIENT_UNREACHABLE`, guruhda `unreachable` soni); chekni Telegram’ga (PDF) ([10.13](#telegram)) | `GET /telegram`, `POST /clients/:id/telegram-link` (QR), `ClientDto.telegramStatus` va filtr, `preview.telegram/unreachable`, `MessageDto.telegram/unreachable`, `POST /sales/:id/receipt/telegram`; yangi xato kodi |

**2026-09-28** — frontendga ta’sir qiladi:

| Avval | Endi | Frontendda |
|-------|------|-----------|
| Frontend — Cloudflare Pages, API — alohida domen (`api.domen.uz`), `VITE_API_URL` shart edi | Frontend va API bitta serverda, bitta domenda (`crm.domen.uz`): `/api`, `/socket.io`, `/health` — API, qolgani — SPA ([3.1](#connect)) | `VITE_API_URL` bo‘sh, socket — `io('/events')`; `navigateFallbackDenylist` ([3.1](#connect)) |
| Production manzili noma’lum edi (`crm.domen.uz` — namuna) | `https://crm.workspaces.uz` ishlayapti: API `/api/v1`, Swagger `/api/docs` ([3.1](#connect)) | Sinov uchun o‘z do‘koningizni ro‘yxatdan o‘tkazing — production bazasi bo‘sh |

**2026-09-27** — frontendga ta’sir qiladi:

| Avval | Endi | Frontendda |
|-------|------|-----------|
| Sotuvchi kirim buyurtmasi va ta’minotchi summalarini ko‘rardi (bitta qatorli buyurtmadan tannarx tiklanardi) | Sotuvchi javobida xarid summalari yo‘q; dashboard’da `payables` yo‘q ([6.2](#hidden)) | Pul ustunlari va kartalarini `field in obj` bilan yashirish |
| PDF chek yo‘q edi (501 yoki JSON) | `GET /sales/:id/receipt?format=pdf` — 80 mm termal chek (fiskal QR bilan); `PDF_ENABLED` va `FEATURE_DISABLED` olib tashlandi | «PDF» / «Chop etish»: `fetch` → `blob` → yangi oyna ([12.3](#flows)) |
| Chek qatorida qaytarilgan miqdor ko‘rinmasdi | `items[].returnedQty`; `GET /sales?relatedSaleId=` — chekning qaytarishlari | Qaytarish oynasida maksimum `qty − returnedQty` |
| O‘chirilgan hisobni topib, tiklab bo‘lmasdi | `GET /users?deleted=true` (+ `deletedAt`); 409 `EMPLOYEE_HAS_USER` da `meta.userId`, `meta.deleted`; xodimi o‘chirilgan hisobni tiklash — 422 | «O‘chirilganlar» ro‘yxati va «Tiklash» tugmasi |
| Sotuvchi ulgurji narxni ko‘rmay turib, unda sota olardi | `settings.sellerWholesaleEnabled` (sukut `false`): yoqilsa — ko‘radi va sotadi; o‘chiq — narx yashirin, `wholesale` → 403 | Sozlamalarda yangi katakcha; sotuvchida ulgurji tugmasi shunga qarab |
| Taklifda aniq `priceTier` ulgurji savdo o‘chiq bo‘lsa ham qo‘llanardi | Sotuvdagidek — o‘chiq bo‘lsa chakana | — |
| `/analytics` `limit` ni qabul qilib, e’tiborsiz qoldirardi; P&L `limit` sotuvchilarni cheklamasdi | Analitikada `limit` yo‘q (400); P&L `limit` — top mahsulot, sotuvchilar, sotilmayotgan tovar | Analitikaga `limit` yubormang |
| Taklifni sotuvga aylantirishda omborni tanlab bo‘lmasdi (do‘konning joriy omboriga tushardi) | `POST /quotes/:id/convert { method, warehouseId? }` — qoldiq tanlangan omborda | Kassada tanlangan omborni yuborish. «Joriy ombor»ni o‘zgartiradigan endpoint ataylab yo‘q (do‘kon uchun bitta — kassirlar bir-birinikini almashtirardi): tanlov qurilmada, har amal `warehouseId` oladi ([10.6](#rules)) |

**2026-09-24:**

| Muammo | Endi |
|--------|------|
| To‘xtatilgan/o‘chirilayotgan do‘kon foydalanuvchisi login/refresh’da 423 olardi — to‘lay olmas, o‘chirishni bekor qila olmas edi | Kirish va refresh ishlaydi (faqat bo‘shatilgan xodim — 423); javobda `user.tenant.status` |
| Proksi ortida rate limit hammaga umumiy edi (`req.ip` — proksi) | `TRUST_PROXY` sozlamasi (production’da `1`): hisob mijoz IP’si bo‘yicha |
| Fon eksportini alohida domendagi API bilan yuklab bo‘lmasdi (faqat 302) | `GET /exports/jobs/:id` javobida `url` + `expiresAt` |
| Demo seed’da sement qo‘shimcha birligi teskari edi («1 kg = 50 qop») | `altFactor: 0.02` (1 kg = 0,02 qop) |

### 14.3 E’tibor bering (xato emas, qoida)

- Refresh rotatsiyasida «imtiyoz oynasi» yo‘q — parallel refresh barcha sessiyalarni yopadi ([5.3](#auth-refresh)).
- Rol o‘zgarishi ≤ 15 daqiqada kuchga kiradi (access token muddati).
- 429 (rate limit) javobida `code: "INTERNAL"` — `status` bo‘yicha aniqlang.
- DTO validatsiyasi (400) xatolarida `errors[].field` yo‘q — `meta.message` / `detail`.
- Sotuvchi javoblarida ba’zi kalitlar umuman yo‘q ([6.2](#hidden)) — `undefined` ni `0` deb ko‘rsatmang.
- `GET /files/:id/raw` token talab qiladi — `<img src>` uchun `/files/urls`.
- `GET /employees` faqat admin/manager — sotuvchi/omborchi xodim tanlay olmaydi.
- `sale.cancelled` hodisasida mahsulot id’lari yo‘q — barcha mahsulot/qoldiq keshini yangilang.
- Tarif to‘lovi tasdig‘i haqida realtime hodisa yo‘q — so‘rov bilan tekshiring.
- «Tez-tez sotiladigan» mahsulotlar uchun endpoint yo‘q.
- Chek (`CHEK-…`) o‘chirilmaydi, ombor o‘chirilmaydi — bekor qilish / arxiv.
- Bitta do‘konda bitta ochiq smena (kassir bo‘yicha emas).
- Taklif holatlari o‘tishini server tekshirmaydi; aylantirilmagan har qanday taklif sotuvga aylanadi.
- `GET /products?warehouseId=` faqat shu omborda qoldig‘i BOR tovarlarni qaytaradi.
- Hisobot `trend` i faqat sotuv bo‘lgan kunlarni beradi — grafikda bo‘sh kunlarni 0 bilan to‘ldiring.

---

<a id="glossary"></a>

## Ilova A — invariantlar lug‘ati

Endpoint tavsiflaridagi belgilar ma’nosi (backend texnik topshirig‘idan):

| Kod | Qoida |
|-----|-------|
| I1 | `product.stock` = barcha ombor qoldiqlari yig‘indisi |
| I2 | Ombor qoldig‘i manfiy bo‘lmaydi |
| I3 | Sotuv tanlangan ombordagi qoldiqdan oshmaydi |
| I4 | Tushum qoidasi yagona: bekor qilinmagan sotuvlar (nasiya ham), qaytarishlar ayiriladi |
| I5 | Yetkazish narxi chek summasi ichida |
| I6 | Qaytarishda QQS asl chek foizi bo‘yicha |
| I7 | Qaytarish ombor qoldig‘i bilan cheklanmaydi |
| I8 | Naqd amal (va har sotuv/qaytarish) ochiq smenani talab qiladi; bir vaqtda bitta smena |
| I9 | Kassa balansi faqat ochiq smenada o‘zgaradi |
| I10 | Smena ochilishi balansni jismoniy sanoqqa tenglashtiradi |
| I11 | Kirimda o‘rtacha tortilgan tannarx |
| I12 | Hujjat raqamlari ketma-ket va noyob |
| I13 | Qarz = jami − to‘langan, manfiy emas (bazada hisoblanadi) |
| I14 | Qarz to‘lovi qarzdan oshmaydi |
| I15 | Nasiya mijozni talab qiladi |
| I16 | Nasiya limiti va muddati o‘tgan qarz yangi nasiyani to‘sadi |
| I17 | Bonus beriladi va bekor qilishda qaytariladi (bonus faqat sotuv orqali o‘zgaradi) |
| I18 | Ta’minotchiga qarz = kelgan tovar − to‘langan |
| I19 | Qabul buyurtmadan oshmaydi; qisman → `partial` |
| I20 | Taklifni aylantirish qoldiqni tekshiradi, bir marta |
| I21 | Takrorlanuvchi xarajat davriga bir marta |
| I22 | Audit jurnali o‘zgartirilmaydi |
| I23 | Ombor chiqimi asosiy birlikda (`baseQty`) |
| I24 | Bekor qilish tovarni o‘sha omborga qaytaradi |
| D1 | Foydalanuvchi ism/lavozimi xodim yozuvidan (takrorlanmaydi) |
| D3 | Chekka bog‘liq yetkazish narxi chekdan (`deliveryFee`) |
| D4 | Mahsulot kategoriyasi — havola (`categoryId`), nom emas |

**Atamalar:** *nasiya* — qarzga sotuv; *smena* — kassa ish davri; *X-hisobot* — ochiq smena
oraliq hisoboti; *Z-hisobot* — yopilgan smena yakuniy hisoboti; *sukut ombor* — yopib
(arxivlab) bo‘lmaydigan asosiy ombor; *tenant* — do‘kon; *idempotent* — qayta yuborilganda
ikki marta bajarilmaydigan amal; *presigned URL* — muddatli, imzolangan to‘g‘ridan-to‘g‘ri havola.
