# CRM backend API — frontend dasturchi uchun qo‘llanma

Bu hujjat backendda nima qilinganini, har bir API nima uchun va qanday ishlatilishini, frontend
qaysi qoidalarga amal qilishi kerakligini tushuntiradi. Maqsad — frontendni serverga ulashda
savol qolmasligi.

| Fayl | Nima bor |
|------|----------|
| **README.md** (shu fayl) | Umumiy qoidalar, auth oqimi, xatolar, rollar, realtime, biznes qoidalari, ekran → endpoint xaritasi, qadam-baqadam oqimlar, frontend vazifalari, ma’lum muammolar |
| [endpoints.md](endpoints.md) | **192 ta endpoint** — har biri: nima uchun/qachon, huquq, sarlavhalar, parametrlar, so‘rov tanasi, javob, xatolar, realtime hodisa |
| [schemas.md](schemas.md) | **229 ta DTO** — har bir maydon: tip, majburiymi, izoh, cheklovlar |
| [owner-panel.md](owner-panel.md) | **Egasi paneli** — ALOHIDA ilova (`owner.workspaces.uz`, repo `crm-owner`): platforma egasining do‘konlar ustidan nazorati; do‘kon ilovasi uchun emas |

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
6. [Rollar, ruxsatlar va yashirin maydonlar](#roles)
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
funksiyalar: chek hisobi, birliklar, nasiya, bonus, ruxsatlar katalogi, tariflar, CSV).

**Ko‘p do‘konli (multi-tenant):** bitta server ko‘p do‘konga xizmat qiladi. Do‘kon (tenant) ma’lumoti
uch qatlamda ajratilgan (so‘rov konteksti, Prisma filtri, PostgreSQL RLS). `tenantId` HECH QACHON
so‘rovdan olinmaydi — faqat access token’dan. Frontend `tenantId` yubormaydi (yagona istisno —
login’da do‘kon tanlash).

**Bo‘limlar (modullar) va ular nima beradi:**

| Bo‘lim | Imkoniyat |
|--------|-----------|
| Auth | Kirish (bir email bir necha do‘konda), JWT access token (15 daq) + httpOnly refresh cookie (30 kun, rotatsiya, o‘g‘irlik aniqlash), chiqish, barcha qurilmalardan chiqish, parol o‘zgartirish, yangi do‘kon ro‘yxatdan o‘tishi |
| Rollar | Ruxsatlar ROLGA beriladi: 67 ta `bo‘lim.amal` ruxsati, har do‘konda 4 ta tizim roli + administrator yaratadigan rollar; huquq har so‘rovda bazadan (o‘zgarish darhol kuchga kiradi); tannarx/foyda maydonlari ruxsatga qarab javobdan olib tashlanadi |
| Spravochniklar | Omborlar (arxiv), kategoriyalar, mahsulotlar (qo‘shimcha birlik, import, ommaviy narx, rasm), mijozlar, ta’minotchilar, xodimlar, foydalanuvchilar — sahifalash, saralash, qidiruv, yumshoq o‘chirish + tiklash, optimistik qulf |
| Ombor | Kirim (o‘rtacha tannarx), chiqim, inventarizatsiya, ko‘chirish, harakatlar jurnali, buyurtma taklifi; qoldiq manfiy bo‘lmaydi |
| Sotuv | Chek (bitta tranzaksiya: qoldiq, kassa, bonus, yetkazish), qaytarish, bekor qilish, chop etish uchun chek (JSON yoki tayyor 80 mm PDF), OFD fiskal chek (navbat orqali) |
| Kassa | Smena ochish/yopish, joriy balans, naqd kirim/chiqim, X/Z hisobot |
| Moliya | Nasiya va qarzlar (eskirish 30/60/60+), qarz to‘lovi, xarajatlar va takrorlanuvchi shablonlar, kirim buyurtmalari (qabul, ta’minotchiga to‘lov) |
| Savdo | Takliflar (smeta) → sotuvga aylantirish, yetkazib berish (haydovchi ko‘rinishi, marshrut) |
| Hisobot | Boshqaruv paneli, foyda/zarar (oldingi davr bilan), analitika (ABC), keshlangan agregatlar |
| Xabarlar | Telegram bot (shaxsiy QR bilan ulangan mijozga xabar va chek — bepul) va SMS (Eskiz / Playmobile), shablon o‘zgaruvchilari, fon navbati, kunlik SMS chegarasi |
| Fayllar | Presigned yuklash (server orqali o‘tmaydi), tekshiruv (MIME, xesh), rasm variantlari 128/512 WebP, kvota; do‘kon brendi — logotip va rang (chek PDF’ida ham) |
| Eksport / zaxira | CSV/JSON eksport (katta — fonda), butun do‘kon zaxirasi (gzip JSON) |
| Migratsiya | Brauzerdagi eski (localStorage) ma’lumotni serverga ko‘chirish: dry-run + import |
| Tarif / to‘lov | `free`/`basic`/`pro` chegaralari, hisob-faktura, Payme va Click webhook’lari, muddati o‘tgan do‘kon — faqat o‘qish |
| Hayot sikli | Do‘konni o‘chirish (30 kun muhlat, bekor qilish mumkin) |
| Egasi paneli | Platforma egasi uchun alohida kirish va API (`/platform/*`): do‘konlar ro‘yxati, ochish, bloklash (`blocked` — faqat o‘qish), tarif va qo‘lda to‘lov, o‘chirish, hisoblar, barcha hisob-fakturalar, egasi jurnali — [owner-panel.md](owner-panel.md) |
| Realtime | `/events` — sotuv, qoldiq, smena, qarz, yetkazish, kirim, sozlama, huquq hodisalari |
| Audit | Har bir pul/ombor/spravochnik amali jurnalga yoziladi |

