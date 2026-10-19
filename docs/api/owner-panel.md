# Egasi paneli (owner panel) — frontend qo‘llanmasi

Bu hujjat **alohida** ilova — platforma egasining do‘konlar ustidan nazorat paneli — uchun. U do‘kon
ilovasi (`crm-qurilish`) emas: boshqa repo, boshqa domen, boshqa kirish. Maqsad — frontend dasturchida
savol qolmasligi: nima qurish kerak, qaysi endpoint, qanday javob, qanday xato, qanday tekshiriladi.

| | |
|---|---|
| Repo | `https://github.com/Ulugbek-Mominjonov/crm-owner` (Vite + React 19 + TypeScript + Tailwind v4, CI/CD sozlangan; `README.md`, `DEPLOY.md`) |
| Production | `https://owner.workspaces.uz` — frontend va API bitta domenda; API — `/api/v1/platform/*` (so‘rovlar nisbiy, `VITE_API_URL` bo‘sh) |
| Backend manba | [endpoints.md → Platforma egasi paneli](endpoints.md#platform) (35 ta endpoint, generatsiya), [schemas.md](schemas.md) (`Platform*`, `GrantPlanDto`, `CreateTenantDto` …), `apps/api/openapi.json` |
| Tiplar | `npm run gen:api` → `src/api/schema.d.ts` (`openapi-typescript`, manba — backend `master` dagi `openapi.json`) |
| Kim nima qiladi | Kod — frontend dasturchi (shu repo). Deploy, secret, domen, serverdagi Caddy, birinchi egasi hisobi — server egasi |

Backend tayyor: barcha endpointlar e2e testlar bilan qoplangan (`apps/api/test/platform.e2e-spec.ts`,
`platform-admins.e2e-spec.ts`, `platform-notify.e2e-spec.ts`, `tenant-requests.e2e-spec.ts`). Ikkinchi bosqich
(T-137…T-139) qo‘shgani: egasi hisoblari va operatorlar (rol), ikki bosqichli kirish (TOTP), egasining Telegram’i
(xabarlar), ro‘yxatdan o‘tishni yopish — [5.8](#admins), [5.9](#settings), [5.10](#profile). Uchinchi bosqich (T-140):
do‘kon murojaatlari va egasining aloqa ma’lumoti — [5.11](#requests), [5.9](#settings).

## Mundarija

1. [Do‘kon ilovasidan farqi](#farq)
2. [Kirish va sessiya](#auth)
3. [Umumiy qoidalar](#rules)
4. [Holatlar va tariflar](#status)
5. [Sahifalar va endpointlar](#pages)
6. [Xatolar](#errors)
7. [Lokal ishga tushirish](#local)
8. [Qabul mezonlari](#acceptance)
9. [Do‘kon ilovasiga (crm-qurilish) ta’siri](#store-app)

---

<a id="farq"></a>

## 1. Do‘kon ilovasidan farqi

| | Do‘kon ilovasi (`crm.workspaces.uz`) | Egasi paneli (`owner.workspaces.uz`) |
|---|---|---|
| Kim kiradi | Do‘kon xodimlari (`users`) | Platforma egasi (`platform_admins`) — alohida jadval, alohida hisob |
| Kirish | `POST /auth/login` | `POST /platform/auth/login` |
| Token | `tid` (do‘kon) bor | `kind: "platform"`, do‘kon yo‘q. **Do‘kon yo‘llarida 401**, do‘kon tokeni egasi yo‘llarida 401 |
| Refresh cookie | `refresh_token`, yo‘l `/api/v1/auth` | `platform_refresh`, yo‘l `/api/v1/platform/auth` — ikkala panel bitta brauzerda ishlasa ham aralashmaydi |
| Ruxsatlar | `user.permissions` bo‘yicha menyu | Ikki rol — `admin.role`: `owner` hammasini qiladi; `operator` do‘konlar bilan ishlaydi, lekin do‘konni o‘chira/qaytara olmaydi, «Hisoblar» va «Sozlamalar» sahifalari yo‘q (API 403 `PERMISSION_DENIED`) |
| WebSocket | `/events` | **Yo‘q.** Ma’lumot so‘rov bilan yangilanadi (amal → javobdagi yangi obyekt; ro‘yxat — qayta so‘rov) |
| `Idempotency-Key`, `If-Match` | Ko‘p yozuvchi amallarda | **Yo‘q** — egasi paneli endpointlari ularni talab qilmaydi |
| Faqat-o‘qish (423) | Do‘kon holati bo‘yicha | **Yo‘q** — egasi doim yozadi |
| Yashirin maydonlar | Rolga qarab | Yo‘q |

Egasi paneli do‘kon ilovasining endpointlarini (`/products`, `/sales` …) **chaqirmaydi** — 401 qaytadi.

---

<a id="auth"></a>

## 2. Kirish va sessiya

Oqim do‘kon ilovasidagi bilan bir xil ([README → 5](README.md#auth), [12.1](README.md#flow-client)), faqat yo‘llar va cookie nomi boshqa:

| | |
|---|---|
| Kirish | `POST /platform/auth/login` `{ email, password, totpCode? }` → **201** `{ accessToken, expiresIn: 900, admin: PlatformAdminDto }` + `platform_refresh` httpOnly cookie. `admin`: `{ id, email, name, role, isActive, totpEnabled, telegramLinked, lastLoginAt, createdAt }` |
| Ikki bosqichli kirish | Hisobda TOTP yoqilgan bo‘lsa parol to‘g‘ri bo‘lsa ham **401 `AUTH_TOTP_REQUIRED`** → kod maydonini ko‘rsating va o‘sha email/parol + `totpCode` (6 raqam) bilan qayta yuboring; noto‘g‘ri kod — 401 `AUTH_TOTP_INVALID`. Yoqish/o‘chirish — profil ([5.10](#profile)) |
| Access token | Faqat **xotirada** (localStorage/sessionStorage emas). `Authorization: Bearer …`. Muddati 15 daqiqa |
| Yangilash | `POST /platform/auth/refresh` (cookie’ni brauzer o‘zi yuboradi: `credentials: "include"`) → 201, javob login bilan bir xil. 401 da **bir marta**, parallel 401’lar bitta refresh’ni kutadi |
| Ilova ochilganda | Token yo‘q → `refresh` → muvaffaqiyatli bo‘lsa `GET /platform/auth/me` (sarlavhadagi egasi nomi), aks holda kirish sahifasi |
| Chiqish | `POST /platform/auth/logout` → `{ ok: true }`, cookie o‘chadi; xotiradagi tokenni ham o‘chiring |
| Sessiyalar yopilganda | Hisob faolsizlantirilsa, parol tiklansa yoki cookie qayta ishlatilsa — undan oldingi access token ham darhol 401 (T-147); 15 daqiqa kutilmaydi |
| Xatolar | 401 `AUTH_INVALID_CREDENTIALS` — email/parol xato yoki hisob faolsizlantirilgan (qaysi biri — aytilmaydi); 401 `AUTH_TOTP_REQUIRED` / `AUTH_TOTP_INVALID` — yuqorida; 401 `AUTH_INVALID_REFRESH` — sessiya yo‘q/muddati o‘tgan → kirish sahifasi; 401 `AUTH_TOKEN_REUSE` — bekor qilingan cookie qayta ishlatildi, **barcha** sessiyalar yopildi → kirish sahifasi; 423 `AUTH_ACCOUNT_LOCKED` — ketma-ket 5 ta noto‘g‘ri parol/kod, 15 daqiqa (`meta.until`); 429 `RATE_LIMITED` — daqiqasiga 5 urinish (IP) |

```json
// POST /platform/auth/login → 201
{
  "accessToken": "eyJ…",
  "expiresIn": 900,
  "admin": {
    "id": "0192…", "email": "owner@workspaces.uz", "name": "Egasi", "role": "owner", "isActive": true,
    "totpEnabled": true, "telegramLinked": true, "lastLoginAt": "2026-10-17T06:12:00.000Z", "createdAt": "2026-10-16T09:00:00.000Z"
  }
}
```

Birinchi egasi hisobi serverda `PLATFORM_OWNER_EMAIL` / `PLATFORM_OWNER_PASSWORD` bilan ishga tushishda yaratiladi
(server egasi qiladi, roli `owner`). Qolgan hisoblar (yana bir egasi, operatorlar) — «Hisoblar» sahifasida ([5.8](#admins)).

---

<a id="rules"></a>

## 3. Umumiy qoidalar

Do‘kon ilovasi bilan bir xil ([README → 4](README.md#conventions)); bu yerda kerak bo‘ladiganlari:

- **Javob shakli.** Bitta obyekt — to‘g‘ridan-to‘g‘ri; ro‘yxat — `{ items, page, pageSize, total, pageCount }`
  (`page` 1 dan, `pageSize` sukut 20, maks. 200). Massiv javob — faqat `GET /platform/tenants/:id/users`.
- **Identifikatorlar** — UUID; sanalar — ISO 8601 UTC (`2026-10-17T06:12:00.000Z`), ko‘rsatishda Toshkent vaqti;
  `dateFrom`/`dateTo` — `YYYY-MM-DD` (Toshkent kuni, ikkala chegara kiradi).
- **Pul** — butun so‘m (`amount: 99000`); **hajm** — bayt (`storageBytes`), MB/GB’ga UI aylantiradi.
- **Saralash** — `sort=name` / `sort=-createdAt` (minus — kamayish); faqat ruxsat etilgan kalitlar (400).
- **Filtrlar** — query parametrlari; bo‘sh qiymat yuborilmaydi.
- **Yozuvchi amallar** javobda **yangilangan obyektni** qaytaradi (`PlatformTenantDto`) — ro‘yxatni qayta so‘ramasdan
  qatorni almashtirish mumkin. `reset-password` — 204, tanasiz.
- `PATCH /platform/tenants/:id` — faqat yuborilgan maydonlar o‘zgaradi; `If-Match` yo‘q.
- Noma’lum maydon yuborilsa — 400 `VALIDATION_FAILED` (`whitelist`): DTO’da yo‘q maydonni yubormang.

---

<a id="status"></a>

## 4. Holatlar va tariflar

### 4.1 Do‘kon holati (`status`)

| `status` | Ma’nosi | Do‘kon nima qila oladi | Egasi amallari |
|---|---|---|---|
| `active` | Oddiy | Hammasi | Bloklash, tarif/to‘lov, o‘chirish |
| `suspended` | Pullik tarif muddati + 3 kun o‘tdi (server har kecha 01:00 da qo‘yadi) | Faqat o‘qish + to‘lov | **To‘lov yozish** (`plan`) → `active`; bloklash; o‘chirish |
| `blocked` | **Egasi bloklagan** (`blockedAt`, `blockedReason`) | Faqat o‘qish; kirish ishlaydi; sababni administrator ko‘radi | **Blokdan chiqarish** (`unblock`); tarif/to‘lov (blokni OCHMAYDI); o‘chirish |
| `deleting` | O‘chirish muhlati (`deletionScheduledAt` — shu vaqtda ma’lumot va fayllar butunlay o‘chadi) | Faqat o‘qish + o‘chirishni bekor qilish | **Qaytarish** (`restore`) |

Blok belgisi holatdan **alohida** saqlanadi: bloklangan do‘kon o‘chirishga qo‘yilib, keyin qaytarilsa — yana `blocked`.
`restore` dan keyingi holat: blok bo‘lsa `blocked`, tarif muddati o‘tgan bo‘lsa `suspended`, aks holda `active`.
UI’da `blockedAt !== null` bo‘lsa holatdan qat’i nazar «Bloklangan» belgisini ko‘rsating.

Tavsiya etilgan belgi ranglari: `active` — yashil, `suspended` — sariq, `blocked` — qizil, `deleting` — kulrang.

### 4.2 Tariflar

Manba — `packages/shared/src/plans.ts` (egasi paneli bu paketni import qilmaydi — qiymatlarni UI konstantasiga ko‘chiring):

| `plan` | Oylik narx | Foydalanuvchi | Ombor | Saqlash | SMS/kun |
|---|---|:-:|:-:|:-:|:-:|
| `free` | 0 | 3 | 2 | 200 MB | 50 |
| `basic` | 99 000 so‘m | 10 | 5 | 2 GB | 500 |
| `pro` | 249 000 so‘m | 50 | 20 | 20 GB | 5 000 |

Chegaralar javobda ham bor (`limits`), ularni UI hisoblamaydi. `usage` — ishlatilgani (`users`, `warehouses`, `storageBytes`).

### 4.3 Tarif muddati qanday uzayadi (`POST /platform/tenants/:id/plan`)

- `plan` pullik (`basic`/`pro`): `months` (1–12) va `provider` **shart**; `amount` berilmasa — narx × oy
  (`bonus` — 0). Natija: `paid` hisob-faktura va:
  - **o‘sha tarif** va muddati hali o‘tmagan → joriy `planExpiresAt` **dan** `months` oy;
  - **boshqa tarif** yoki muddati o‘tgan → **hozirdan** `months` oy;
  - `suspended` → `active`; `blocked` o‘zgarmaydi.
- `plan: "free"` → tarif darhol bepul, `planExpiresAt: null`; `suspended` → `active`.
- `provider`: `cash` — naqd, `transfer` — bank o‘tkazmasi, `bonus` — bepul muddat (summa 0). Onlayn to‘lovlar
  (`payme`, `click`) do‘konning o‘zidan keladi — egasi ularni faqat ko‘radi.

---

<a id="pages"></a>

## 5. Sahifalar va endpointlar

Yo‘llar — tavsiya; nomlar o‘zbekcha. Hamma sahifa kirishni talab qiladi (`/login` dan boshqa).

### 5.1 `/login` — Kirish

Email + parol → `POST /platform/auth/login`. Xato matni: 401 `AUTH_INVALID_CREDENTIALS` → «Email yoki parol xato»,
429 `RATE_LIMITED` → «Ko‘p urinish — bir daqiqadan keyin»; 423 `AUTH_ACCOUNT_LOCKED` → «Ketma-ket 5 ta noto‘g‘ri
parol yoki kod — 15 daqiqadan keyin» (`errors[0].meta.until` — qachongacha; to‘g‘ri parol ham o‘tmaydi, muvaffaqiyatli
kirish hisobni tozalaydi). 401 `AUTH_TOTP_REQUIRED` → shu sahifada **kod maydoni** ochiladi
(«Autentifikator ilovasidagi 6 raqam»), email/parol saqlanadi, qayta yuborishda `totpCode` qo‘shiladi; 401
`AUTH_TOTP_INVALID` → «Kod noto‘g‘ri». Muvaffaqiyat → `/`.

### 5.2 `/` — Bosh sahifa (boshqaruv paneli)

`GET /platform/stats` → [`PlatformStatsDto`](schemas.md#platformstatsdto):

```json
{
  "tenants": {
    "total": 14,
    "byStatus": { "active": 11, "suspended": 2, "blocked": 1 },
    "byPlan": { "free": 9, "basic": 3, "pro": 2 },
    "newThisMonth": 3,
    "expiringIn7Days": 2,
    "overdue": 1
  },
  "revenue": {
    "thisMonth": 447000,
    "lastMonth": 198000,
    "months": [ { "month": "2026-09-01", "amount": 198000, "invoices": 2 }, { "month": "2026-10-01", "amount": 447000, "invoices": 4 } ]
  },
  "openRequests": 2
}
```

Kartalar: jami do‘konlar (holat bo‘yicha taqsimot), tarif bo‘yicha, shu oyda ochilganlar, **7 kunda tugaydiganlar**
(bosilsa → `/tenants?expiresWithinDays=7`), **muddati o‘tganlar** (`overdue` — 3 kunlik imtiyozda, hali
to‘xtatilmagan; bosilsa → `/tenants?expiresWithinDays=0`), **javob kutayotgan murojaatlar** (`openRequests`; bosilsa →
`/requests?status=open`; shu son menyudagi «Murojaatlar» yonida belgi — [5.11](#requests)), joriy/o‘tgan oy tushumi, 12 oylik
ustunli grafik (`months` — to‘lov bo‘lmagan oy ro‘yxatda **yo‘q**, grafikda 0 deb chizing). `byStatus`/`byPlan` da bo‘lmagan kalit = 0.

### 5.3 `/tenants` — Do‘konlar ro‘yxati

`GET /platform/tenants?page&pageSize&q&status&plan&expiresWithinDays&sort` → sahifali
[`PlatformTenantDto`](schemas.md#platformtenantdto):

```json
{
  "id": "0192…", "name": "Qurilish Mollari", "plan": "basic", "status": "active",
  "planExpiresAt": "2026-11-16T09:00:00.000Z", "deletionScheduledAt": null,
  "blockedAt": null, "blockedReason": null, "notes": "Telefon orqali kelishildi",
  "createdAt": "2026-10-01T05:20:11.000Z",
  "limits": { "users": 10, "warehouses": 5, "storageBytes": 2147483648, "fileBytes": 10485760, "smsPerDay": 500 },
  "usage": { "users": 4, "warehouses": 2, "storageBytes": 15728640 },
  "admin": { "name": "Ali Valiyev", "email": "ali@dokon.uz", "phone": "+998901234567" },
  "activity": { "lastSaleAt": "2026-10-16T14:02:00.000Z", "sales30d": 312 },
  "openRequests": 0
}
```

| Element | Manba |
|---|---|
| Qidiruv (nom) | `q` (maks. 100 belgi, harf farqsiz) |
| Filtr: holat, tarif | `status`, `plan` |
| Filtr: «Tez orada tugaydi» | `expiresWithinDays=7` (muddati o‘tganlar ham kiradi); `0` — faqat o‘tganlar |
| Saralash | `sort`: `-createdAt` (sukut), `name`, `-name`, `planExpiresAt`, `-planExpiresAt` |
| Ustunlar | Nom (yonida murojaat belgisi — `openRequests > 0`), holat (belgi; `blockedAt` bo‘lsa «Bloklangan»), tarif + muddati (qolgan kunlar; `free` — «—»), foydalanuvchi `usage.users/limits.users`, hajm, administrator (ism, telefon), so‘nggi faollik (`activity.lastSaleAt`, `sales30d`), ochilgan sana |
| Qator | bosilsa → `/tenants/:id` |
| Tugma | «Do‘kon ochish» → `/tenants/new` |

`admin` `null` bo‘lishi mumkin (administrator hisobi o‘chirilgan) — «—» ko‘rsating.

### 5.4 `/tenants/new` — Do‘kon ochish

`POST /platform/tenants` → **201** `PlatformTenantDto`. Tana — [`CreateTenantDto`](schemas.md#createtenantdto):

| Maydon | Qoida |
|---|---|
| `storeName` | 1–120 belgi |
| `ownerName` | 1–120 belgi — egasi (administrator) ismi |
| `phone` | `+998901234567` ko‘rinishida |
| `email` | Email (do‘kon ichida noyob; boshqa do‘konda takror bo‘lishi mumkin) |
| `password` | Kamida 8 belgi, ommabop parol rad etiladi (400, `errors[].field = "password"`) |
| `plan` | ixtiyoriy, sukut `free`; `basic`/`pro` bo‘lsa `months` **shart** (1–12) — bepul boshlang‘ich muddat (`bonus` hisob-faktura, summa 0) |
| `notes` | ixtiyoriy, egasi izohi (maks. 500) |

Muvaffaqiyatdan keyin: **email va parolni nusxalash** oynasi («Do‘kon egasiga yetkazing» — server parolni qayta
ko‘rsatmaydi), keyin `/tenants/:id`. Do‘kon egasi `https://crm.workspaces.uz` ga shu email/parol bilan kiradi
(roli `admin`, dastlabki sozlash sehrgari ochiladi).

### 5.5 `/tenants/:id` — Do‘kon kartasi

`GET /platform/tenants/:id` → `PlatformTenantDto` (404 — yo‘q). Sarlavha: nom, holat belgisi, tarif va muddati,
administrator aloqasi (telefonga `tel:` havola). Bo‘limlar (tab):

**Umumiy.** Ko‘rsatkichlar (`usage` / `limits` progress), faollik, ochilgan sana, `blockedReason` (bloklangan
bo‘lsa — qizil blok), `deletionScheduledAt` (o‘chirilayotgan bo‘lsa), `openRequests` (javob kutayotgan murojaat bo‘lsa —
«Murojaatlar» bo‘limiga havola). Nom va izoh tahriri — `PATCH /platform/tenants/:id`
`{ name?, notes? }` (`notes: ""` — izoh o‘chadi) → yangilangan obyekt.

**Amallar** (sarlavhadagi tugmalar, holatga qarab — 4.1 jadvali):

| Tugma | So‘rov | Tasdiq oynasi |
|---|---|---|
| Bloklash | `POST …/block { reason }` (1–500 belgi, **majburiy**) | «Do‘kon faqat o‘qish rejimiga o‘tadi; sabab do‘kon administratoriga ko‘rinadi» |
| Blokdan chiqarish | `POST …/unblock` | oddiy tasdiq |
| Tarif / to‘lov | `POST …/plan` — 4.3 | alohida oyna (quyida) |
| O‘chirish | `POST …/delete` — **faqat `owner`** | «30 kundan keyin do‘kon ma’lumoti va fayllari butunlay o‘chadi; muhlat ichida qaytarish mumkin» |
| Qaytarish | `POST …/restore` — **faqat `owner`** | oddiy tasdiq |

Hammasi **200** va yangilangan `PlatformTenantDto` qaytaradi — kartani shu bilan yangilang. 422 `INVALID_STATUS_TRANSITION` —
holat bunga yo‘l qo‘ymaydi (masalan, bloklanmagan do‘konni `unblock`): xabarni (`detail`) ko‘rsating va kartani qayta so‘rang.
`admin.role === "operator"` bo‘lsa «O‘chirish» va «Qaytarish» tugmalarini ko‘rsatmang (API 403 `PERMISSION_DENIED`).

**«Tarif / to‘lov» oynasi** (`POST /platform/tenants/:id/plan`, [`GrantPlanDto`](schemas.md#grantplandto)):
tarif tanlovi (`free`/`basic`/`pro`); pullik bo‘lsa — oy soni (1–12), usul (`cash` «Naqd», `transfer` «O‘tkazma»,
`bonus` «Bonus (bepul)»), summa (sukut narx × oy, `bonus` da 0 va o‘zgartirilmaydi), izoh (kvitansiya raqami).
Oynada **yangi muddat qachon tugashini** oldindan ko‘rsating (4.3 qoidasi bilan). Natija — `PlatformTenantDto`
(`plan`, `planExpiresAt`, `status`).

**Hisoblar.** `GET /platform/tenants/:id/users` → massiv [`PlatformTenantUserDto`](schemas.md#platformtenantuserdto)
(`id, name, email, role, roleName, isActive, lastLoginAt, createdAt`). Jadval + har qatorda «Parolni tiklash» →
oyna (yangi parol, kamida 8 belgi) → `POST /platform/tenants/:id/users/:userId/reset-password { password }` → **204**.
Xodimning barcha sessiyalari yopiladi; parolni egasi xodimga o‘zi yetkazadi.

**To‘lovlar.** `GET /platform/tenants/:id/invoices?page&pageSize&state&provider&dateFrom&dateTo` → sahifali
[`PlatformInvoiceDto`](schemas.md#platforminvoicedto):

```json
{ "id": "0192…", "tenantId": "0192…", "tenantName": "Qurilish Mollari", "plan": "basic", "months": 1, "amount": 99000,
  "state": "paid", "provider": "cash", "note": "Kvitansiya №12", "createdAt": "2026-10-17T06:30:00.000Z", "paidAt": "2026-10-17T06:30:00.000Z" }
```

`state`: `created` (do‘kon hisob-faktura ochdi, hali to‘lamadi) → `pending` (provayder boshladi) → `paid` / `cancelled`.
`provider`: `payme`, `click` — onlayn; `cash`, `transfer`, `bonus` — egasi yozgan; `null` — hali provayder tanlanmagan.

**Jurnal.** `GET /platform/audit?tenantId=:id` — shu do‘kon bo‘yicha egasi amallari (5.7).

**Murojaatlar.** `GET /platform/requests?tenantId=:id` — shu do‘kon murojaatlari, qator bosilsa — murojaat oynasi
([5.11](#requests)). Bloklangan do‘konda bu bo‘limni birinchi ko‘rsating: administrator «blokni oling» deb shu yerga yozadi.

### 5.6 `/invoices` — Barcha to‘lovlar

`GET /platform/invoices?page&pageSize&tenantId&state&provider&dateFrom&dateTo` → sahifali `PlatformInvoiceDto`
(eng yangisi birinchi). Filtrlar: holat, usul, sana oralig‘i; `tenantName` ustuni bosilsa → `/tenants/:tenantId`.
Jadval tagida sahifadagi `paid` summalar yig‘indisi — UI hisoblaydi (umumiy tushum — bosh sahifada).

### 5.7 `/audit` — Egasi jurnali

`GET /platform/audit?page&pageSize&tenantId&group` → sahifali [`PlatformAuditEntryDto`](schemas.md#platformauditentrydto):

```json
{ "id": "0192…", "action": "tenant.block", "admin": { "id": "…", "name": "Egasi", "email": "owner@workspaces.uz" },
  "targetTenantId": "0192…", "targetTenantName": "Qurilish Mollari", "entityType": "tenant", "entityId": "0192…",
  "diff": { "reason": "To‘lov kelishuvi buzildi" }, "createdAt": "2026-10-17T06:40:00.000Z" }
```

| `action` | Ma’nosi | `diff` |
|---|---|---|
| `platform.login` | Egasi kirdi | — |
| `platform.bootstrap` | Birinchi hisob yaratildi (`admin: null`) | `{ email }` |
| `tenant.create` | Do‘kon ochildi | `{ name, email, plan, months }` |
| `tenant.update` | Nom/izoh | `{ before, after }` |
| `tenant.block` / `tenant.unblock` | Blok | `{ reason }` / — |
| `tenant.plan` | Tarif / to‘lov | `{ plan, months, provider, amount, note, planExpiresAt }` |
| `tenant.delete` / `tenant.restore` | O‘chirish / qaytarish | — |
| `user.resetPassword` | Do‘kon hisobiga parol | `entityId` — foydalanuvchi |
| `platform.admin.create` / `platform.admin.update` | Egasi hisobi ochildi / nom, rol, faollik | `{ email, name, role }` / `{ before, after }` |
| `platform.admin.resetPassword` / `platform.admin.totpReset` | Hisobga parol / TOTP olib tashlandi | `entityId` — hisob |
| `platform.totp.enable` / `platform.totp.disable` | O‘zi TOTP yoqdi / o‘chirdi | — |
| `platform.telegram.link` / `platform.telegram.unlink` | Telegram ulandi / uzildi | — |
| `platform.settings.update` | Ro‘yxatdan o‘tish rejimi, aloqa | `{ before, after }` — faqat o‘zgargan maydonlar |
| `request.reply` / `request.close` | Do‘kon murojaatiga javob / yopish (`entityId` — murojaat) | `{ type }` / `{ type, withMessage }` |

`group` filtri — `tenant`, `user`, `platform`, `request`. `targetTenantName` `null` — do‘kon allaqachon butunlay o‘chirilgan.
Egasi hisoblari bilan bog‘liq yozuvlarda `targetTenantId` yo‘q, `entityType: "admin"`.

<a id="admins"></a>

### 5.8 `/admins` — Hisoblar va operatorlar (faqat `owner`)

Egasi o‘ziga yordamchi — **operator** — ochadi: operator do‘konlarni ko‘radi, ochadi, bloklaydi, tarif/to‘lov yozadi,
xodim parolini tiklaydi, lekin do‘konni **o‘chira/qaytara olmaydi**, hisoblar va sozlamani boshqarmaydi. Menyuda bu
sahifa faqat `admin.role === "owner"` ga ko‘rinadi (API baribir 403 beradi).

| Element | So‘rov |
|---|---|
| Jadval | `GET /platform/admins` → massiv [`PlatformAdminDto`](schemas.md#platformadmindto): nom, email, rol, faol, TOTP (`totpEnabled`), Telegram (`telegramLinked`), oxirgi kirish |
| «Hisob ochish» oynasi | `POST /platform/admins` `{ email, name, password, role }` → 201. `password` — kamida 8 belgi (400); email band — 409 `ALREADY_EXISTS`. Parolni egasi operatorga o‘zi aytadi |
| Qator tahriri | `PATCH /platform/admins/:id` `{ name?, role?, isActive? }` → 200. `isActive: false` — kira olmaydi, sessiyalari yopiladi. **O‘z qatorida** rol va faollik o‘zgartirilmaydi (422 `SELF_ROLE_CHANGE` / `SELF_DELETE`) — maydonlarni o‘chiq ko‘rsating |
| «Parolni tiklash» | `POST /platform/admins/:id/reset-password { password }` → 204; barcha sessiyalari yopiladi (o‘ziniki bo‘lsa — qayta kirish) |
| «TOTP’ni olib tashlash» | `POST /platform/admins/:id/totp/reset` → 204 (422 — yoqilmagan). Qurilma yo‘qolganda: hisob yana faqat parol bilan kiradi va qayta sozlaydi |

Egasi o‘z rolini pasaytira va o‘zini faolsizlantira olmagani uchun tizimda doim kamida bitta faol egasi qoladi.
Yagona egasi o‘z TOTP qurilmasini yo‘qotsa — server egasi bazada olib tashlaydi (`infra/README.md` §10).

<a id="settings"></a>

### 5.9 `/settings` — Platforma sozlamasi (faqat `owner`)

`GET /platform/settings` → [`PlatformSettingsDto`](schemas.md#platformsettingsdto)
`{ registrationMode: "open" | "closed", support: { phone, telegram, hours }, updatedAt, updatedBy }` (o‘qish — operator
uchun ham ochiq); `PATCH /platform/settings { registrationMode?, support? }` → 200 — faqat yuborilgan maydonlar o‘zgaradi,
darhol kuchga kiradi (qayta ishga tushirish yo‘q). Ikki blok:

**Ro‘yxatdan o‘tish.** Almashtirgich «Ro‘yxatdan o‘tish ochiq» bilan izoh: *yopiq bo‘lsa do‘kon ilovasidagi «Do‘kon ochish»
yo‘qoladi (`POST /tenants/register` → 403 `REGISTRATION_CLOSED`), yangi do‘kon faqat shu paneldan ochiladi.*

**Aloqa (do‘konlar ko‘radi, T-140).** Telefon (maks. 32 belgi, erkin ko‘rinishda), Telegram foydalanuvchi nomi (`@`siz,
5–32 belgi; `@` bilan yuborilsa olib tashlanadi; noto‘g‘ri — 400), ish vaqti (maks. 120). Do‘kon ilovasi ularni
faqat-o‘qish bannerida, murojaat oynasida va yopiq ro‘yxatdan o‘tish sahifasida ko‘rsatadi — telefonga javob berolmagan
paytda ham do‘kon sizni topa oladi. Maydonni bo‘shatish — `""` yuboriladi (`null` emas); hammasi ixtiyoriy.
`updatedBy` — oxirgi o‘zgartirgan hisob nomi (`null` — hech qachon o‘zgartirilmagan).

<a id="profile"></a>

### 5.10 `/profile` — Profil (har bir hisob o‘zi uchun)

Manba — `GET /platform/auth/me` (`PlatformAdminDto`). Ikki blok:

**Ikki bosqichli kirish (TOTP).** `totpEnabled: false` → «Yoqish»: `POST /platform/auth/totp/setup` → 201
`{ secret, otpauthUrl }` — `otpauthUrl` dan **QR kod** chizing (masalan `qrcode` paketi), yonida `secret` (qo‘lda
kiritish uchun) va izoh «Google Authenticator, Aegis, 1Password … bilan skanerlang». Keyin kod maydoni →
`POST /platform/auth/totp/enable { code }` → 200 `PlatformAdminDto` (`totpEnabled: true`); 401 `AUTH_TOTP_INVALID` —
«Kod noto‘g‘ri». `setup` ni qayta chaqirish — yangi sir (eski QR bekor). `totpEnabled: true` → «O‘chirish»: kod
so‘raladi → `POST /platform/auth/totp/disable { code }` → 200. Ikkala kod endpointi — daqiqasiga 5 urinish (429).
Kodlar 30 soniyalik, ±30 s soat farqi qabul qilinadi; **bitta kod bir marta** ishlaydi (qayta yuborilsa 401).

**Telegram xabarlari.** `telegramLinked: false` → «Ulash»: `POST /platform/auth/telegram-link` → 201
`{ link, expiresAt }` — `link` ni QR qilib va «Telegramda ochish» tugmasi bilan ko‘rsating (`https://t.me/<bot>?start=p-…`,
bir martalik, 7 kun). Egasi botda Start bosgach ulanadi — sahifada «Tekshirish» tugmasi (`GET /platform/auth/me`)
yoki 3–5 soniyada qayta so‘rash. 422 `RECIPIENT_UNREACHABLE` (`errors[0].meta.reason: "no_channel"`) — serverda bot
sozlanmagan: blokni «Telegram bot sozlanmagan» deb ko‘rsating. `telegramLinked: true` → «Uzish»:
`DELETE /platform/auth/telegram-link` → 204.

Ulangan hisobga bot yuboradigan xabarlar (hammasi **ulangan faol** hisoblarga, egasi ham, operator ham):
🆕 yangi do‘kon ro‘yxatdan o‘tdi (nom, administrator ismi, telefon, email); 💳 onlayn to‘lov keldi (do‘kon, summa,
tarif, oy, Payme/Click — qo‘lda yozilgan to‘lov haqida xabar yo‘q); 🗑 do‘kon administratori o‘chirishni so‘radi
(30 kun muhlat — panelda qaytarish mumkin); 📨 do‘kon murojaat yubordi (do‘kon, tur, blok sababi, kim va telefoni, matn);
💬 murojaatga qo‘shimcha xabar ([5.11](#requests)). Egasi botni bloklasa ulanish o‘zi olib tashlanadi (`telegramLinked: false`).

<a id="requests"></a>

### 5.11 `/requests` — Do‘kon murojaatlari

Do‘kon administratori (bloklangan yoki to‘xtatilgan bo‘lsa ham) do‘kon ilovasidan egasiga yozadi; egasi va operator shu
yerda javob beradi. Telefonga javob bo‘lmasa ham xabar yo‘qolmaydi: yangi murojaat va qo‘shimcha xabar haqida ulangan
hisoblarga Telegram keladi (📨 / 💬). Menyuda «Murojaatlar» yonida belgi — `GET /platform/stats` → `openRequests`
(javob kutayotganlar; bosh sahifada ham karta).

`GET /platform/requests?page&pageSize&status&type&tenantId` → sahifali [`PlatformRequestDto`](schemas.md#platformrequestdto)
(yopilmaganlar birinchi, keyin so‘nggi xabar bo‘yicha):

```json
{ "id": "0192…", "tenantId": "0192…", "tenantName": "Qurilish Mollari", "tenantStatus": "blocked",
  "type": "unblock", "status": "open", "phone": "+998901234567", "authorName": "Ali Valiyev",
  "message": "To‘lovni kecha o‘tkazdik, blokni olib tashlang", "messageCount": 1,
  "lastMessageAt": "2026-10-17T06:30:00.000Z", "createdAt": "2026-10-17T06:30:00.000Z", "closedAt": null }
```

| Element | Manba |
|---|---|
| Filtr: holat | `status` — `open` «Javob kutmoqda», `answered` «Javob berilgan», `closed` «Yopilgan» |
| Filtr: tur | `type` — `unblock` «Blokdan chiqarish», `billing` «To‘lov», `other` «Boshqa» |
| Ustunlar | Do‘kon (`tenantStatus` belgisi bilan; bosilsa → `/tenants/:tenantId`), tur, holat, kim yozgan + telefon (`tel:`), xabar (`message`, qisqartirib), `messageCount`, so‘nggi xabar vaqti |
| Qator | bosilsa → murojaat oynasi |

**Murojaat oynasi** — `GET /platform/requests/:id` → [`PlatformRequestDetailDto`](schemas.md#platformrequestdetaildto):
ro‘yxat qatori + `messages[]` (`author`: `store` — do‘kon administratori, `platform` — egasi/operator; `authorName`, `body`,
`createdAt`; eskisi birinchi) — chat ko‘rinishida chizing. Tugmalar:

| Tugma | So‘rov | Izoh |
|---|---|---|
| Javob yozish | `POST /platform/requests/:id/reply { message }` (1–1000 belgi) → 200 `PlatformRequestDetailDto`, `status: answered` | Do‘kon administratori javobni darhol ko‘radi (`tenant.request` hodisasi) |
| Yopish | `POST /platform/requests/:id/close { message? }` → 200, `status: closed`, `closedAt` | Ixtiyoriy yakuniy javob bilan; do‘kon unga yozolmaydi, kerak bo‘lsa yangisini ochadi |
| Blokdan chiqarish | `POST /platform/tenants/:tenantId/unblock` (5.5) | `tenantStatus === "blocked"` bo‘lsa ko‘rsating; blokni olgach javob yozib yoping |

Yopilgan murojaatga `reply` / `close` — 422 `INVALID_STATUS_TRANSITION`. Do‘kon yana yozsa holat `answered` → `open` ga
qaytadi (ro‘yxatda yana «javob kutmoqda») va Telegram keladi. Do‘kon tomonida bir vaqtda bitta yopilmagan murojaat bo‘ladi
— yopmaguningizcha yangisini ocholmaydi (qo‘shimcha gapni shu murojaatga yozadi). Do‘kon kartasida (5.5, «Murojaatlar») —
`GET /platform/requests?tenantId=:id`.

---

<a id="errors"></a>

## 6. Xatolar

Shakl do‘kon ilovasi bilan bir xil ([README → 7](README.md#errors)):

```json
{ "code": "VALIDATION_FAILED", "detail": "…", "errors": [ { "field": "months", "code": "VALIDATION_FAILED", "meta": { "message": "…" } } ], "traceId": "…" }
```

| Kod | Status | Qachon | UI |
|---|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Login xato; token yo‘q/yaroqsiz; **do‘kon tokeni** egasi yo‘lida; hisob faolsizlantirilgan | Login sahifasida — xabar; boshqa joyda — refresh, bo‘lmasa kirish sahifasi |
| `AUTH_ACCOUNT_LOCKED` | 423 | Ketma-ket 5 ta noto‘g‘ri parol yoki TOTP kodi — 15 daqiqa blok (`errors[0].meta.until`) | «… daqiqadan keyin urinib ko‘ring»; to‘g‘ri parol ham o‘tmaydi |
| `RATE_LIMITED` | 429 | Daqiqasiga 5 urinish (IP) | «Bir daqiqadan keyin» |
| `AUTH_TOTP_REQUIRED` | 401 | Login: parol to‘g‘ri, hisobda TOTP yoqilgan, `totpCode` yo‘q | Kod maydonini ochish, qayta yuborish |
| `AUTH_TOTP_INVALID` | 401 | Kod noto‘g‘ri, eskirgan yoki qayta ishlatilgan (login, `totp/enable`, `totp/disable`) | «Kod noto‘g‘ri — ilovadagi joriy kodni kiriting» |
| `AUTH_INVALID_REFRESH` | 401 | Refresh cookie yo‘q/eskirgan | Kirish sahifasi |
| `AUTH_TOKEN_REUSE` | 401 | Bekor qilingan refresh qayta ishlatildi — hamma sessiya yopildi | Kirish sahifasi + «Xavfsizlik sababli qayta kiring» |
| `PERMISSION_DENIED` | 403 | `operator` egasiga tegishli amalni chaqirdi (o‘chirish/qaytarish, `/platform/admins`, `PATCH /platform/settings`) | Tugma ko‘rinmasligi kerak edi — `GET /platform/auth/me` ni qayta so‘rab menyuni yangilash |
| `VALIDATION_FAILED` | 400 | Maydon xato (`errors[].field`), noma’lum maydon, yaroqsiz UUID, noma’lum `sort`/`status` | Maydon ostida xabar |
| `NOT_FOUND` | 404 | Do‘kon/hisob/murojaat yo‘q | «Topilmadi» sahifasi yoki ro‘yxatga qaytish |
| `ALREADY_EXISTS` | 409 | `POST /platform/admins` — email band | Maydon ostida |
| `INVALID_STATUS_TRANSITION` | 422 | Holat amalni rad etdi (do‘kon holati; TOTP allaqachon yoqilgan/yoqilmagan; murojaat allaqachon yopilgan) | `detail` ni ko‘rsatib, kartani/murojaatni qayta so‘rash |
| `SELF_ROLE_CHANGE` / `SELF_DELETE` | 422 | O‘z rolini o‘zgartirish / o‘zini faolsizlantirish | Maydonlar o‘chiq bo‘lishi kerak edi |
| `RECIPIENT_UNREACHABLE` | 422 | `telegram-link`: bot sozlanmagan (`meta.reason: "no_channel"`) | Telegram blokini «sozlanmagan» deb ko‘rsatish |
| — | 429 | Login va TOTP kod chegarasi (5/daqiqa) yoki umumiy (300/daqiqa) | «Bir ozdan keyin urinib ko‘ring» |
| `INTERNAL` | 500 | Kutilmagan | `traceId` bilan xabar |

---

<a id="local"></a>

## 7. Lokal ishga tushirish

1. Backend ([README → 2](README.md#local)): `npm run services:up`, `apps/api/.env` da
   `PLATFORM_OWNER_EMAIL=owner@local.uz` va `PLATFORM_OWNER_PASSWORD=Egasi-2026!` (kamida 8 belgi), `npm run dev -w @crm/api` —
   ishga tushganda egasi hisobi yaratiladi (logda «Egasi hisobi yaratildi»). Demo do‘kon — `npm run seed -w @crm/api`.
2. Frontend: `crm-owner` repo’da `npm i`, `.env.local` da `API_PROXY_TARGET=http://localhost:3000`, `npm run dev` —
   Vite `/api` va `/health` ni backend’ga proksilaydi (cookie bir xil origin’da, CORS yo‘q).
3. Tiplar: `npm run gen:api` (lokal backend spec: `API_SPEC_URL=http://localhost:3000/api/docs-json`).
4. Swagger: `http://localhost:3000/api/docs` — `platform` bo‘limi; «Authorize» ga egasi tokenini qo‘ying.

Production’da `VITE_API_URL` bo‘sh, so‘rovlar nisbiy; deploy — `DEPLOY.md` (server egasi).

---

<a id="acceptance"></a>

## 8. Qabul mezonlari

- Kirish/chiqish/refresh ishlaydi; token faqat xotirada; 401 da bitta refresh; `AUTH_TOKEN_REUSE` da kirish sahifasi.
- Do‘kon tokeni bilan egasi paneliga kirib bo‘lmaydi (API 401 beradi — UI buni «kirish sahifasi» deb ko‘rsatadi).
- Bosh sahifa: `stats` kartalari va 12 oylik grafik; «tugaydiganlar» kartasi ro‘yxat filtriga olib boradi.
- Ro‘yxat: qidiruv, holat/tarif/muddat filtrlari, saralash, sahifalash — **serverda** (`total`, `pageCount`).
- Do‘kon ochish: validatsiya xatolari maydon ostida; muvaffaqiyatda email/parol nusxalash oynasi.
- Karta: holat belgisi va `blockedReason`; blok/blokdan chiqarish/o‘chirish/qaytarish — tasdiq oynasi bilan, javobdagi obyekt bilan yangilanadi; 422 xabari ko‘rsatiladi.
- Tarif/to‘lov oynasi: pullik tarifda oy va usul majburiy, summa sukut narx × oy, yangi muddat oldindan ko‘rsatiladi; `free` da qolgan maydonlar yashirin.
- Hisoblar: ro‘yxat va parolni tiklash (204).
- To‘lovlar va jurnal sahifalari filtr va sahifalash bilan.
- Rol: `operator` ga «O‘chirish»/«Qaytarish» tugmalari, «Hisoblar» va «Sozlamalar» menyusi ko‘rinmaydi; 403 kelsa `me` qayta so‘raladi.
- Kirishda `AUTH_TOTP_REQUIRED` → kod maydoni (email/parol saqlanadi); profil: TOTP yoqish (QR + qo‘lda sir, kod bilan tasdiq) va o‘chirish (kod bilan).
- Hisoblar sahifasi (`owner`): ochish, nom/rol/faollik tahriri (o‘z qatorida rol va faollik o‘chiq), parolni tiklash, TOTP’ni olib tashlash.
- Sozlamalar (`owner`): ro‘yxatdan o‘tish almashtirgichi, aloqa maydonlari (telefon, Telegram, ish vaqti; bo‘shatish `""`), kim/qachon o‘zgartirgani.
- Profil: Telegram ulash (QR + «Telegramda ochish», «Tekshirish»), uzish; bot sozlanmagan — blok «sozlanmagan».
- Murojaatlar: menyuda `openRequests` belgisi (bosh sahifa kartasi ham); ro‘yxat holat/tur filtrlari bilan; oynada chat, «Javob yozish», «Yopish»; bloklangan do‘konda «Blokdan chiqarish» tugmasi; do‘kon kartasida «Murojaatlar» bo‘limi; 422 xabari ko‘rsatiladi.
- Responsiv (planshet/telefon), o‘zbek tili, sanalar Toshkent vaqtida, summalar `99 000 so‘m` ko‘rinishida.
- `npm run lint`, `npm run build`, `npm test` yashil (CI shuni tekshiradi, deploy — `main` ga push).

---

<a id="store-app"></a>

## 9. Do‘kon ilovasiga (crm-qurilish) ta’siri

Egasi paneli bilan birga do‘kon API’sida kichik o‘zgarishlar bor ([README → 8.1](README.md#tenant), [14.2](README.md#muammolar)):

1. **Yangi holat `blocked`** — `user.tenant.status` (login, refresh, `/auth/me`) va 423 `TENANT_READ_ONLY`
   (`errors[0].meta.status: "blocked"`). Banner: «Do‘kon platforma tomonidan to‘xtatilgan — faqat o‘qish». Administrator
   uchun sabab — `GET /tenants/current` → `blockedReason` (yangi maydon); «To‘lash» tugmasi blokni **ochmaydi** (banner matni
   buni aytsin: «Aloqa: platforma»).
2. **Realtime hodisa `tenant.status`** `{ status, plan }` — egasi blok qo‘yganda/olganda, tarif berganda. Qabul qilinsa
   `GET /auth/me` (banner) va `GET /tenants/current` (tarif sahifasi) qayta so‘raladi.
3. **`InvoiceDto.provider`** endi `cash`, `transfer`, `bonus` ham bo‘lishi mumkin («Tarif va hisob» sahifasidagi to‘lovlar
   ro‘yxati — «Naqd», «O‘tkazma», «Bonus» deb ko‘rsating).
4. **Ro‘yxatdan o‘tish yopilishi mumkin** (T-138): kirish sahifasi ochilganda `GET /tenants/registration` (ochiq yo‘l) →
   `{ mode: "open" | "closed" }`; `closed` bo‘lsa «Do‘kon ochish» havolasini va ro‘yxatdan o‘tish sahifasini yashiring.
   `POST /tenants/register` yopiq rejimda 403 `REGISTRATION_CLOSED` — «Yangi do‘kon ochish vaqtincha yopiq».
5. **Egasiga murojaat** (T-140): faqat-o‘qish bannerida (administrator uchun) «Egasiga murojaat» tugmasi va oyna —
   `GET/POST /tenants/current/requests`, `POST /tenants/current/requests/:id/messages`; egasi javob berganda
   `tenant.request` hodisasi; `GET /tenants/current` → `support` (egasining telefoni, Telegram’i, ish vaqti) bannerda
   ([README → 8.5](README.md#support)).
6. **`GET /tenants/registration`** endi `{ mode, support }` qaytaradi — yopiq ro‘yxatdan o‘tish sahifasida aloqani ko‘rsating.

Qolgan hamma narsa o‘zgarmagan.