**Frontend ahvoli:** frontend (`crm-qurilish`) hozir brauzerda (localStorage/zustand) ishlaydi.
Uni serverga ulash — frontend vazifasi ([13-bo‘lim](#tasks)). Backend tomoni tayyor va sinalgan
(273 unit + 601 e2e test).

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

Yashirin maydonlar (masalan `cost`) sxemada **ixtiyoriy** (`cost?: number`) — `cost.view` siz rolda
ular javobda umuman bo‘lmaydi ([6.6](#hidden)). Kodda `product.cost ?? null` kabi tekshiring.

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
| `permissions.ts` | `PERMISSIONS`, `PERMISSION_CATALOG`, `normalizePermissions` (rol oynasidagi bog‘liqliklar), `hasPermission(permissions, resource, action)` — rol emas, ruxsatlar to‘plami ([6](#roles)) |
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
   (serverdagi joriy yozuv, rol ruxsatiga qarab tozalangan). UI: «Yozuv boshqa foydalanuvchi tomonidan
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

Access token — RS256 JWT: `sub` (user id), `tid` (do‘kon), `eid` (xodim id), `jti`. Rol tokenda YO‘Q —
server uni har so‘rovda bazadan o‘qiydi ([6.5](#access-changed)). Frontend tokenni dekodlashi shart emas —
foydalanuvchi ma’lumoti login/refresh javobidagi `user` da:

```json
{
  "accessToken": "eyJ…",
  "expiresIn": 900,
  "user": {
    "id": "…", "name": "Bobur Toshmatov", "email": "admin@crm.uz",
    "role": "admin", "roleId": "…", "roleName": "Administrator", "permissions": ["sales.view", "sales.create", "…"],
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
- **423 `AUTH_ACCOUNT_LOCKED`** — xodim ishdan bo‘shatilgan. To‘xtatilgan (`suspended`), bloklangan
  (`blocked`) yoki o‘chirilayotgan (`deleting`) do‘konga kirish MUMKIN — `user.tenant.status` bo‘yicha
  faqat-o‘qish bannerini ko‘rsating ([8.1](#tenant)).
- **429** — daqiqasiga 10 urinishdan oshdi.

Yangi do‘kon — `POST /tenants/register` (javob login bilan bir xil, foydalanuvchi darhol kirgan,
roli `admin`). Keyin `settings.onboarded === false` bo‘lsa — dastlabki sozlash sehrgari. Platforma egasi
ro‘yxatdan o‘tishni **yopib qo‘yishi** mumkin: kirish sahifasi ochilganda `GET /tenants/registration` → `{ mode }`;
`closed` bo‘lsa «Do‘kon ochish» havolasini yashiring, `register` esa 403 `REGISTRATION_CLOSED` qaytaradi.

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

Access token bekor qilinmaydi, lekin huquq tokenda emas: rol o‘zgarishi va hisobni faolsizlantirish/o‘chirish
foydalanuvchining KEYINGI so‘rovidanoq kuchga kiradi (faolsiz hisob — 401). Xodimni ishdan bo‘shatish esa
login/refresh’ni yopadi — ochiq sessiya access token muddati (≤ 15 daq) tugaguncha ishlaydi.

Parol siyosati: kamida 8 belgi, ommabop parollar rad etiladi (400 `VALIDATION_FAILED`).

---

<a id="roles"></a>

## 6. Rollar, ruxsatlar va yashirin maydonlar

<a id="roles-model"></a>

### 6.1 Qanday ishlaydi

- **Ruxsat** — `bo‘lim.amal` satri: `sales.return`, `products.edit`, `cost.view`. To‘liq ro‘yxat (67 ta, 23 bo‘lim) —
  [6.2](#permissions), kodda — `packages/shared/src/permissions.ts` (`PERMISSIONS`, `PERMISSION_CATALOG`),
  API’da — `GET /roles/catalog`.
- **Rol** — ruxsatlar to‘plami. Ruxsat **ROLGA** beriladi, foydalanuvchiga emas: bitta foydalanuvchi —
  bitta rol, alohida foydalanuvchiga qo‘shimcha ruxsat yo‘q. Kerak bo‘lsa yangi rol yaratiladi
  («Katta kassir», «Haydovchi»).
- **Har do‘konda 4 ta tizim roli** (`key`: `admin`, `manager`, `sotuvchi`, `omborchi`) — o‘chirilmaydi.
  Ularning sukut ruxsatlari avvalgi qat’iy matritsa bilan **aynan bir xil** (mavjud do‘konlarda hech
  kimning huquqi o‘zgarmadi). Ularning ruxsatlarini o‘zgartirish mumkin (`admin` dan tashqari).
- **Do‘kon rollari** — do‘kon yaratadi (`key: null`), nomi va ruxsatlari erkin.
- **Rollarni boshqarishning o‘zi ham ruxsat** — `roles.view/create/edit/delete` (sukut — faqat administratorda,
  istalgan rolga berish mumkin). Administrator bo‘lmagan egasi faqat O‘ZIDA bor ruxsatlarni bera oladi
  ([6.4](#roles-api)).
- **`admin` roli** — doim katalogdagi HAMMA ruxsat (keyin qo‘shiladigan yangilari ham), o‘zgarmaydi.
  Bundan tashqari faqat administrator qila oladigan amallar bor ([6.3](#admin-only)).
- **Server huquqni har so‘rovda bazadan o‘qiydi** (keshlangan), tokendan emas: rol tahriri, foydalanuvchiga
  boshqa rol berish, hisobni faolsizlantirish — **keyingi so‘rovdanoq** kuchga kiradi ([6.5](#access-changed)).
- **Frontend huquqni `user.permissions` dan oladi** (login, refresh, `GET /auth/me` javobida): menyu, sahifa
  himoyasi, tugmalar — hammasi SHU ro‘yxat bo‘yicha. Rol nomiga (`role === 'sotuvchi'`) qarab qaror
  qilmang — do‘kon rolida `role` `null`, tizim rolining ruxsatlari esa o‘zgargan bo‘lishi mumkin.
  `role === 'admin'` tekshiruvi faqat [6.3](#admin-only) dagi amallar uchun.

```jsonc
"user": {
  "id": "…", "name": "Otabek", "email": "kassa@dokon.uz", "position": "Kassir", "employeeId": "…",
  "role": null,                       // tizim roli kaliti yoki null (do‘kon roli)
  "roleId": "0199…",                  // rol id (GET /roles)
  "roleName": "Katta kassir",         // ko‘rsatish uchun (tizim rolida — key bo‘yicha tarjima qiling)
  "permissions": ["sales.view", "sales.create", "sales.return", "products.view", "customers.view", "customers.create"],
  "tenant": { "id": "…", "name": "Qurilish Mollari", "status": "active" }
}
```

**Server ruxsatlarni normallashtiradi** (rol saqlanganda; javobda — saqlangan to‘liq ro‘yxat):

| Qoida | Misol |
|-------|-------|
| Bo‘limning istalgan amali — uning `view` ini qo‘shadi | `sales.return` → + `sales.view` |
| `sales.create`, `quotes.create`, `quotes.edit`, `stock.view` → `products.view` (kassa, smeta va ombor katalogsiz ishlamaydi) | `stock.operate` → + `stock.view`, `products.view` |
| `purchases.view` → `suppliers.view`, `products.view` | `purchases.pay` → + `purchases.view`, `suppliers.view`, `products.view` |
| `messages.view` → `customers.view` (auditoriya va bot holati mijozlar bo‘limida) | `messages.send` → + `messages.view`, `customers.view` |
| `users.create`, `users.edit` → `roles.view` (hisobga rol tanlash) | `users.edit` → + `users.view`, `roles.view` |
| `profit.view` → `cost.view` (foydadan tannarx tiklanadi) | — |
| Takrorlar olib tashlanadi, tartib — katalog tartibi | — |

Rol oynasida ham shunday qiling (katakcha belgilansa — bog‘liqlari ham belgilanadi; `view` olib tashlansa —
o‘sha bo‘limning qolgan amallari ham), shunda foydalanuvchi saqlangandan keyin «o‘zi qo‘shilgan» ruxsatni
ko‘rib hayron bo‘lmaydi.

<a id="permissions"></a>

### 6.2 Ruxsatlar katalogi

M — `manager`, S — `sotuvchi`, O — `omborchi` (sukut; `admin` — hammasi). Ruxsat yetmasa —
**403 `PERMISSION_DENIED`** (`detail`: «Rolingizda «sales.cancel» ruxsati yo‘q»). Nomlar — `GET /roles/catalog`
dagi `label` (o‘zbekcha; uch tilga tarjimani frontend i18n’ida `permissions.<kalit>` sifatida qo‘shing,
yo‘q bo‘lsa `label` ni ko‘rsating).

| Ruxsat | Nima beradi | Endpointlar / maydonlar | M | S | O |
|--------|-------------|-------------------------|:-:|:-:|:-:|
| **Savdo** | | | | | |
| `sales.view` | Sotuvlar: Sotuvlar tarixi va cheklar | `GET /sales`, `GET /sales/:id`, `GET /sales/:id/receipt`, `POST /sales/:id/receipt/telegram` | ✔ | ✔ | ✔ |
| `sales.create` | Sotuvlar: Sotish (kassa) | `POST /quotes/:id/convert`, `POST /sales` | ✔ | ✔ |  |
| `sales.return` | Sotuvlar: Qaytarish | `POST /sales/:id/return` | ✔ | ✔ |  |
| `sales.cancel` | Sotuvlar: Chekni bekor qilish | `POST /sales/:id/cancel` | ✔ |  |  |
| `sales.belowCost` | Sotuvlar: Minimal narxdan (tannarx + marja) past sotish | `POST /sales`, `POST /quotes` — narx/chegirma minimal narxdan past bo‘lsa ([10.1](#pos)); sukutda hech bir rolda yo‘q, administrator beradi; chek jurnalga `sale.belowCost` bilan tushadi |  |  |  |
| `quotes.view` | Takliflar (smeta): Ko‘rish | `GET /quotes`, `GET /quotes/summary`, `GET /quotes/:id` | ✔ | ✔ |  |
| `quotes.create` | Takliflar (smeta): Yaratish | `POST /quotes` | ✔ | ✔ |  |
| `quotes.edit` | Takliflar (smeta): Tahrirlash | `PATCH /quotes/:id` | ✔ | ✔ |  |
| `quotes.delete` | Takliflar (smeta): O‘chirish | `DELETE /quotes/:id`, `POST /quotes/:id/restore` | ✔ |  |  |
| `deliveries.view` | Yetkazib berish: Ko‘rish (haydovchi — o‘ziga biriktirilganlar holati) | `GET /deliveries`, `GET /deliveries/summary`, `GET /deliveries/my`, `GET /deliveries/route`, `GET /deliveries/:id`, `POST /deliveries/:id/status` (faqat o‘ziga biriktirilgan) | ✔ | ✔ | ✔ |
| `deliveries.create` | Yetkazib berish: Yaratish | `POST /deliveries` | ✔ | ✔ |  |
| `deliveries.edit` | Yetkazib berish: Tahrirlash va istalganining holati | `PATCH /deliveries/:id` (+ istalgan yetkazish holati) | ✔ | ✔ |  |
| `deliveries.delete` | Yetkazib berish: O‘chirish | `DELETE /deliveries/:id`, `POST /deliveries/:id/restore` | ✔ |  |  |
| **Ombor** | | | | | |
| `products.view` | Mahsulotlar: Katalog, qoldiq va omborlar ro‘yxati | `GET /categories`, `GET /categories/:id`, `GET /products/summary`, `GET /products`, `GET /products/:id/stats`, `GET /products/:id`, `GET /warehouses`, `GET /warehouses/stock`, `GET /warehouses/:id` | ✔ | ✔ | ✔ |
| `products.create` | Mahsulotlar: Qo‘shish va import | `POST /categories`, `POST /products`, `POST /products/import` | ✔ |  | ✔ |
| `products.edit` | Mahsulotlar: Tahrirlash va narxlar | `PATCH /categories/:id`, `POST /products/bulk-price`, `PATCH /products/:id` | ✔ |  | ✔ |
| `products.delete` | Mahsulotlar: Arxivlash | `DELETE /categories/:id`, `POST /categories/:id/restore`, `DELETE /products/:id`, `POST /products/:id/restore` | ✔ |  | ✔ |
| `stock.view` | Ombor: Harakatlar jurnali va buyurtma tavsiyasi | `GET /stock/movements`, `GET /stock/reorder-suggestions` | ✔ | ✔ | ✔ |
| `stock.operate` | Ombor: Kirim, hisobdan chiqarish, inventarizatsiya, ko‘chirish | `POST /stock/intake`, `POST /stock/writeoff`, `POST /stock/adjust`, `POST /stock/transfer` | ✔ |  | ✔ |
| `stock.manage` | Ombor: Ombor qo‘shish, tahrirlash, arxivlash | `POST /warehouses`, `PATCH /warehouses/:id`, `POST /warehouses/:id/archive`, `POST /warehouses/:id/restore` | ✔ |  | ✔ |
| `purchases.view` | Xaridlar (kirim buyurtmalari): Ko‘rish | `GET /purchase-orders`, `GET /purchase-orders/summary`, `GET /purchase-orders/:id` | ✔ | ✔ | ✔ |
| `purchases.create` | Xaridlar (kirim buyurtmalari): Yaratish | `POST /purchase-orders` | ✔ |  | ✔ |
| `purchases.edit` | Xaridlar (kirim buyurtmalari): Tahrirlash va bekor qilish | `PATCH /purchase-orders/:id`, `POST /purchase-orders/:id/cancel` | ✔ |  | ✔ |
| `purchases.receive` | Xaridlar (kirim buyurtmalari): Qabul qilish (omborga kirim) | `POST /purchase-orders/:id/receive` | ✔ |  | ✔ |
| `purchases.pay` | Xaridlar (kirim buyurtmalari): Ta’minotchiga to‘lash | `POST /purchase-orders/:id/pay` | ✔ | ✔ |  |
| `purchases.delete` | Xaridlar (kirim buyurtmalari): O‘chirish | `DELETE /purchase-orders/:id`, `POST /purchase-orders/:id/restore` | ✔ |  | ✔ |
| `suppliers.view` | Ta’minotchilar: Ko‘rish | `GET /suppliers`, `GET /suppliers/summary`, `GET /suppliers/:id` | ✔ | ✔ | ✔ |
| `suppliers.create` | Ta’minotchilar: Qo‘shish | `POST /suppliers` | ✔ |  | ✔ |
| `suppliers.edit` | Ta’minotchilar: Tahrirlash | `PATCH /suppliers/:id` | ✔ |  | ✔ |
| `suppliers.delete` | Ta’minotchilar: O‘chirish | `DELETE /suppliers/:id`, `POST /suppliers/:id/restore` | ✔ |  | ✔ |
| **Moliya** | | | | | |
| `cash.view` | Kassa: Smenalar va kassa harakatlari | `GET /cash/shifts/current`, `GET /cash/shifts`, `GET /cash/shifts/:id/report`, `GET /cash/movements` | ✔ | ✔ |  |
| `cash.operate` | Kassa: Smena ochish/yopish, naqd kirim-chiqim | `POST /cash/shifts/open`, `POST /cash/shifts/close`, `POST /cash/movements` | ✔ | ✔ |  |
| `debts.view` | Qarzlar: Mijozlar qarzi va to‘lovlari | `GET /debts`, `GET /debts/payments` | ✔ | ✔ |  |
| `debts.collect` | Qarzlar: Qarz to‘lovini qabul qilish | `POST /debts/payments` | ✔ | ✔ |  |
| `expenses.view` | Xarajatlar: Ko‘rish | `GET /expenses`, `GET /expenses/summary`, `GET /expenses/:id`, `GET /expense-templates` | ✔ |  |  |
| `expenses.create` | Xarajatlar: Qo‘shish | `POST /expenses`, `POST /expense-templates`, `POST /expense-templates/run-due` | ✔ |  |  |
| `expenses.edit` | Xarajatlar: Tahrirlash | `PATCH /expenses/:id`, `PATCH /expense-templates/:id` | ✔ |  |  |
| `expenses.delete` | Xarajatlar: O‘chirish | `DELETE /expenses/:id`, `POST /expenses/:id/restore`, `DELETE /expense-templates/:id` | ✔ |  |  |
| `payroll.view` | Maosh hisobi: Maosh varag‘i va xodimlar hisobi | `GET /payroll`, `GET /payroll/entries` ([10.22](#payroll)); `employees.view` va `salary.view` ni nazarda tutadi. Sukutda hech bir rolda yo‘q — administrator beradi |  |  |  |
| `payroll.accrue` | Maosh hisobi: Hisoblash: maosh, bonus, mukofot, jarima | `POST /payroll/accruals`, `POST /payroll/run-due`; hisoblash yozuvini o‘chirish/tiklash. Sukutda hech bir rolda yo‘q — administrator beradi |  |  |  |
| `payroll.pay` | Maosh hisobi: To‘lash: avans va maosh (kassadan yoki bankdan) | `POST /payroll/payments`; to‘lov yozuvini o‘chirish/tiklash. Sukutda hech bir rolda yo‘q |  |  |  |
| `reports.view` | Hisobotlar: Boshqaruv paneli, hisobotlar va tahlil | `GET /dashboard`, `GET /reports/pnl`, `GET /analytics` | ✔ | ✔ |  |
| **Mijozlar** | | | | | |
| `customers.view` | Mijozlar: Ko‘rish | `GET /clients`, `GET /clients/:id/stats`, `GET /clients/:id`, `GET /telegram` | ✔ | ✔ | ✔ |
| `customers.create` | Mijozlar: Qo‘shish | `POST /clients` | ✔ | ✔ |  |
| `customers.edit` | Mijozlar: Tahrirlash va Telegram’ga ulash | `PATCH /clients/:id`, `POST /clients/:id/telegram-link` | ✔ | ✔ |  |
| `customers.delete` | Mijozlar: O‘chirish | `DELETE /clients/:id`, `POST /clients/:id/restore` | ✔ | ✔ |  |
| `messages.view` | Xabarlar (SMS, Telegram): Yuborilganlar jurnali | `GET /messages` | ✔ | ✔ | ✔ |
| `messages.send` | Xabarlar (SMS, Telegram): Yuborish | `POST /messages/preview`, `POST /messages` | ✔ | ✔ |  |
| **Boshqaruv** | | | | | |
| `employees.view` | Xodimlar: Ko‘rish | `GET /employees`, `GET /employees/:id` | ✔ |  |  |
| `employees.create` | Xodimlar: Qo‘shish | `POST /employees` | ✔ |  |  |
| `employees.edit` | Xodimlar: Tahrirlash | `PATCH /employees/:id` | ✔ |  |  |
| `employees.delete` | Xodimlar: O‘chirish | `DELETE /employees/:id`, `POST /employees/:id/restore` |  |  |  |
| `users.view` | Foydalanuvchilar (kirish hisoblari): Ko‘rish | `GET /users`, `GET /users/:id` |  |  |  |
| `users.create` | Foydalanuvchilar (kirish hisoblari): Qo‘shish | `POST /users` |  |  |  |
| `users.edit` | Foydalanuvchilar (kirish hisoblari): Tahrirlash, rol berish, parolni tiklash | `PATCH /users/:id` |  |  |  |
| `users.delete` | Foydalanuvchilar (kirish hisoblari): O‘chirish | `DELETE /users/:id`, `POST /users/:id/restore` |  |  |  |
| `roles.view` | Rollar va ruxsatlar: Ko‘rish | `GET /roles`, `GET /roles/catalog`, `GET /roles/:id` |  |  |  |
| `roles.create` | Rollar va ruxsatlar: Yaratish | `POST /roles` |  |  |  |
| `roles.edit` | Rollar va ruxsatlar: Ruxsat berish va olib tashlash, nomini o‘zgartirish | `PATCH /roles/:id` |  |  |  |
| `roles.delete` | Rollar va ruxsatlar: O‘chirish | `DELETE /roles/:id` |  |  |  |
| `audit.view` | Amallar jurnali: Ko‘rish | `GET /audit` |  |  |  |
| `settings.view` | Sozlamalar: Fayl saqlash hajmi | `GET /files/usage` | ✔ |  |  |
| `settings.edit` | Sozlamalar: O‘zgartirish (brend, chek, QQS …) | `PATCH /settings` | ✔ |  |  |
| **Maxfiy ma’lumotlar** | | | | | |
| `cost.view` | Tannarx: Tannarx, ombor qiymati, xarid summalari, ta’minotchi qarzi | maydonlar: `cost`, `unitCost`, `stockValue`, `stockValueByCategory`, `deadValue`, `payables` + xarid summalari ([6.6](#hidden)) | ✔ |  | ✔ |
| `wholesale.view` | Ulgurji narx: Ulgurji narxni ko‘rish va shu narxda sotish | maydon `wholesalePrice`; `priceTier: "wholesale"` bilan sotish ([6.6](#hidden)) | ✔ |  | ✔ |
| `profit.view` | Foyda: Yalpi va sof foyda, marja (tannarxsiz bo‘lmaydi) | maydonlar: `grossProfit`, `netProfit`, `profit`, `cogs`, `margin` | ✔ |  |  |
| `salary.view` | Maosh: Xodimlar maoshi | maydon `salary` (xodimlar) | ✔ |  |  |

`GET /settings` — ruxsatsiz, hamma rol o‘qiydi (kassaga QQS va chegirma chegarasi kerak). `GET /auth/me`,
`/auth/*`, fayl va eksport endpointlari — o‘z qoidasi bilan (fayl turiga / ro‘yxatga qarab,
[endpoints.md](endpoints.md)).

<a id="admin-only"></a>

### 6.3 Faqat administrator

Bu amallar katalogda YO‘Q — hech qaysi rolga berib bo‘lmaydi, faqat `role === 'admin'` (boshqasiga — 403).
Rollarni boshqarish esa — ODDIY ruxsat (`roles.*`, [6.4](#roles-api)), istalgan rolga beriladi:

| Amal | Endpointlar | Nega rolga berilmaydi |
|------|-------------|------------------------|
| Tarif, to‘lov, do‘kon holati, do‘konni o‘chirish | `GET /tenants/current`, `POST /tenants/current/delete`, `/restore`, `GET/POST /billing/invoices` | Pul va do‘konning mavjudligi |
| Zaxira | `GET /backup/export` | Butun do‘kon ma’lumoti bitta faylda |
| Migratsiya | `POST /migration/validate`, `/import` | Ommaviy yozuv |


<a id="roles-api"></a>

### 6.4 Rollarni boshqarish (API)

| Amal | So‘rov | Javob va xatolar |
|------|--------|------------------|
| Ro‘yxat (`roles.view`) | `GET /roles` | `RoleDto[]` — sahifasiz, avval tizim rollari (`admin`, `manager`, `sotuvchi`, `omborchi`), keyin nom bo‘yicha |
| Katalog (`roles.view`) | `GET /roles/catalog` | `{ groups: [{ key, label }], resources: [{ key, group, label, actions: [{ key, permission, label }] }] }` — statik, ilova versiyasi bilan keshlang |
| Bitta rol (`roles.view`) | `GET /roles/:id` | `RoleDto`; yo‘q yoki boshqa do‘konniki — 404 |
| Yaratish (`roles.create`) | `POST /roles { name, permissions }` | 201 `RoleDto`; nom band (harf farqsiz) — 409 `ALREADY_EXISTS` (`field: name`); noma’lum ruxsat — 400 (`field: permissions`); o‘zida yo‘q ruxsat — 403 |
| Ruxsat berish / olib tashlash, nom (`roles.edit`) | `PATCH /roles/:id { name?, permissions? }` + `If-Match: <updatedAt>` | 200 `RoleDto`; `permissions` — TO‘LIQ ro‘yxat (almashtiriladi, qo‘shilmaydi): berish — kalitni qo‘shib, olib tashlash — chiqarib yuboring; o‘zidan kengroq rol yoki o‘zida yo‘q ruxsat — 403; `admin` — 422 `ROLE_PROTECTED`; tizim rolining nomi — 422 `ROLE_PROTECTED` (`field: name`); eskirgan versiya — 409 `VERSION_CONFLICT` (`current` bilan) |
| O‘chirish (`roles.delete`) | `DELETE /roles/:id` | 204; tizim roli — 422 `ROLE_PROTECTED`; rolda hisob bor — 409 `ROLE_IN_USE` (`errors[0].meta.users` — nechta) |
| O‘chirish (hisoblarni ko‘chirib) | `DELETE /roles/:id?replaceWith=<roleId>` | 204 — rolning BARCHA hisoblari (o‘chirilganlari ham) shu rolga o‘tadi; o‘zidan kengroq rolga ko‘chirish — 403; `replaceWith` yo‘q/boshqa do‘konniki/o‘zi — 422 `REFERENCE_NOT_FOUND` (`field: replaceWith`) |

`RoleDto`: `{ id, name, key, permissions, usersCount, updatedAt }` — `key`: tizim roli kaliti yoki `null`;
`permissions`: `admin` da — katalogdagi hammasi; `usersCount` — o‘chirilmagan hisoblar.

| | `admin` | `manager`, `sotuvchi`, `omborchi` | Do‘kon roli |
|---|---|---|---|
| Nomi | o‘zgarmaydi | o‘zgarmaydi (UI `key` bo‘yicha tarjima qiladi) | o‘zgaradi (1–50 belgi, do‘konda noyob) |
| Ruxsatlari | o‘zgarmaydi — doim hammasi | o‘zgaradi | o‘zgaradi |
| O‘chirish | yo‘q | yo‘q | ha |

**Foydalanuvchiga rol berish** — `roleId`:

- `POST /users { employeeId, email, password, roleId }`, `PATCH /users/:id { roleId }`, filtr `GET /users?roleId=`.
- `UserDto`: `roleId`, `roleName`, `role` (tizim kaliti yoki `null`).
- Rol topilmasa yoki boshqa do‘konniki — 422 `REFERENCE_NOT_FOUND` (`field: roleId`). O‘z rolini o‘zgartirish —
  422 `SELF_ROLE_CHANGE`; oxirgi administratorni boshqa rolga o‘tkazish — 422 `LAST_ADMIN`.
- **Eskirgan (o‘tish davri uchun qoldirilgan):** `role` kaliti (`"sotuvchi"`) bilan `POST/PATCH /users` va
  `GET /users?role=` hali ishlaydi — shu kalitli tizim roli beriladi. Yangi kodda faqat `roleId`; frontend
  o‘tgach `role` kiritmasi olib tashlanadi (javobdagi `role` maydoni qoladi).

**Huquq oshirishdan himoya.** `roles.*` va `users.*` ruxsatlarini istalgan rolga berish mumkin (masalan
menejerga). Administrator bo‘lmagan egasi faqat **o‘zida bor ruxsatlar** doirasida ishlaydi, aks holda 403
`PERMISSION_DENIED`:

- rolga faqat o‘zida bor ruxsatni bera oladi (yaratishda ham, tahrirda ham); olib tashlash — o‘zidan keng
  bo‘lmagan rollarda;
- o‘zidan kengroq rolni (yoki `admin` ni) tahrirlay, o‘chira olmaydi, hisoblarni unga ko‘chira olmaydi;
- hisobga `admin` yoki o‘zidan kengroq rolni bera olmaydi, shunday roldagi hisobni tahrirlay/o‘chira/tiklay
  olmaydi (parolini ham tiklay olmaydi).

Shu qoida tufayli `roles.edit` egasi o‘z roliga yangi ruxsat qo‘shib «administrator bo‘lib» ololmaydi.
UI’da administrator bo‘lmaganga: rol oynasida o‘zida yo‘q ruxsat katakchalarini o‘chiq ko‘rsating; rol va hisob
ro‘yxatida `role.key === 'admin'` yoki `role.permissions ⊄ user.permissions` bo‘lgan qatorlarda tahrir/o‘chirish
tugmalarini yashiring; rol tanlovida (hisob formasi, `replaceWith`) faqat `role.permissions ⊆ user.permissions`
bo‘lgan rollar.

Rol amallari jurnalga tushadi (`GET /audit`): `role.create`, `role.update` (`diff`: `name: { from, to }`,
`permissions: { added, removed }`), `role.delete` (`movedUsers`, `replaceWith`).

<a id="access-changed"></a>

### 6.5 Huquq qachon kuchga kiradi

| Nima o‘zgardi | Serverda | Frontendda |
|---------------|----------|------------|
| Rol ruxsatlari (`PATCH /roles/:id`) yoki rol o‘chirildi | Shu rol egalarining KEYINGI so‘rovidanoq (token o‘sha) | `access.changed` hodisasi → `GET /auth/me` → store’dagi `user` (permissions) yangilanadi → menyu qayta chiziladi; joriy sahifa endi ruxsatsiz bo‘lsa — bosh sahifaga ([6.7](#permission-ui)) |
| Foydalanuvchiga boshqa rol (`PATCH /users/:id { roleId }`) | Uning keyingi so‘rovidanoq | xuddi shu (`access.changed`) |
| Hisob faolsizlantirildi yoki o‘chirildi | Uning keyingi so‘rovi — 401 `AUTH_INVALID_CREDENTIALS`; sessiyalari yopilgan → refresh ham 401 | Odatiy 401 oqimi: refresh → 401 → login sahifasi |
| Xodim ishdan bo‘shatildi (`status: fired`) | Login/refresh — 423 `AUTH_ACCOUNT_LOCKED` | Access token muddati (≤ 15 daq) tugagach login sahifasi |

- `access.changed` yuki bo‘sh (`{}`) va do‘konning barcha ulanishlariga keladi — kimniki o‘zgarganini
  tekshirmang, shunchaki `GET /auth/me` ni qayta so‘rang (arzon so‘rov, kamdan-kam hodisa).
- **Hodisada `POST /auth/refresh` CHAQIRMANG** — hamma tab bir vaqtda refresh qilsa, rotatsiya
  `AUTH_TOKEN_REUSE` ga olib keladi ([5.3](#auth-refresh)). Token yangilash shart emas: huquq tokenda yo‘q.
- Kutilmagan 403 `PERMISSION_DENIED` (UI ruxsat bor deb hisoblagan) — ruxsat shu orada o‘zgargan:
  «Ruxsat yo‘q» toast + `GET /auth/me` ni qayta so‘rang.
- Bir nechta server nusxasida boshqa nusxa o‘zgarishni ≤ 30 soniyada ko‘radi (hozir production — bitta nusxa).

<a id="hidden"></a>

### 6.6 Yashirin maydonlar (ruxsatga qarab)

Server bu maydonlarni javobdan **butunlay olib tashlaydi** (`null` emas — kalit yo‘q). Barcha javoblarga,
ichma-ich obyektlarga, 409 dagi `current` ga va eksport ustunlariga qo‘llanadi.

| Ruxsat yo‘q bo‘lsa | Yashirin maydonlar | Sukut: kimda YO‘Q |
|--------------------|--------------------|-------------------|
| `cost.view` | `cost`, `unitCost`, `stockValue`, `stockValueByCategory`, `deadValue`, `payables` + xarid summalari (pastda) | sotuvchi |
| `wholesale.view` | `wholesalePrice`\* | sotuvchi |
| `profit.view` | `grossProfit`, `netProfit`, `profit`, `cogs`, `margin` | sotuvchi, omborchi |
| `salary.view` | `salary` | sotuvchi, omborchi |

\* **Ulgurji narx do‘kon sozlamasi bilan ham ochiladi.** `wholesaleEnabled` va `sellerWholesaleEnabled`
ikkalasi `true` bo‘lsa `wholesale.view` ruxsati bo‘lmagan rol ham `wholesalePrice` ni ko‘radi (katalog, eksport)
va `priceTier: "wholesale"` bilan sota oladi. Aks holda narx javobda yo‘q, `priceTier: "wholesale"` yuborsa —
403 `PERMISSION_DENIED` ([10.1](#pos)). Sozlama o‘zgargach katalogni qayta so‘rang (kesh ≤ 1 daqiqa).
Shart frontendda: `can('wholesale.view') || (settings.wholesaleEnabled && settings.sellerWholesaleEnabled)`.

**Xarid summalari — `cost.view` siz rolda yo‘q.** Bitta qatorli kirim buyurtmasida summa ÷ miqdor = tannarx.
Shuning uchun bunday rol ta’minotchilar va buyurtmalarni ko‘radi, lekin pul maydonlarisiz. Bu kalitlar
(`total`, `paid`, `debt` …) chek va mijoz qarzida ham bor — ular FAQAT quyidagi javoblardan olinadi:

| Javob | `cost.view` siz rolda yo‘q |
|-------|-----------------|
| `GET /purchase-orders`, `/purchase-orders/:id` va buyurtma qaytaradigan amallar | `total`, `receivedValue`, `paid`, `outstanding`; `items[].cost` |
| `GET /purchase-orders/summary` | `outstanding`, `monthTotal`, `receivedTotal` (faqat `openOrders`) |
| `GET /suppliers`, `/suppliers/summary` | `debt` (`suppliersWithDebt` — soni qoladi) |
| `GET /suppliers/:id` | `debt`, `totalPurchased`; `orders[]` da `total`, `paid`, `outstanding`; `payments[]` da `amount` |
| `GET /dashboard` | `payables` (ta’minotchilarga qarz) |
| 422 `PAYMENT_EXCEEDS_DEBT` (`POST /purchase-orders/:id/pay`) | `meta.outstanding` (faqat `meta.requested`) |

Mavjud yozuvda ustun/kartani `field in obj` tekshiruvi bilan ko‘rsating (yo‘q kalitni `0` deb ko‘rsatmang).
Yozuv hali YO‘Q paytda (yangi mahsulot formasi, ommaviy amal) — ruxsat bo‘yicha: tannarx maydoni
`can('cost.view')` bo‘lsa.

<a id="permission-ui"></a>

### 6.7 Sahifa, menyu va tugmalar → ruxsat

Menyu bandi va yo‘l himoyasi (`RequirePermission`) — «Sahifa» ustunidagi ruxsat; sahifa ichidagi tugma
va bloklar — o‘ng ustundagi. Ruxsat yo‘q tugma umuman ko‘rsatilmaydi (server baribir tekshiradi).

| Sahifa (yo‘l) | Sahifa / menyu | Tugmalar va bloklar |
|---------------|----------------|---------------------|
| Boshqaruv paneli (`/`) | `reports.view` (yo‘q bo‘lsa — bosh sahifa boshqa, pastda) | foyda kartalari — `profit.view`; ta’minotchiga qarz — `cost.view` |
| Kassa — POS (`/pos`) | `sales.create` | smena ochish/yopish — `cash.operate`; mijoz tanlash/qo‘shish — `customers.view` / `customers.create`; ulgurji tugmasi — [6.6](#hidden); yetkazish — `deliveries.create`; «Telegram’ga» chek — `sales.view`; narx/chegirmani minimal narxdan past qilish — `sales.belowCost` ([10.1](#pos)) |
| Sotuvlar (`/sales`) | `sales.view` | «Qaytarish» — `sales.return`; «Bekor qilish» — `sales.cancel`; eksport — `sales.view` |
| Takliflar (`/quotes`) | `quotes.view` | yaratish — `quotes.create`; tahrir/holat — `quotes.edit`; o‘chirish/tiklash — `quotes.delete`; «Sotuvga aylantirish» — `sales.create` |
| Yetkazish (`/deliveries`) | `deliveries.view` | yaratish — `deliveries.create`; tahrir, haydovchi biriktirish — `deliveries.edit` (+ `employees.view` haydovchi ro‘yxati uchun; yo‘q bo‘lsa maydonni yashiring); holat — `deliveries.edit` (istalgani) yoki faqat o‘ziniki; o‘chirish — `deliveries.delete` |
| Mahsulotlar (`/products`, `/products/:id`) | `products.view` | qo‘shish, import — `products.create`; tahrir, ommaviy narx — `products.edit`; arxiv/tiklash — `products.delete`; tannarx — `cost.view`; harakatlar tarixi — `stock.view`; audit tarixi — `audit.view`; eksport — `products.view` |
| Ombor (`/warehouse`) | `stock.view` | kirim, hisobdan chiqarish, inventarizatsiya, ko‘chirish — `stock.operate`; ombor qo‘shish/tahrir/arxiv — `stock.manage`; qiymat — `cost.view`; eksport — `stock.view` |
| Xaridlar (`/purchases`) | `purchases.view` | yaratish — `purchases.create`; tahrir, bekor — `purchases.edit`; «Qabul qilish» — `purchases.receive`; «To‘lash» — `purchases.pay` (+ summalar `cost.view` siz yo‘q — to‘lov oynasida qarzni ko‘rsatib bo‘lmaydi, shuning uchun `cost.view` siz rolda tugmani yashirish tavsiya etiladi); o‘chirish — `purchases.delete` |
| Ta’minotchilar (`/suppliers`, `/suppliers/:id`) | `suppliers.view` | qo‘shish — `suppliers.create`; tahrir — `suppliers.edit`; o‘chirish — `suppliers.delete`; qarz va summalar — `cost.view` |
| Kassa (`/cash`) | `cash.view` | smena ochish/yopish, naqd kirim/chiqim — `cash.operate` |
| Qarzlar (`/debts`) | `debts.view` | to‘lov qabul qilish — `debts.collect`; eslatma xabar — `messages.send` |
| Xarajatlar (`/expenses`) | `expenses.view` | qo‘shish, shablon, «Hozir yaratish» — `expenses.create`; tahrir — `expenses.edit`; o‘chirish — `expenses.delete` |
| Hisobotlar (`/reports`), Analitika (`/analytics`) | `reports.view` | foyda, marja, tannarx — `profit.view` |
| Mijozlar (`/clients`, `/clients/:id`) | `customers.view` | qo‘shish — `customers.create`; tahrir, «Telegram’ga ulash» — `customers.edit`; o‘chirish — `customers.delete`; xaridlar tarixi — `sales.view`; qarz va to‘lov — `debts.view` / `debts.collect`; xabar — `messages.send` |
| Xabarlar (`/messages`) | `messages.view` | yuborish (preview ham) — `messages.send` |
| Xodimlar (`/employees`) | `employees.view` | qo‘shish — `employees.create`; tahrir — `employees.edit`; o‘chirish — `employees.delete`; maosh va maosh sozlamalari (`salaryDay`, `salesBonusPct`, `payrollFrom`) — `salary.view` |
| Maosh (`/payroll` — oylik varaq, xodim varag‘i) | `payroll.view` | hisoblash (maosh, bonus, mukofot, jarima), «Hozir hisoblash» — `payroll.accrue`; avans/to‘lov — `payroll.pay`; yozuvni o‘chirish/tiklash — turiga qarab shu ikkisi ([10.22](#payroll)) |
| Foydalanuvchilar (`/users`) | `users.view` | qo‘shish — `users.create`; tahrir, rol, parol — `users.edit`; o‘chirish/tiklash — `users.delete`; «Rollar» — pastda |
| Rollar (`/users/roles` yoki «Foydalanuvchilar» ichida tab) | `roles.view` | yaratish — `roles.create`; ruxsat berish/olib tashlash, nom — `roles.edit`; o‘chirish — `roles.delete` (har biri — o‘zidan kengroq rolda yashirin, [6.4](#roles-api)) |
| Audit (`/audit`) | `audit.view` | eksport — `users.view` |
| Sozlamalar (`/settings`) | `settings.view` | saqlash — `settings.edit`; «Tarif va hisob», zaxira, do‘konni o‘chirish, migratsiya — `role === 'admin'` |
| Bildirishnomalar | — | kam qolgan tovar — `products.view`; muddati o‘tgan qarz — `debts.view` |
| Ctrl+K oynasi | — | menyu bandlari — menyudagi shart; mahsulot qidiruvi — `products.view`; mijoz — `customers.view` |

**Bosh sahifa** (`/` ochilganda yoki ruxsatsiz sahifadan qaytarilganda) — birinchi mos:
`reports.view` → `/`; `sales.create` → `/pos`; `sales.view` → `/sales`; `stock.view` → `/warehouse`;
`products.view` → `/products`; `customers.view` → `/clients`; `deliveries.view` → `/deliveries/my`
(haydovchi); hech biri — `/help`.

<a id="roles-migration"></a>

### 6.8 Frontendga o‘tish: qat’iy matritsadan ruxsatlarga

Frontenddagi `src/lib/permissions.ts` (rol → resurs → amal matritsasining nusxasi) endi **ishlatilmaydi** —
manba `user.permissions`. Qadamlar (fayllar — `crm-qurilish`):

1. **Tiplar:** `npm run gen:api` → `components['schemas']['AuthUserDto']['permissions'][number]` — `Permission` tipi
   (63 ta kalit birlashmasi). `RoleDto`, `PermissionCatalogDto` ham shu yerda.
2. **`src/lib/permissions.ts`** — matritsa o‘rniga:

   ```ts
   import type { components } from '@/api/schema'
   export type Permission = components['schemas']['AuthUserDto']['permissions'][number]
   export type PermissionSet = ReadonlySet<Permission>
   export const toPermissionSet = (user?: { permissions: Permission[] } | null): PermissionSet =>
     new Set(user?.permissions ?? [])
   ```

3. **`src/store/useAuth`** — `user` o‘rnatilganda `permissions: PermissionSet` ni ham saqlang (har render’da
   `new Set` qilinmasin). `GET /auth/me` ning javobi bilan yangilanadi ([6.5](#access-changed)).
4. **`src/lib/useCan.ts`** — `const can = useCan(); can('sales.return')` (bitta argument — ruxsat kaliti).
5. **`RequirePermission`** — `permission: Permission` prop; `navItems.ts` da `resource/action` o‘rniga
   `permission` ([6.7](#permission-ui) jadvali); `homePath.ts` — yuqoridagi tartib.
6. **`src/lib/hiddenFields.ts`** — rol emas, ruxsat: `hidesCost = !can('cost.view')`, `hidesProfit = !can('profit.view')`,
   `hidesSalary = !can('salary.view')`, `hidesWholesalePrice = !can('wholesale.view') && !(wholesaleEnabled && sellerWholesaleEnabled)`.
   Shu bilan `QuoteForm.tsx` (`user?.role !== 'sotuvchi' || …`), `ProductForm.tsx`, `BulkPriceModal.tsx` dagi rol
   tekshiruvlari ham ruxsatga o‘tadi.
7. **`role === 'admin'`** faqat [6.3](#admin-only) dagi joylarda qoladi (`AppLayout`, `StatusBanners`, Sozlamalar
   ichidagi «Tarif va hisob», zaxira, migratsiya). Rollar sahifasi — `roles.*` ruxsatlari bilan.
8. **Rol nomini ko‘rsatish** (`UserMenu`, foydalanuvchilar jadvali): `user.role ? t(\`enum.role.${user.role}\`) : user.roleName`.
   `MigrationWizard` dagi eski nusxa rollari — tizim kalitlari, o‘zgarmaydi.
9. **`UserForm`, `OnboardingWizard`** — rol tanlovi `GET /roles` dan (`value: roleId`, nomi — 8-banddagidek), so‘rovda
   `roleId` yuboriladi (`role` emas). Administrator bo‘lmagan foydalanuvchida — faqat o‘zidan keng bo‘lmagan
   rollar ([6.4](#roles-api)).
10. **Realtime** — `access.changed` → `GET /auth/me` qayta; `roles` va `users` kesh kalitlari bekor ([12.2](#flow-query)).
11. **Yangi sahifa «Rollar»** — pastdagi talablar.

Eski kalit → yangi ruxsat (qidirib almashtirish uchun):

| Eski (`hasPermission(role, resource, action)`) | Yangi |
|-------|-------|
| `products:view` | `products.view` (katalog, omborlar ro‘yxati, qoldiq); harakatlar jurnali va buyurtma tavsiyasi — `stock.view` |
| `products:create/edit/delete` (mahsulot, kategoriya) | `products.create` / `products.edit` / `products.delete` |
| `products:edit` (kirim, chiqim, inventarizatsiya, ko‘chirish) | `stock.operate` |
| `products:create/edit/delete` (ombor qo‘shish, tahrir, arxiv) | `stock.manage` |
| `suppliers:*` (ta’minotchilar) | `suppliers.*` |
| `suppliers:*` (kirim buyurtmalari) | `purchases.view/create/edit/delete`; qabul — `purchases.receive` |
| `finance:create` (ta’minotchiga to‘lov) | `purchases.pay` |
| `finance:view` / `finance:create` (kassa, smena, naqd) | `cash.view` / `cash.operate` |
| `finance:view` / `finance:create` (qarzlar, qarz to‘lovi) | `debts.view` / `debts.collect` |
| `finance:view` (dashboard, hisobotlar, analitika) | `reports.view` |
| `sales:create` (qaytarish) | `sales.return` |
| `sales:delete` (chekni bekor qilish) | `sales.cancel` |
| `customers:view` / `customers:create` (xabarlar) | `messages.view` / `messages.send` |
| `users:view` (audit) | `audit.view` |
| `role === 'sotuvchi'` / `'omborchi'` (maydonlar) | `cost.view`, `wholesale.view`, `profit.view`, `salary.view` |

**«Rollar» sahifasi — talablar:**

- Ro‘yxat (`GET /roles`, `roles.view`): nom (tizim roli — tarjima), turi («Tizim» / «Do‘kon»), foydalanuvchilar
  soni (`usersCount`), amallar — `roles.create/edit/delete` ga qarab; administrator bo‘lmaganda o‘zidan kengroq
  rollarda tahrir/o‘chirish yo‘q ([6.4](#roles-api)).
- «Yangi rol» / «Tahrirlash» oynasi: nom maydoni (tizim rolida — o‘chiq), ruxsatlar jadvali `GET /roles/catalog`
  dan: `groups` tartibida bo‘limlar, har bo‘lim — qator, amallar — katakchalar (`label`/tarjima). Bo‘lim
  qatorida «hammasi» katakchasi qulay. Bog‘liqliklar [6.1](#roles-model) dagidek avtomatik belgilanadi.
  `admin` roli — hamma katakcha belgilangan va o‘chiq, «Saqlash» yo‘q. Administrator bo‘lmaganda o‘zida yo‘q
  ruxsat katakchalari o‘chiq (server baribir 403 qaytaradi).
- Saqlash — `POST` / `PATCH` (`If-Match: role.updatedAt`); 409 `VERSION_CONFLICT` — «Rolni boshqa administrator
  o‘zgartirdi» + `current` ni ko‘rsatib qayta tahrirlash. Javobdagi `permissions` ni ko‘rsating.
- O‘chirish — faqat do‘kon rolida. `usersCount > 0` bo‘lsa oldindan «Foydalanuvchilarni qaysi rolga o‘tkazamiz?»
  tanlovi (boshqa rollar) → `DELETE …?replaceWith=`. `usersCount` o‘chirilgan hisoblarni sanamaydi — 0 bo‘lsa ham
  409 `ROLE_IN_USE` kelishi mumkin (o‘chirilgan hisob rolda): xatoda xuddi shu tanlovni ochib qayta yuboring.
- Hisob formasida rol tanlovi yonida «Rollarni boshqarish» havolasi (`roles.view` bo‘lsa).
- Qabul mezoni: do‘kon roli yaratilib hisobga berilgach, o‘sha foydalanuvchida menyu va tugmalar FAQAT rol
  ruxsatlari bo‘yicha ko‘rinadi; rol tahrirlansa ochiq ilovada sahifa yangilanmasdan o‘zgaradi
  (`access.changed`); hech bir sahifa 403 bilan «bo‘sh» qolmaydi.

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

**`field` yo‘li:** `items[0].qty`, `customerId`, `discount`, `If-Match` kabi (massiv indeksi bilan).
**DTO validatsiyasi (400)** xatolarida ham bor (masalan `brandColor`, `items[1].qty`); matn —
`errors[].meta.message` da (masalan `"email must be an email"` yoki o‘zbekcha xabar), `detail` da hammasi `; ` bilan.
Forma validatsiyasini frontendda ham qiling (maydon cheklovlari — [schemas.md](schemas.md)).

### 7.2 Umumiy qayta ishlash

| Status | Nima qilish kerak |
|--------|-------------------|
| 400 `VALIDATION_FAILED` | Forma xatosi — `detail`/`errors` ni ko‘rsating; qayta urinmang |
| 401 | Auth yo‘lidan tashqari — refresh + bir marta qayta; auth yo‘lida — login xatosi |
| 402 `PLAN_LIMIT_EXCEEDED` | «Tarif chegarasi: N ta» + «Tarifni oshirish» havolasi (`meta.limit`, `meta.used`) |
| 403 `PERMISSION_DENIED` | «Ruxsat yo‘q»; menyu/tugma bu holatga yetkazmasligi kerak — kelsa, ruxsat shu orada o‘zgargan: `GET /auth/me` ni qayta so‘rang ([6.5](#access-changed)) |
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
| `AUTH_INVALID_CREDENTIALS` | 401 | Login xato; token yo‘q/yaroqsiz/eskirgan; hisob faolsizlantirilgan yoki o‘chirilgan (o‘sha token bilan keyingi so‘rov); joriy parol xato | Login: «Email yoki parol xato»; boshqa joyda — refresh (faolsiz hisobda refresh ham 401 → login) |
| `AUTH_INVALID_REFRESH` | 401 | Refresh cookie yo‘q, noma’lum yoki muddati o‘tgan | Login sahifasi |
| `AUTH_TOKEN_REUSE` | 401 | Bekor qilingan refresh cookie ishlatildi (parallel refresh, logout-all / parol almashishidan keyin boshqa qurilmada) — barcha sessiyalar yopildi | «Sessiya tugadi» → login sahifasi |
| `PLAN_LIMIT_EXCEEDED` | 402 | Tarif chegarasi (foydalanuvchi, ombor): `meta.resource`, `plan`, `limit`, `used` | Tarifni oshirish taklifi |
| `PERMISSION_DENIED` | 403 | Rolda kerakli ruxsat yo‘q (`detail`: «Rolingizda «sales.cancel» ruxsati yo‘q»); faqat administrator amali ([6.3](#admin-only)); o‘zidan kengroq rol yoki o‘zida yo‘q ruxsat bilan ishlash ([6.4](#roles-api)); `wholesale.view` siz rol `priceTier: "wholesale"` yubordi, `sellerWholesaleEnabled` o‘chiq | «Ruxsat yo‘q» + `GET /auth/me` |
| `REGISTRATION_CLOSED` | 403 | `POST /tenants/register` — platforma egasi ro‘yxatdan o‘tishni yopgan (oldindan `GET /tenants/registration` → `mode`) | «Yangi do‘kon ochish vaqtincha yopiq» |
| `NOT_FOUND` | 404 | Yo‘ldagi yozuv yo‘q / o‘chirilgan / boshqa do‘konniki | Ro‘yxatga qaytish |
| `AUTH_TENANT_REQUIRED` | 409 | Email bir necha do‘konda — `errors[].meta.{tenantId, tenantName}` | Do‘kon tanlash |
| `ALREADY_EXISTS` | 409 | Noyob qiymat band (ombor/kategoriya nomi, shtrix-kod, email) — `errors[].field`; yopilmagan murojaat bor (`errors[0].meta.requestId`, [8.5](#support)) | Maydon ostida; murojaatda — mavjudini ochish |
| `DUPLICATE_SKU` | 409 | SKU band | «Bunday artikul bor» |
| `VERSION_CONFLICT` | 409 | `If-Match` eskirgan — `current` bilan | [4.5](#ifmatch) |
| `IDEMPOTENCY_MISMATCH` | 409 | Kalit boshqa tana bilan ishlatilgan | Frontend xatosi: yangi amalga yangi kalit |
| `SHIFT_ALREADY_OPEN` / `SHIFT_NOT_OPEN` | 409 | Smena allaqachon ochiq / yopiq | Smena holatini qayta so‘rash |
| `PO_ALREADY_RECEIVED` / `PO_CANCELLED` | 409 | Buyurtmaga tovar kela boshlagan (qisman yoki to‘liq) — tahrir/bekor/o‘chirish/qayta qabul yo‘q; yoki buyurtma bekor qilingan | Holatni yangilash |
| `QUOTE_ALREADY_CONVERTED` | 409 | Taklif allaqachon sotuvga aylantirilgan | Chekka havola (`saleId`) |
| `SALE_ALREADY_CANCELLED` | 409 | Chek allaqachon bekor | Ro‘yxatni yangilash |
| `SALE_NOT_CANCELLABLE` | 409 | Chekda qaytarish (`meta.reason: "returns"`) yoki qarz to‘lovi (`"payments"`) bor | «Avval qaytarishni bekor qiling» / «qarz to‘langan» |
| `EMPLOYEE_HAS_USER` | 409 | Xodimning kirish hisobi bor: xodimni o‘chirish yoki ikkinchi hisob. `POST /users` da `errors[0].meta: { userId, deleted }` | `deleted: true` — «Tiklash» (`POST /users/{userId}/restore`); aks holda avval hisobni o‘chirish |
| `ROLE_IN_USE` | 409 | Rolni o‘chirish — unda hisoblar bor (o‘chirilganlari ham): `errors[0].meta.users`, `field: replaceWith` | «Qaysi rolga o‘tkazamiz?» → `DELETE /roles/:id?replaceWith=` |
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
| `PAYMENT_EXCEEDS_DEBT` | 422 | To‘lov qarzdan (mijoz yoki ta’minotchi) ko‘p: `meta.outstanding` (`cost.view` siz rolda ta’minotchi qarzi yo‘q), `requested` | Qolgan qarzni taklif qilish |
| `PAYMENT_EXCEEDS_TOTAL` | 422 | Karta + o‘tkazma chekdan ko‘p (qaytim faqat naqddan) | — |
| `DISCOUNT_LIMIT` | 422 | Chegirma chegaradan ko‘p: `meta.reason` — `policy` (`maxDiscountPct`, ro‘yxat narxiga nisbatan) yoki `cost` (minimal narx — tannarx + marja, `meta.minPrice`); `meta.max` — shu maydonga mumkin bo‘lgan chegirma, `requested`; `field` — `discount`, `items[i].discount` yoki `items[i].price` ([10.1](#pos)) | Maksimumni ko‘rsatish; `cost` — «minimal narx N so‘m» |
| `TOTAL_MISMATCH` | 422 | Ekrandagi jami ≠ server hisobi (`meta.client`, `server`) — chek YOZILMAGAN | Qayta hisoblab, yangi jamini ko‘rsatish |
| `PO_OVER_RECEIVE` | 422 | Buyurtmadan ko‘p qabul | — |
| `QUOTE_STOCK_SHORT` | 422 | Taklifni aylantirishga qoldiq yetmaydi (`errors[]` — qaysi tovar) | — |
| `SALE_NOT_RETURNABLE` | 422 | Qaytarish hujjatidan qaytarib bo‘lmaydi | — |
| `RETURN_EXCEEDS_SOLD` | 422 | Qaytarish sotilgandan ko‘p (`meta.sold`, `returned`, `requested`) | — |
| `LAST_ADMIN` | 422 | Oxirgi administratorni o‘chirish/bo‘shatish/rolini olish | — |
| `SELF_DELETE` / `SELF_ROLE_CHANGE` | 422 | O‘zini o‘chirish / o‘z rolini o‘zgartirish | Tugmani yashiring |
| `ROLE_PROTECTED` | 422 | Tizim rolini o‘zgartirib bo‘lmaydigan qilib tahrir: `admin` rolining har qanday tahriri; boshqa tizim rolining nomi (`field: name`); tizim rolini o‘chirish | `admin` — faqat ko‘rish; tizim rolida nom maydoni o‘chiq, «O‘chirish» yo‘q |
| `FILE_REJECTED` | 422 | Fayl tarkibi e’lon qilingan MIME/xeshga mos emas — karantinda (`meta.id`) | «Fayl buzilgan yoki turi noto‘g‘ri» |
| `INVALID_STATUS_TRANSITION` | 422 | Yetkazish holati orqaga (`meta.from/to`); do‘kon o‘chirish muhlatida emas; murojaat yopilgan ([8.5](#support)) | — |
| `REFERENCE_NOT_FOUND` | 422 | Tanadagi havola (kategoriya, mijoz, mahsulot, rol `roleId`, `replaceWith`…) yo‘q yoki boshqa do‘konniki — `errors[].field`; xodimi o‘chirilgan hisobni tiklash (`field: employeeId`) | Tanlovni yangilash |
| `SHIFT_REQUIRED` | 423 | Smena ochilmagan (sotuv, qaytarish, naqd amal) | Smena ochish oynasi |
| `TENANT_READ_ONLY` | 423 | Do‘kon `suspended`/`deleting` — yozish yopiq (`meta.status`) | Banner + to‘lov/qaytarish tugmasi |
| `AUTH_ACCOUNT_LOCKED` | 423 | Xodim ishdan bo‘shatilgan (login/refresh) | Login sahifasida xabar |
| `RECIPIENT_UNREACHABLE` | 422 | Mijozga yetkazib bo‘lmaydi (xabar, chek, Telegram havolasi): `meta.reason` — `not_linked` (botga ulanmagan), `blocked` (botni bloklagan), `no_customer` (chekda mijoz yo‘q), `no_channel` (bot/SMS sozlanmagan); guruhda `meta.unreachable` | «Telegram’ga ulash» (shaxsiy QR) |
| `MESSAGE_LIMIT_EXCEEDED` | 429 | Kunlik SMS chegarasi (`meta.limit`, `used`, `requested`); egasiga murojaat — 24 soatda 5 ta xabar (`meta.limit`, `used`) | — |
| `INTERNAL` | 500 | Kutilmagan xato (tafsilot loglarda, `traceId` bo‘yicha) | Xato kodi bilan |

---

<a id="tenant"></a>

## 8. Do‘kon holati, tarif chegaralari va to‘lov

### 8.1 Holatlar

| `status` | Qachon | Nima mumkin |
|----------|--------|-------------|
| `active` | Oddiy holat | Hammasi |
| `suspended` | Pullik tarif muddati (`planExpiresAt`) + 3 kun imtiyoz o‘tdi (har kecha 01:00 da tekshiriladi) | Faqat O‘QISH + to‘lov (`POST /billing/invoices`), zaxira, chiqish, parol |
| `blocked` | Platforma egasi do‘konni blokladi (sabab — `GET /tenants/current` → `blockedReason`) | Faqat O‘QISH, zaxira, chiqish, parol, egasiga murojaat ([8.5](#support)). To‘lov blokni OCHMAYDI (tarif uzayadi, holat qoladi); do‘kon o‘zi blokni olib tashlay olmaydi — egasiga murojaat yuboradi |
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
`blocked` — «Do‘kon platforma tomonidan to‘xtatilgan — faqat o‘qish» + admin uchun `blockedReason`,
«Egasiga murojaat» tugmasi va egasining aloqasi `support` ([8.5](#support); to‘lash tugmasi blokni ochmaydi);
`deleting` — «Do‘kon {deletionScheduledAt} da o‘chiriladi» + «Bekor qilish» (admin). To‘lov yoki
bekor qilishdan keyin holatni yangilash uchun `POST /auth/refresh` yoki `GET /auth/me` ni qayta
chaqiring (yoki 423 dagi `meta.status` ga tayaning). Platforma holatni o‘zgartirganda (blok, tarif)
`tenant.status` realtime hodisasi keladi ([9.2](#realtime)) — `GET /auth/me` va `GET /tenants/current`
ni qayta so‘rang. O‘chirishdan qaytganda (`restore`) blok bo‘lsa holat `blocked` ga qaytadi.

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
`GET /billing/invoices` da `provider` `payme`/`click` dan tashqari `cash`, `transfer`, `bonus` ham bo‘lishi
mumkin — platforma egasi qo‘lda yozgan to‘lov (naqd, o‘tkazma, bonus muddat); ro‘yxatda shunday ko‘rsating.

### 8.4 Do‘konni o‘chirish

`POST /tenants/current/delete { password }` → `status: deleting`, `deletionScheduledAt` (+30 kun).
Muhlat ichida `POST /tenants/current/restore` qaytaradi (tarif muddati o‘tgan bo‘lsa — `suspended`).
Muhlat tugagach barcha ma’lumot va fayllar butunlay o‘chadi. O‘chirishdan oldin zaxira taklif
qiling (`GET /backup/export`).

<a id="support"></a>

### 8.5 Platforma egasiga murojaat

Bloklangan (yoki boshqa) do‘kon administratori egasiga tizim ichidan yozadi — telefonga javob bo‘lmasa ham xabar
yo‘qolmaydi (egasiga Telegram orqali darhol yetadi), javob shu yerda ko‘rinadi. Faqat administrator; faqat-o‘qish
holatida (`blocked`, `suspended`, `deleting`) ham ishlaydi.

| So‘rov | Nima |
|---|---|
| `GET /tenants/current/requests` | Tarix (20 tagacha, eng yangisi birinchi) — massiv `TenantRequestDto`, har birida `messages[]` (`author`: `store` — do‘kon, `platform` — egasi/operator; `authorName`, `body`, `createdAt`). Yopilmagani (`status ≠ closed`) — ko‘pi bilan bittasi |
| `POST /tenants/current/requests { type, message, phone? }` | 201 `TenantRequestDto`. `type`: `unblock` «Blokdan chiqarish», `billing` «To‘lov masalasi», `other` «Boshqa»; `message` 1–1000 belgi; `phone` ixtiyoriy (`+998901234567`). 409 `ALREADY_EXISTS` (`errors[0].meta.requestId`) — yopilmagani bor, unga yozing; 429 `MESSAGE_LIMIT_EXCEEDED` — 24 soatda 5 ta xabar |
| `POST /tenants/current/requests/:id/messages { message }` | Qo‘shimcha gap yoki egasi javobiga javob → 201 `TenantRequestDto`, holat yana `open`. 422 `INVALID_STATUS_TRANSITION` — yopilgan, yangisini oching |

`status`: `open` — egasi javobini kutmoqda; `answered` — egasi javob berdi; `closed` — egasi yopdi (yangi xabar
yozilmaydi, kerak bo‘lsa yangi murojaat ochiladi).

**UI.** Faqat-o‘qish bannerida (admin) «Egasiga murojaat» tugmasi: yopilmagan murojaat bo‘lsa — oyna uni ko‘rsatadi
(xabarlar chat ko‘rinishida, javob maydoni), bo‘lmasa — forma (`blocked` da sukut `type: unblock`, telefon maydoni
administrator telefoni bilan to‘ldirilgan). Egasi javob berganda yoki yopganda `tenant.request` hodisasi keladi
([9.2](#realtime)) — ro‘yxatni qayta so‘rang, bannerda «Egasi javob berdi» ko‘rsating. «Tarif va hisob» sahifasida ham
«Murojaatlar» bo‘limi (tarix, yangi murojaat). Egasining aloqasi — `GET /tenants/current` → `support { phone, telegram, hours }`
(hammasi `null` bo‘lishi mumkin): bannerda va oynada ko‘rsating (`tel:` — raqamlarni oling, Telegram — `https://t.me/<telegram>`);
hisobsiz sahifalar (yopiq ro‘yxatdan o‘tish) uchun `GET /tenants/registration` → `support`.

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

Yukda FAQAT identifikatorlar (tannarx kabi maydonlar rol ruxsatini chetlab o‘tmasligi uchun). Mijoz
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
| `settings.updated` | `{}` | `PATCH /settings` (rang, logotip, nom …), logotip faylini o‘chirish | `GET /settings` (brend rangi va logotip sahifa yangilanmasdan o‘zgaradi) |
| `access.changed` | `{}` | Rol ruxsatlari tahriri (`PATCH /roles/:id`), rolni o‘chirish, foydalanuvchiga boshqa rol (`PATCH /users/:id`) | `GET /auth/me` (o‘z `permissions` i — menyu va tugmalar), `GET /roles`, `GET /users`. Refresh CHAQIRILMAYDI ([6.5](#access-changed)) |
| `tenant.status` | `{ status, plan }` | Platforma egasi: blok / blokdan chiqarish, tarif yoki qo‘lda to‘lov, o‘chirish / qaytarish ([8.1](#tenant)) | `GET /auth/me` (`user.tenant.status` — banner), `GET /tenants/current` (tarif, `blockedReason`), `GET /billing/invoices` |
| `tenant.request` | `{ requestId, status }` | Platforma egasi do‘kon murojaatiga javob berdi (`answered`) yoki yopdi (`closed`) ([8.5](#support)) | `GET /tenants/current/requests` (banner, murojaat oynasi) |

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

**Oldingi shartlar:** ochiq smena (aks holda 423 `SHIFT_REQUIRED`); `sales.create`.

**Summa hisobi** (`@crm/shared` → `lineTotal`, `saleTotals`; server AYNAN shunday hisoblaydi):

1. Qator narxi: berilmasa — `priceTier` bo‘yicha (`retail` → `price`, `wholesale` → `wholesalePrice`;
   `wholesaleEnabled=false` bo‘lsa har doim `retail`), tanlangan birlikka o‘giriladi
   (`priceForUnit`). `wholesale.view` siz rol (sukut — sotuvchi) ulgurji narxda faqat `sellerWholesaleEnabled`
   bilan sotadi: o‘chiq bo‘lsa `wholesalePrice` unga kelmaydi va `priceTier: "wholesale"` — 403 `PERMISSION_DENIED` (ulgurji tugmasini
   yashiring, [6.6](#hidden)). `price` berilsa — savdolashilgan narx (eski narx bo‘lsa ham qabul qilinadi,
   `TOTAL_MISMATCH` ushlamaydi), lekin chegirma siyosati va minimal narxga bo‘ysunadi (4-band). Shuning uchun `price`
   ni FAQAT kassir narxni qo‘lda o‘zgartirganda yuboring.
2. `qator jami = round(narx × miqdor) − qator chegirmasi` (qator chegirmasi qator summasidan oshmaydi).
3. `subtotal = Σ qator jami`.
4. **Chegirma chegaralari** (T-141) — qo‘lda narx, qator chegirmasi va umumiy chegirma BITTA qoidada, xato — 422
   `DISCOUNT_LIMIT` (`field`: `items[i].discount`, `items[i].price` yoki `discount`; `meta.max` — shu maydonga mumkin
   bo‘lgan chegirma, `meta.requested`, `meta.reason`):
   - **Minimal narx** (`reason: "cost"`): `minPrice = round(cost × (1 + minMarginPct / 100))` (`@crm/shared` → `floorPrice`;
     tannarx sotuv birligiga moslangan, `minMarginPct` — sozlama, sukut 0 = tannarxning o‘zi). Qator summasi
     `≥ round(minPrice × miqdor)`, `subtotal − umumiy chegirma ≥ Σ round(minPrice × miqdor)`; `meta.minPrice` — birlik minimal
     narx. Tannarxi 0 tovar cheklanmaydi (`GET /products?noCost=true`, `summary.withoutCost`). `sales.belowCost` ruxsati
     bo‘lsa chegara o‘tiladi — chek jurnalga `sale.belowCost` bilan tushadi (sukutda hech bir rolda yo‘q, administrator beradi).
     Bonus (ball) minimal summaga kirmaydi.
   - **Chegirma foizi** (`reason: "policy"`): `maxDiscountPct` ro‘yxat narxiga nisbatan — qatorda `ro‘yxat narx × miqdor − qator
     jami ≤ round(ro‘yxat summa × pct / 100)` (qo‘lda narx ham chegirma deb sanaladi; ro‘yxatdan qimmat — chegirma emas), umumiy
     chegirma uchun qolgan joy `round(ro‘yxat subtotal × pct / 100) − qatorlarda berilgani`. Sukut 100% — cheklamaydi.
     Ruxsatdan qat’i nazar, administrator uchun ham.
   - UI: chegirma maydonini `meta.max` bilan, narx maydonini `meta.minPrice` bilan cheklang; taklif yaratishda (`POST /quotes`)
     ham shu qoida, aylantirishda qayta tekshirilmaydi (yaratuvchi huquqi bilan tekshirilgan).
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

**Bekor qilish** — `POST /sales/:id/cancel` (`sales.cancel`; sukut — admin, manager). Qaytarish — `sales.return`:

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
  turlari bo‘yicha, naqd kirim/chiqim, xarajat, xodimlarga naqd to‘lovlar — `salaryPayments` ([10.22](#payroll)),
  qarz va ta’minotchi to‘lovlari, kutilgan balans).
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
| `POST /payroll/payments`, `DELETE /payroll/entries/:id`, `.../restore` | `method: cash` to‘lov (yaratish, o‘chirish, tiklash) |

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
  [6.6](#hidden)); pul ustunlarini `field in obj` bilan yashiring.

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
  Holatni o‘zgartirish: `deliveries.edit` bor rol (sukut — admin, manager, **sotuvchi**) — HAR QANDAY
  yetkazishni; `edit` siz rol (haydovchi, omborchi) — faqat o‘ziga biriktirilganini (aks holda 403).
- `GET /deliveries/route?date&driverId` — marshrut varaqasi (olinadigan pul bilan).
- `overdue: true` — `scheduledDate` o‘tgan faol yetkazish. Tahrir — faqat faol holatda.

### 10.10 Xarajatlar

- Kategoriyalar: `rent`, `utilities`, `salary`, `transport`, `tax`, `other`; usul: `cash` (kassadan) | `bank`.
  Xodimlar maoshi uchun alohida hisob bor — [10.22](#payroll): hisoblangan maosh foyda hisobotida `salary`
  kategoriyasiga o‘zi qo‘shiladi, to‘lov esa xodim varag‘iga yoziladi. `salary` kategoriyali qo‘lda xarajat
  eski usul — maosh hisobiga o‘tgan do‘konda uni ishlatmang (xarajat ikki marta sanaladi).
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

- **Xodim** (`/employees`) — shaxs: ism, lavozim, telefon, maosh (`salary` — `salary.view` bilan,
  sukut — admin, manager), holat `active | on_leave | fired`, ishga kirgan sana. `fired` — tizimga kira olmaydi.
  Maosh sozlamalari (`salary.view` bilan, [10.22](#payroll)): `salaryDay` (1–28, sukut 1 — o‘tgan oy maoshi
  hisoblanadigan kun), `salesBonusPct` (0–100, 2 kasr — savdodan bonus), `payrollFrom` (hisob boshlanadigan sana,
  sukut — `hiredAt`; undan oldingi oylar avtomatik hisoblanmaydi).
- **Foydalanuvchi** (`/users`) — kirish hisobi: email, parol, rol (`roleId`), `isActive`; mavjud xodimga 1:1
  bog‘lanadi. Ism va lavozim xodimdan keladi (foydalanuvchida takrorlanmaydi). Hisob ochish: avval xodim,
  keyin `POST /users { employeeId, email, password, roleId }` (rollar — `GET /roles`, [6.4](#roles-api)). Hisobsiz xodim — `EmployeeDto.userId === null`
  (hisobi O‘CHIRILGAN xodim ham `null` ko‘rinadi — unga yangi hisob ochilmaydi: 409 `EMPLOYEE_HAS_USER`,
  `errors[0].meta: { userId, deleted: true }` → yangisi o‘rniga «Tiklash» taklif qiling).
- **O‘chirilgan hisoblar:** `GET /users?deleted=true` — faqat o‘chirilganlar (`deletedAt` bilan; qidiruv,
  saralash, sahifalash odatdagidek) → «Tiklash» — `POST /users/:id/restore`. Parol, rol va email
  o‘zgarmaydi, eski sessiyalar qaytmaydi (qayta kiradi); faol hisob tarif joyini oladi (402). Xodimi ham
  o‘chirilgan bo‘lsa — 422 `REFERENCE_NOT_FOUND` (`field: employeeId`): avval `POST /employees/:id/restore`.
- Email do‘kon ichida noyob; bir email bir necha do‘konda bo‘lishi mumkin (login’da do‘kon tanlanadi).
- Himoya: oxirgi admin (422 `LAST_ADMIN`), o‘zini o‘chirish (`SELF_DELETE`), o‘z rolini o‘zgartirish
  (`SELF_ROLE_CHANGE`), o‘zidan kengroq rol (403, [6.4](#roles-api)); tarif chegarasi (402).
- Yangi rol va faolsizlantirish o‘sha foydalanuvchining keyingi so‘rovidanoq kuchga kiradi ([6.5](#access-changed)).

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
  (masalan boshqa messenjer) ham yuborish mumkin. Huquq: `customers.edit`.
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
  `no_channel`; 503 — Telegram javob bermadi (qayta urinish). Huquq: `sales.view`.

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

<a id="reports"></a>
### 10.14 Hisobotlar

- Barcha raqamlar SERVERDA; brauzerda `reduce` bilan yig‘ilmaydi. Tushum qoidasi (I4): bekor
  qilinmagan sotuvlar (nasiya ham), qaytarishlar ayiriladi — dashboard jamlari va P&L `current`/`previous`
  da bir xil. P&L `trend`, top ro‘yxatlar va `/analytics` — YALPI sotuv (qaytarishsiz); `trend` faqat
  sotuv bo‘lgan kunlarni o‘z ichiga oladi (bo‘sh kunlarni grafikda 0 bilan to‘ldiring).
- `GET /dashboard?days=7|30|90` — bugun/kecha, debitor (`receivables`, `debtors`), kreditor
  (`payables` — `cost.view` siz yo‘q), kam qolganlar, trend, top mahsulot/qarzdor, oxirgi cheklar.
- `GET /reports/pnl?from&to&limit` — davr ≤ ~3 yil («butun davr» = so‘nggi 3 yil); oldingi teng davr
  bilan solishtirish (`change`), `granularity` (kun/oy), to‘lov turlari, xarajat kategoriyalari, top
  mahsulotlar, sotuvchilar (`sellers`) va sotilmayotgan tovar (`deadStock`) — uchalasining uzunligi `limit`
  bilan (sukut 20, ≤ 100; tushum bo‘yicha kamayish tartibida).
- `GET /analytics?from&to` — ABC (80/95 %) — sotilgan BARCHA mahsulot (jadvalni brauzerda sahifalang),
  kategoriya va to‘lov taqsimoti, trend. `limit` parametri yo‘q (yuborilsa 400).
- `expenses` (dashboard va P&L) = xarajatlar jurnali + hisoblangan maosh (`salary` kategoriyasi — maosh, bonus,
  mukofot, jarima manfiy; [10.22](#payroll)); xodimlarga to‘lovlar (avans, maosh) xarajat emas. `GET /expenses/summary`
  faqat jurnalni sanaydi — shuning uchun «Xarajatlar» sahifasi va P&L `expenses` farq qilishi mumkin.
- Foyda/tannarx maydonlari `profit.view` / `cost.view` siz rolda yo‘q ([6.6](#hidden)). Tugagan davrlar keshlanadi, bugun — jonli.

### 10.15 Audit jurnali

`GET /audit` (admin) — kursorli. Filtrlar: `userId`, `group` (amal prefiksi: `sale` → `sale.create`,
`sale.return`, `sale.cancel`), `entityId` (bitta yozuv tarixi), sana, `q`. `diff` — o‘zgarish (maxfiy
maydonlarsiz), `user: null` — tizim (fon ishi). Amallar: `sale.create|return|cancel|belowCost`,
`shift.open|close`, `debt.pay`, `stock.intake|writeoff|adjust|transfer`, `po.create|update|delete|restore|cancel|pay`,
`quote.create|update|delete|restore|convert`, `delivery.create|update|delete|restore|status`,
`expense.create|update|delete|restore|recurring`, `expense-template.*`, `payroll.run|accrual|payment|delete|restore`,
`product.create|update|delete|restore|import|bulk_price`,
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
| `store_logo` | `image/jpeg`, `image/png`, `image/webp` | 1 MB | yuklash — `settings`; o‘qish — barcha rollar |
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
   Logotip — `PATCH /settings { logoFileId }` ([10.21](#settings)).

**Ko‘rsatish:** `<img src>` `Authorization` yubora olmaydi → `GET /files/urls?ids=a,b,c&variant=128`
(≤ 100 id, BITTA so‘rov) → `{ urls: { id: signedUrl }, expiresAt }`; havolalar 10 daqiqa amal qiladi
(keshni ~9 daqiqa). Variantlar: `128` (ro‘yxat), `512` (karta), `orig`; variant hali tayyor bo‘lmasa —
asl fayl. Variantlar WebP, shaffoflik saqlanadi; logotipda — uzun tomoni 128/512 (keng logotip ham sig‘adi). Yo‘q/tayyor emas/huquq yetmagan fayl javobda bo‘lmaydi (bitta buzuq rasm sahifani yiqitmaydi).
`GET /files/:id/raw` — 302 (token talab qiladi, `<img>` uchun emas).

Takroriy tarkib (bir xil `sha256` + `kind`) qayta saqlanmaydi. O‘chirilgan fayl 30 kundan keyin tozalanadi.
S3 bucket CORS’i frontend domeniga `PUT` (yuklash) va `GET` (logotipni `fetch()` qilish) uchun ruxsat
berishi kerak (lokal MinIO — ochiq; production — `infra/r2-cors.json`).

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
- Ustunlar rol ruxsatiga qarab (tannarx `cost.view` siz chiqmaydi); qiymatlar xom (so‘m — butun, miqdor — son).
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

<a id="settings"></a>

### 10.21 Sozlamalar va dastlabki sozlash

`GET /settings` — ilova ochilganda (hamma rol). Maydonlar: `storeName`, `currency`, `taxEnabled`,
`taxRate`, `wholesaleEnabled`, `sellerWholesaleEnabled`, `loyaltyEnabled`, `loyaltyRate`, `maxDiscountPct`,
`minMarginPct` (minimal marja, [10.1](#pos)), `receiptPhone`, `receiptAddress`, `receiptFooter`, `onboarded`, `brandColor`,
`logoFileId`. `PATCH /settings` —
faqat o‘zgarganlarini; muvaffaqiyatdan keyin hodisa `settings.updated` ([9.2](#realtime)). `storeName` do‘kon
nomini ham o‘zgartiradi (kirishdagi do‘kon tanlovi, `/auth/me` dagi `tenant.name`).

**Brend** (do‘kon logotipi va asosiy rangi):
- `brandColor` — `#RRGGBB`, server katta harfga o‘tkazadi (`#1a7f5a` → `#1A7F5A`); `null` — standart rang.
  Boshqa ko‘rinish (`red`, `#12345`) — 400 `VALIDATION_FAILED` (`field: brandColor`).
- `logoFileId` — `store_logo` fayli: yuklash [10.16](#files) oqimi bilan (`kind: "store_logo"`, faqat
  `settings` huquqi — admin, menejer), keyin `PATCH /settings { logoFileId }`. Begona, tasdiqlanmagan yoki
  boshqa turdagi fayl — 400 `VALIDATION_FAILED` (`field: logoFileId`). Almashtirilsa yoki `null` bo‘lsa eski
  fayl o‘chiriladi (kvota bo‘shaydi). Ko‘rsatish — `GET /files/urls?ids=<logoFileId>&variant=128|512`
  (barcha rollar). Server chekida (`GET /sales/:id/receipt?format=pdf`, Telegram’dagi chek) logotip
  do‘kon nomi ustida, oq-qora; `ReceiptDto.store.logoFileId`.
- Ikkala kalit `GET /settings` javobida DOIM bor (sozlanmagan bo‘lsa `null`).
`sellerWholesaleEnabled` (sukut `false`) — «Sotuvchiga ulgurji narxda sotishga ruxsat»: yoqilsa sotuvchi
`wholesalePrice` ni ko‘radi va ulgurji chek qila oladi ([6.6](#hidden)); faqat `wholesaleEnabled` bilan
ma’noga ega.
Ro‘yxatdan o‘tgan yangi do‘konda `onboarded: false` → sehrgar (do‘kon ma’lumoti, QQS, ombor,
kategoriyalar, birinchi mahsulotlar, xodimlar) → oxirida `PATCH /settings { onboarded: true }`.

<a id="payroll"></a>
### 10.22 Maosh hisobi (T-142)

Har xodim uchun bitta **varaq** (`payroll_entries`): ishlab topilgani va to‘langani alohida, qoldiq
ko‘chib yuradi. Yozuv turlari:

| Tur | Nima | Ta’siri |
|-----|------|---------|
| `salary` | Hisoblangan maosh (avtomatik yoki qo‘lda) | ishlab topilganiga **+**, foyda hisobotida `salary` xarajati |
| `bonus` | Savdodan bonus (avtomatik) | **+**, xarajat |
| `award` | Mukofot (qo‘lda) | **+**, xarajat |
| `penalty` | Jarima / ushlab qolish (qo‘lda) | **−** (xarajatni kamaytiradi) |
| `advance` | Avans — oy ichida berilgan pul | to‘langaniga **+**; `cash` — kassadan chiqadi |
| `payment` | Maosh to‘lovi | to‘langaniga **+**; `cash` — kassadan chiqadi |

`earned = salary + bonus + award − penalty`, `paid = advance + payment`, **qoldiq** `= earned − paid`
(musbat — do‘kon xodimga qarz, manfiy — xodim oldindan olgan). Hisob `@crm/shared` → `payrollTotals`,
`proratedSalary`, `salesBonus`, `accrualPeriod` — brauzerda oldindan ko‘rsatish uchun ham.

**Avtomatik hisoblash** (tungi ish, har kuni 00:10 Toshkent; qo‘lda — `POST /payroll/run-due`):
- Xodimning `salaryDay` (sukut 1) kelganda **o‘tgan oy** uchun yoziladi: `salary` = `employees.salary`
  (oy ichida ishga kirgan — kunlarga mutanosib, `note: "15/30 kun"`, `baseAmount` — to‘liq maosh) va
  `bonus` = round(o‘tgan oy sotuvlari − qaytarishlar (I4 tushum, QQS bilan; qaytarish asl chek sotuvchisidan
  ayriladi) × `salesBonusPct` / 100) (`baseAmount` — savdo, `rate` — foiz). Faqat `active` xodim, `salary > 0`
  yoki `salesBonusPct > 0`, `payrollFrom` va `hiredAt` davr oxiridan kech bo‘lmasa.
- Yozuv sanasi — o‘tgan oyning **oxirgi kuni** (`date: 2026-09-30`, `period: "2026-09"`): sentabr maoshi
  sentabr foydasidan ayriladi, hisoblash kuni oktabrda bo‘lsa ham. `auto: true`.
- Davrga **bir marta** (xodim + sana + tur): qayta ishga tushirish, parallel ikki instansiya — takrorlamaydi.
  O‘chirilgan avtomatik yozuv ham qayta hisoblanmaydi — kerak bo‘lsa qo‘lda `salary`/`bonus` yoziladi.
- Mavjud xodimlarga o‘tishda `payrollFrom` = o‘tish kuni: avvalgi oylar (xarajat sifatida yozilgan)
  ikkinchi marta hisoblanmaydi; egasi sanani orqaga surib, o‘tgan oyni ham hisoblatishi mumkin.

**Endpointlar** (`payroll.view` — ko‘rish; `payroll.accrue` — hisoblash; `payroll.pay` — to‘lov):
- `GET /payroll?period=YYYY-MM` (sukut — joriy oy) — **oylik varaq**: har xodim uchun sozlamalar, `opening`
  (davr boshidagi qoldiq), `accruedSalary`, `bonus`, `award`, `penalty`, `earned`, `advance`, `payment`,
  `paid`, `closing`, `accrued` (shu davr uchun avtomatik hisoblash bo‘lgan) + `totals`. Bo‘shatilgan xodim
  faqat davrda yozuvi yoki qoldig‘i bo‘lsa. Bitta so‘rov.
- `GET /payroll/entries?employeeId&type&dateFrom&dateTo&q&withDeleted` — yozuvlar (xodim varag‘i), sahifali.
- `POST /payroll/accruals { employeeId, type: salary|bonus|award|penalty, amount, date?, note? }` — qo‘lda
  hisoblash (kassaga ta’sirsiz). `date` berilmasa — bugun; yozuv sanasi qaysi oyda bo‘lsa, shu oy varag‘ida.
- `POST /payroll/payments { employeeId, type: advance|payment, amount, method: cash|bank, date?, note? }` —
  `Idempotency-Key` bilan; `cash` — ochiq smena shart (423), smena hisobotida `salaryPayments`.
- `DELETE /payroll/entries/:id`, `POST /payroll/entries/:id/restore` — yumshoq o‘chirish/tiklash; naqd to‘lov
  puli qaytadi / yana chiqadi (ochiq smena). Ruxsat yozuv turiga qarab: to‘lov — `payroll.pay`, hisoblash —
  `payroll.accrue` (aks holda 403). Tahrir yo‘q — o‘chirib qayta yoziladi.
- Bo‘shatilgan xodimga ham yoziladi (hisob-kitobni yakunlash), o‘chirilganiga — 404.

**Foyda hisoboti va bosh sahifa:** `expenses` = xarajatlar jurnali + hisoblangan maosh (`salary`, `bonus`,
`award`, `penalty` — manfiy) `salary` kategoriyasida ([10.14](#reports)). To‘lovlar (`advance`, `payment`)
xarajat emas — ular kassa harakati. `GET /expenses/summary` esa faqat xarajatlar jurnalini sanaydi.

**UI tavsiyasi:** Xodimlar → «Maosh» sahifasi: oy tanlash, varaq jadvali (qoldiq ustuni), qatorda «Avans»,
«To‘lash» (naqd/bank), «Mukofot/Jarima» tugmalari; xodim kartasida yozuvlar ro‘yxati (`auto` belgisi,
`baseAmount`/`rate` — «134 400 × 2 %»); sozlamalarda `salaryDay`, `salesBonusPct`, `payrollFrom`.
Jurnal: `payroll.run` (avtomatik, `diff.entries`), `payroll.accrual`, `payroll.payment`, `payroll.delete|restore`.

---

<a id="screens"></a>

## 11. Ekran → endpoint xaritasi

Frontenddagi mavjud sahifalar (`src/pages`) va ular chaqiradigan API. Qavsdagi ruxsat — sahifaning o‘zi
(tugmalar — [6.7](#permission-ui)). «Hodisa» — sahifa qaysi realtime hodisada yangilanadi.

| Sahifa (yo‘l, huquq) | Ochilganda | Amallar | Hodisa |
|---|---|---|---|
| **Login** (`/login`) | — | `POST /auth/login` (+ do‘kon tanlash), keyin `GET /settings` | — |
| **Ro‘yxatdan o‘tish** (yangi) | — | `POST /tenants/register` → sehrgar: `PATCH /settings`, `POST /warehouses`, `/categories`, `/products`, `/employees`, `/users` | — |
| **Ilova qobig‘i** (Header, UserMenu, Sidebar) | `POST /auth/refresh` (token yo‘q bo‘lsa), `GET /settings`, socket ulanishi; admin — `GET /tenants/current` (banner, `support`), faqat-o‘qishda `GET /tenants/current/requests`; menyu — `user.permissions` | `POST /auth/logout`, `/auth/logout-all`, `/auth/change-password`; banner: «Egasiga murojaat» — `POST /tenants/current/requests`, `POST /tenants/current/requests/:id/messages` ([8.5](#support)) | `access.changed` → `GET /auth/me`; `settings.updated` → `GET /settings`; `tenant.status` → `GET /auth/me`; `tenant.request` → `GET /tenants/current/requests` |
| **Dashboard** (`/`, `reports.view`) | `GET /dashboard?days=30` | davr 7/30/90 | `sale.*`, `debt.paid`, `po.received`, `stock.changed` |
| **POS** (`/pos`, `sales.create`) | `GET /cash/shifts/current`, `GET /warehouses?archived=false`, `GET /categories`, `GET /products?warehouseId&categoryId&q&pageSize=60`, `GET /files/urls` | mijoz: `GET /clients?q=`, `GET /clients/:id/stats`; skaner: `GET /products?q=`; smena: `POST /cash/shifts/open`; to‘lash: `POST /sales` → `GET /sales/:id/receipt` (yoki `?format=pdf`); mijoz botga ulangan bo‘lsa — «Telegram’ga» (`POST /sales/:id/receipt/telegram`) | `sale.*`, `stock.changed`, `shift.*`, `po.received` |
| **Cheklar** (`/sales`, `sales.view`) | `GET /sales` (kursor, filtrlar) | `GET /sales/:id` (`returnedQty`), `GET /sales?relatedSaleId=` (qaytarishlar), `GET /sales/:id/receipt` (JSON yoki `?format=pdf`), `POST /sales/:id/receipt/telegram`, `POST /sales/:id/return`, `POST /sales/:id/cancel`, `GET /exports/sales` | `sale.*`, `debt.paid` |
| **Mahsulotlar** (`/products`, `products.view`) | `GET /products` (server sahifa/saralash), `GET /products/summary`, `GET /categories`, `GET /suppliers` (filtr), `GET /files/urls` | CRUD, `.../restore`, `POST /products/import`, `/products/bulk-price`, rasm (`/files/*`), `GET /exports/products` | `stock.changed`, `sale.*`, `po.received` |
| **Mahsulot kartasi** (`/products/:id`, `products.view`) | `GET /products/:id`, `/products/:id/stats`, `GET /stock/movements?productId=`, `audit.view`: `GET /audit?entityId=` | tahrir, rasm | `stock.changed` (shu id) |
| **Ombor** (`/warehouse`, `stock.view`) | `GET /warehouses`, `GET /warehouses/stock`, `GET /stock/movements`, `GET /stock/reorder-suggestions` | `POST /stock/intake`, `/writeoff`, `/adjust`, `/transfer`, ombor CRUD/arxiv, `GET /exports/stock-movements` | `stock.changed`, `sale.*`, `po.received` |
| **Yetkazish** (`/deliveries`, `deliveries.view`) | `GET /deliveries`, `/deliveries/summary`; haydovchi: `GET /deliveries/my`; `employees.view`: `GET /employees?status=active` | `POST/PATCH/DELETE /deliveries`, `.../status`, `.../restore`, `GET /deliveries/route` | `delivery.status`, `sale.*` |
| **Takliflar** (`/quotes`, `quotes.view`) | `GET /quotes`, `/quotes/summary` | CRUD, `.../restore`, `POST /quotes/:id/convert` (`warehouseId` — tanlangan ombor), chop etish (`GET /quotes/:id` + `GET /settings`) | `sale.created` |
| **Ta’minotchilar** (`/suppliers`, `suppliers.view`) | `GET /suppliers`, `/suppliers/summary` (`cost.view` siz qarz yo‘q) | CRUD, `.../restore` | `po.received` |
| **Ta’minotchi kartasi** (`/suppliers/:id`, `suppliers.view`) | `GET /suppliers/:id` | tahrir, buyurtma yaratish | `po.received` |
| **Xaridlar** (`/purchases`, `purchases.view`) | `GET /purchase-orders`, `/purchase-orders/summary` (`cost.view` siz summalar yo‘q), `GET /suppliers`, `GET /stock/reorder-suggestions` (to‘ldirish) | CRUD, `.../cancel`, `.../receive` (`purchases.receive`), `.../pay` (`purchases.pay`), `.../restore` | `po.received` |
| **Kassa** (`/cash`, `cash.view`) | `GET /cash/shifts/current`, `GET /cash/shifts`, `GET /cash/movements` | `POST /cash/shifts/open`, `/close`, `POST /cash/movements`, `GET /cash/shifts/:id/report` | `shift.*`, `sale.*`, `debt.paid` |
| **Qarzlar** (`/debts`, `debts.view`) | `GET /debts?view=customers` (+ `summary`) | `view=receipts`, `aging`, `overdue`; `POST /debts/payments`, `GET /debts/payments`; eslatma SMS → Xabarlar | `debt.paid`, `sale.*` |
| **Xarajatlar** (`/expenses`, `expenses.view`) | `GET /expenses`, `/expenses/summary`, `GET /expense-templates` | CRUD, `.../restore`, shablon CRUD, `POST /expense-templates/run-due`, `GET /exports/expenses` | — |
| **Hisobotlar** (`/reports`, `reports.view`) | `GET /reports/pnl?from&to` | davr tanlash | — (focus’da yangilash) |
| **Analitika** (`/analytics`, `reports.view`) | `GET /analytics?from&to` | davr tanlash | — |
| **Mijozlar** (`/clients`, `customers.view`) | `GET /clients` (`telegramStatus` — belgi va filtr) | CRUD, `.../restore`, `GET /exports/clients` | `sale.*`, `debt.paid` |
| **Mijoz kartasi** (`/clients/:id`, `customers.view`) | `GET /clients/:id`, `/clients/:id/stats`, `GET /sales?customerId=`, `GET /debts?view=receipts&customerId=`, `GET /debts/payments?customerId=` | tahrir, qarz to‘lovi, xabar, «Telegram’ga ulash» (`POST /clients/:id/telegram-link` → QR) | `sale.*`, `debt.paid` |
| **Xabarlar** (`/messages`, `messages.view`) | `GET /messages`, `GET /telegram` (bot holati) | `POST /messages/preview` (kanal bo‘yicha son), `POST /messages`; ulanmaganlar — `GET /clients?telegramStatus=none` | — |
| **Xodimlar** (`/employees`, `employees.view`) | `GET /employees` | CRUD, `.../restore` | — |
| **Maosh** (`/payroll`, `payroll.view`) | `GET /payroll?period=`, `GET /payroll/entries?employeeId=` | `POST /payroll/accruals`, `POST /payroll/payments`, `POST /payroll/run-due`, `DELETE /payroll/entries/:id`, `.../restore` | — |
| **Foydalanuvchilar** (`/users`, `users.view`) | `GET /users`, `GET /roles` (rol tanlovi va nomi), `GET /employees` (hisobsiz xodimlar: `userId === null`, 10.12 izohi bilan) | CRUD (`roleId`), «O‘chirilganlar» (`GET /users?deleted=true`) → `.../restore`, parolni tiklash | `access.changed` |
| **Rollar** (yangi; `/users/roles` yoki tab, `roles.view`) | `GET /roles`, `GET /roles/catalog` | `POST /roles` (`roles.create`), `PATCH /roles/:id` (`roles.edit`, `If-Match`), `DELETE /roles/:id?replaceWith=` (`roles.delete`) ([6.8](#roles-migration)) | `access.changed` |
| **Sozlamalar** (`/settings`, `settings.view`) | `GET /settings`; admin: `GET /tenants/current`, `GET /files/usage`, `GET /billing/invoices`, `GET /tenants/current/requests` | `PATCH /settings` (shu jumladan «Sotuvchiga ulgurji» — `sellerWholesaleEnabled`); admin: `POST /billing/invoices`, `GET /backup/export`, `POST /tenants/current/delete`, `/restore`, murojaat (`POST /tenants/current/requests`, `…/:id/messages`), migratsiya sehrgari | `tenant.request` |
| **Audit** (`/audit`, `audit.view`) | `GET /audit` (kursor) | filtrlar, `GET /exports/audit` | — |
| **Migratsiya sehrgari** (yangi, admin) | brauzer `localStorage` | `POST /migration/validate`, `POST /migration/import` | — |
| **Bildirishnomalar** (Notifications) | `GET /products?lowStock=true&pageSize=5`, `GET /debts?overdue=true&pageSize=5` (`debts.view`) | — | `stock.changed`, `sale.*`, `debt.paid` |
| **Buyruqlar paneli** (CommandPalette) | — | `GET /products?q=`, `GET /clients?q=` (debounce 250 ms) | — |

«Tez-tez sotiladigan» tugmalari uchun alohida endpoint yo‘q — POS to‘ri server qidiruvi bilan
(kategoriya + `q`), top mahsulotlar `/dashboard` da (`reports.view` bilan).

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
  'settings.updated': ['settings'],
  'access.changed': ['auth-me', 'roles', 'users'],   // auth-me → store'dagi user.permissions yangilanadi
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
| T-102 | Spravochnik sahifalari | Mahsulotlar, Mijozlar, Ta’minotchilar, Xodimlar, Foydalanuvchilar (+ «O‘chirilganlar» va tiklash), Omborlar — serverdan; sahifalash/saralash **serverda**; ko‘rinish o‘zgarmaydi; ruxsatsiz rolda yashirin maydonlar ko‘rinmaydi — [4.3](#lists), [6.6](#hidden) |
| T-103 | Kassa (POS) | Savat lokal; `checkout` — bitta `POST /sales`; server xatosi (qoldiq, limit) kassada aniq ko‘rsatiladi; F9/F2 yorliqlari va skaner ishlaydi; ulgurji tugmasi `wholesale.view` yoki `sellerWholesaleEnabled` ga qarab; chek chop etish (JSON shablon yoki `?format=pdf`) — [10.1](#pos), [12.3](#flows) |
| T-104 | Ombor, kassa, qarz, ta’minot sahifalari | Barcha amallar server orqali; optimistik yangilash xatoda orqaga qaytariladi |
| T-105 | Hisobot va analitika | Hisob **serverdan**; brauzerdagi `reduce` hisoblari olib tashlanadi; grafiklar o‘zgarmaydi — [10.14](#rules) |
| T-106 | Rasm yuklash S3’ga | `resizeImage` maksimal o‘lchami 1600; presign → PUT → confirm; `dataURL` **umuman ishlatilmaydi**; offline’da IndexedDB navbati — [10.16](#files) |
| T-107 | Realtime va uzilishga chidamlilik | Boshqa kassir sotgan tovar qoldig‘i darhol yangilanadi; internet uzilganda ogohlantirish va navbat; tiklanganda avtomatik yuborish — [9](#realtime), [12.4](#flow-offline) |
| T-112 | Migratsiya sehrgari (UI) | 4 qadam (hisob → tekshirish → yuborish → natija); jarayon ko‘rsatkichi; xato bo‘lsa localStorage **o‘chirilmaydi** — [10.19](#migration) |
| T-113 | Orqaga qaytish yo‘li | Migratsiyadan keyin ham localStorage nusxasi 30 kun saqlanadi; JSON zaxira yuklab olinadi — [10.19](#migration) |
| T-134 | Ruxsatlar va «Rollar» sahifasi | Menyu, yo‘l himoyasi, tugmalar va yashirin maydonlar FAQAT `user.permissions` bo‘yicha (rol nomiga qarab shart yo‘q, `role === 'admin'` — faqat [6.3](#admin-only)); hisob formasida rol — `GET /roles` dan, `roleId` yuboriladi; «Rollar» sahifasi `roles.*` ruxsatlari bilan (yaratish, ruxsatlar jadvali katalogdan, tahrir `If-Match` bilan, o‘chirishda hisoblarni ko‘chirish; administrator bo‘lmaganda faqat o‘zida bor ruxsatlar); `access.changed` → `GET /auth/me`, ochiq ilovada menyu sahifa yangilanmasdan o‘zgaradi; ruxsatsiz sahifadan bosh sahifaga — [6](#roles), [6.8](#roles-migration) |

Qo‘shimcha (rejada alohida vazifa emas, lekin kerak): ro‘yxatdan o‘tish sahifasi va dastlabki
sozlash sehrgari (`/tenants/register`, `onboarded`), «Tarif va hisob» sahifasi (tarif, to‘lov, zaxira,
do‘konni o‘chirish, murojaatlar tarixi), faqat-o‘qish banneri («Egasiga murojaat» tugmasi va oynasi — [8.5](#support)),
haydovchi ko‘rinishi (`/deliveries/my`), audit sahifasi (serverdan), eksport tugmalari (server eksporti).

**Brauzerdan olib tashlanadigan narsalar:** lokal store’dagi biznes ma’lumoti (mahsulot, chek,
qoldiq…), demo foydalanuvchilar va parollar, brauzerdagi moliyaviy hisoblar (tushum, qarz, foyda
yig‘indilari — endi server), `dataURL` rasmlar. Brauzerda qoladi: savat, qoldirilgan savatlar,
tanlangan ombor, til, mavzu, offline navbat.

---

<a id="muammolar"></a>

## 14. Ma’lum muammolar va cheklovlar

### 14.1 Backend’da ochiq qolgan masalalar (qaror kutilmoqda)

Hozircha yo‘q. (Avvalgi «narxni qo‘lda o‘zgartirish cheklanmagan» masalasi T-141 bilan yopildi: qo‘lda narx ham
`maxDiscountPct` va minimal narxga bo‘ysunadi — [10.1](#pos).)

### 14.2 Hujjat yozilgach o‘zgarganlar

**2026-10-17** — maosh hisobi (T-142, [10.22](#payroll)); frontendga ta’sir qiladi:

| Avval | Endi | Frontendda |
|-------|------|-----------|
| Xodim kartasidagi `salary` faqat ma’lumot edi; maosh faqat qo‘lda `salary` xarajati sifatida yozilardi, kimga qancha to‘langani ko‘rinmasdi | Har xodimga varaq (`/payroll`): tungi ish `salaryDay` kelganda O‘TGAN OY uchun `salary` (qisman oy — kunlarga) va `bonus` (`salesBonusPct` × oy savdosi) yozadi; qo‘lda `award`/`penalty`; to‘lov `advance`/`payment` (`cash` — kassadan, smena hisobotida `salaryPayments`); qoldiq oydan oyga ko‘chadi. Foyda hisobotida hisoblangan maosh `salary` xarajati, to‘lov emas. `EmployeeDto` + `salaryDay`, `salesBonusPct`, `payrollFrom` (`salary.view` bilan). Yangi ruxsatlar `payroll.view`, `payroll.accrue`, `payroll.pay` — sukutda hech bir rolda yo‘q, administrator rol oynasida beradi — katalog 67 ta | Xodimlar → «Maosh» sahifasi: oy tanlash, `GET /payroll?period=` varag‘i, «Avans»/«To‘lash»/«Mukofot/Jarima» tugmalari, xodim kartasida `GET /payroll/entries?employeeId=`; xodim formasida 3 ta yangi maydon; «Rollar» da yangi bo‘lim; smena hisobotida `salaryPayments` qatori; xarajat formasida `salary` kategoriyasini yashirish (maosh hisobi orqali) |

**2026-10-17** — minimal narx va chegirma siyosati (T-141, [10.1](#pos)); frontendga ta’sir qiladi:

| Avval | Endi | Frontendda |
|-------|------|-----------|
| Tannarxdan past sotish mumkin edi; `price` (qo‘lda narx) hech narsaga bo‘ysunmasdi, qator chegirmasi faqat qator summasi bilan cheklanardi | Minimal narx = `cost × (1 + minMarginPct/100)` (`@crm/shared` → `floorPrice`): qator summasi va `subtotal − discount` undan past bo‘lmaydi — 422 `DISCOUNT_LIMIT` (`meta.reason: "cost"`, `meta.minPrice`, `meta.max`); `maxDiscountPct` endi qator chegirmasi va qo‘lda narxga ham (ro‘yxat narxiga nisbatan, chekdagi barcha chegirmalar birga; `meta.reason: "policy"`). Yangi ruxsat `sales.belowCost` (sukutda hech kimda) — chegara o‘tiladi, chek jurnalga `sale.belowCost` bilan tushadi. Taklif yaratishda ham tekshiriladi, aylantirishda emas | POS’da chegirma/narx maydonini `meta.max` / `meta.minPrice` bilan ko‘rsatish; `sales.belowCost` bo‘lsa ogohlantirish bilan o‘tkazish; Sozlamalarda `minMarginPct`; Mahsulotlarda «Tannarxsiz» filtri (`GET /products?noCost=true`, `summary.withoutCost`) |

**2026-10-17** — egasiga murojaat (T-140, [owner-panel.md → 5.11](owner-panel.md#requests)); do‘kon ilovasiga ta’siri:

| Avval | Endi | Frontendda |
|-------|------|-----------|
| Bloklangan do‘kon egasiga faqat telefon qila olardi | `GET/POST /tenants/current/requests`, `POST …/:id/messages` — tizim ichidan murojaat (bloklangan/to‘xtatilgan holatda ham); egasi javobi — `tenant.request` hodisasi ([8.5](#support), [9.2](#realtime)) | Bannerda «Egasiga murojaat» tugmasi va oyna (chat); «Tarif va hisob» da tarix |
| Egasining aloqasi hech qayerda yo‘q edi | `GET /tenants/current` → `support { phone, telegram, hours }`; `GET /tenants/registration` → `{ mode, support }` | Bannerda va yopiq ro‘yxatdan o‘tish sahifasida telefon / Telegram havolasi |

**2026-10-16** — egasi paneli, davomi (T-137…T-139: egasiga Telegram xabarlar, ro‘yxatdan o‘tishni yopish, operatorlar va
ikki bosqichli kirish — [owner-panel.md](owner-panel.md)); do‘kon ilovasiga ta’siri bitta:

| Avval | Endi | Frontendda |
|-------|------|-----------|
| Ro‘yxatdan o‘tish doim ochiq | Platforma egasi yopishi mumkin: `GET /tenants/registration` → `{ mode: "open" \| "closed" }` (ochiq yo‘l); `closed` da `POST /tenants/register` → 403 `REGISTRATION_CLOSED` ([5.2](#auth)) | Kirish sahifasida `mode` so‘rab, `closed` bo‘lsa «Do‘kon ochish» havolasini yashirish; 403 da xabar |

**2026-10-17** — platforma egasi paneli (T-135): alohida ilova ([owner-panel.md](owner-panel.md)); do‘kon ilovasiga ta’siri:

| Avval | Endi | Frontendda |
|-------|------|-----------|
| Holatlar: `active`, `suspended`, `deleting` | + `blocked` — platforma egasi bloklagan: faqat o‘qish (423, `meta.status: blocked`), to‘lov ochmaydi; `GET /tenants/current` → `blockedReason` ([8.1](#tenant)) | Banner matni va admin uchun sabab; «To‘lash» blokni ochmasligi aytilsin |
| Holat faqat do‘kon amali bilan o‘zgarardi | Platforma o‘zgartirsa `tenant.status` hodisasi ([9.2](#realtime)) | `GET /auth/me`, `GET /tenants/current` qayta so‘rash |
| `InvoiceDto.provider`: `payme`, `click` | + `cash`, `transfer`, `bonus` (egasi qo‘lda yozgan) | To‘lovlar ro‘yxatida nom |

**2026-10-16** — do‘kon rollari va ruxsatlar (T-134), frontendga ta’sir qiladi ([6](#roles)):

| Avval | Endi | Frontendda |
|-------|------|-----------|
| 4 ta qat’iy rol, matritsa kodda (`packages/shared` va frontend nusxasi), administrator o‘zgartira olmasdi | Ruxsatlar rolga beriladi: 63 ta `bo‘lim.amal` ruxsati, 4 ta tizim roli (sukut — avvalgi matritsa bilan aynan bir xil) + do‘kon yaratadigan rollar; `GET/POST/PATCH/DELETE /roles`, `GET /roles/catalog`; rollarni boshqarishning o‘zi ham ruxsat (`roles.*`, sukut — faqat admin) | Yangi «Rollar» sahifasi ([6.8](#roles-migration)) |
| Huquq — `user.role` + frontenddagi matritsa nusxasi | `user.permissions` (login, refresh, `/auth/me`), `roleId`, `roleName`; `role` — tizim kaliti yoki `null` | `src/lib/permissions.ts` matritsasi o‘rniga `user.permissions`; `useCan('sales.return')` ([6.8](#roles-migration)) |
| Bo‘limlar: `finance`, `products` ichida ombor, `suppliers` ichida xaridlar, `customers` ichida xabarlar, `users` ichida audit | Alohida: `cash`, `debts`, `reports`, `stock`, `purchases` (`receive`, `pay`), `messages`, `audit`; `sales.return`, `sales.cancel` | Eski kalit → yangi jadvali ([6.8](#roles-migration)) |
| Yashirin maydonlar rol nomiga bog‘liq edi | `cost.view`, `wholesale.view`, `profit.view`, `salary.view` ruxsatlari ([6.6](#hidden)) | `hiddenFields.ts` — ruxsat bo‘yicha |
| `POST/PATCH /users { role }`, `GET /users?role=` | `roleId`, `?roleId=`; `role` kaliti hali qabul qilinadi (eskirgan) | Rol tanlovi `GET /roles` dan |
| Rol o‘zgarishi ≤ 15 daqiqada (token muddati), faolsizlantirilgan hisobning tokeni ham shuncha ishlardi | Huquq tokenda yo‘q — keyingi so‘rovdanoq; faolsiz hisob — darhol 401; `access.changed` hodisasi | Hodisada `GET /auth/me` (refresh EMAS) ([6.5](#access-changed)) |
| — | Yangi xato kodlari `ROLE_PROTECTED` (422), `ROLE_IN_USE` (409); `users.*`/`roles.*` berilgan rol faqat o‘zida bor ruxsatlar doirasida (403) | [7.3](#errors) |
| Zaxirada `users[].role` — rol kaliti | `role` — tizim kaliti yoki `null` (do‘kon roli), `roleName`; import do‘kon rolidagi hisobni o‘tkazib yuboradi (`CUSTOM_ROLE` ogohlantirishi) | — |

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
| Sotuvchi kirim buyurtmasi va ta’minotchi summalarini ko‘rardi (bitta qatorli buyurtmadan tannarx tiklanardi) | Sotuvchi javobida xarid summalari yo‘q; dashboard’da `payables` yo‘q ([6.6](#hidden)) | Pul ustunlari va kartalarini `field in obj` bilan yashirish |
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
- Rol va ruxsat o‘zgarishi keyingi so‘rovdanoq kuchga kiradi — huquq tokenda yo‘q ([6.5](#access-changed)).
- 429 (rate limit) javobida `code: "INTERNAL"` — `status` bo‘yicha aniqlang.
- DTO validatsiyasi (400) xatolarida `errors[].field` yo‘q — `meta.message` / `detail`.
- Sotuvchi javoblarida ba’zi kalitlar umuman yo‘q ([6.6](#hidden)) — `undefined` ni `0` deb ko‘rsatmang.
- `GET /files/:id/raw` token talab qiladi — `<img src>` uchun `/files/urls`.
- `GET /employees` — `employees.view` (sukut: admin, manager); ruxsatsiz rol xodim (haydovchi) tanlay olmaydi.
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
