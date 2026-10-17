# Endpointlar ma’lumotnomasi

> **Generatsiya qilingan** — manba: `apps/api/openapi.json` (DTO, tavsif, xato kodlari) va controllerlar (huquq, idempotentlik, `If-Match`, audit). Tushuntirish va umumiy qoidalar — [README.md](README.md). Maydonlar tafsiloti — [schemas.md](schemas.md). Jonli versiya: Swagger UI `http://localhost:3000/api/docs`.

Jami **199** ta endpoint. Barcha yo‘llar `/api/v1` prefiksi bilan (bu yerda qisqartirilgan: `GET /products` = `GET /api/v1/products`); faqat `/health/*` prefiksiz.

**Belgilar:** 🔓 — ochiq (token shart emas) · 🔁 — `Idempotency-Key` majburiy · 🔒 — `If-Match` (optimistik qulf) · 💳 — tarif chegarasi (402) · 📡 — realtime hodisa yuboradi

## Mundarija

- [Autentifikatsiya va ro‘yxatdan o‘tish](#auth) — 8 ta
- [Do‘kon hisobi: tarif, holat, o‘chirish, egasiga murojaat](#account) — 6 ta
- [Obuna to‘lovi (Payme, Click)](#billing) — 5 ta
- [Do‘kon sozlamalari](#settings) — 2 ta
- [Omborlar](#warehouses) — 7 ta
- [Mahsulot kategoriyalari](#categories) — 6 ta
- [Mahsulotlar](#products) — 10 ta
- [Ombor amallari](#stock) — 6 ta
- [Mijozlar](#clients) — 8 ta
- [Ta’minotchilar](#suppliers) — 7 ta
- [Xodimlar](#employees) — 6 ta
- [Foydalanuvchilar (kirish hisoblari)](#users) — 6 ta
- [Rollar va ruxsatlar](#roles) — 6 ta
- [Sotuvlar (chek, qaytarish, bekor qilish)](#sales) — 7 ta
- [Kassa: smena va naqd harakatlar](#cash) — 7 ta
- [Qarzlar (nasiya)](#debts) — 3 ta
- [Takliflar (smeta)](#quotes) — 8 ta
- [Kirim buyurtmalari (ta’minotchidan xarid)](#purchase-orders) — 10 ta
- [Yetkazib berish](#deliveries) — 10 ta
- [Xarajatlar va takrorlanuvchi shablonlar](#expenses) — 12 ta
- [Xabarlar (Telegram va SMS)](#messages) — 5 ta
- [Hisobotlar](#reports) — 3 ta
- [Audit jurnali](#audit) — 1 ta
- [Fayllar (rasm, hujjat)](#files) — 7 ta
- [Eksport (CSV/JSON)](#exports) — 3 ta
- [Do‘kon zaxirasi](#backup) — 1 ta
- [Migratsiya (brauzerdagi eski ma’lumotni serverga ko‘chirish)](#migration) — 2 ta
- [Platforma egasi paneli](#platform) — 35 ta
- [Sog‘liq tekshiruvi](#health) — 2 ta

<a id="auth"></a>

## Autentifikatsiya va ro‘yxatdan o‘tish

Kirish, tokenni yangilash, chiqish, joriy foydalanuvchi, parol va yangi do‘kon ochish. To‘liq oqim (token qayerda saqlanadi, 401 da nima qilinadi, bir nechta tab) — [README → Autentifikatsiya](README.md#auth).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `POST` | [`/auth/login`](#post-auth-login) 🔓 | Tizimga kirish | ochiq |
| `POST` | [`/auth/refresh`](#post-auth-refresh) 🔓 | Access tokenni yangilash | ochiq |
| `POST` | [`/auth/logout`](#post-auth-logout) 🔓 | Joriy qurilmadan chiqish | ochiq |
| `POST` | [`/auth/logout-all`](#post-auth-logout-all) | Barcha qurilmalardan chiqish | servisda / hamma |
| `GET` | [`/auth/me`](#get-auth-me) | Joriy foydalanuvchi | servisda / hamma |
| `POST` | [`/auth/change-password`](#post-auth-change-password) | Parolni o‘zgartirish | servisda / hamma |
| `GET` | [`/tenants/registration`](#get-tenants-registration) 🔓 | Ro‘yxatdan o‘tish ochiqmi va egasining aloqasi | ochiq |
| `POST` | [`/tenants/register`](#post-tenants-register) 🔓 | Yangi do‘kon ochish | ochiq |

<a id="post-auth-login"></a>

### `POST /auth/login` — Tizimga kirish

> Access token javobda, refresh token esa httpOnly cookie’da qaytadi. Bir email bir nechta do‘konda bo‘lsa AUTH_TENANT_REQUIRED qaytadi — so‘rovni `tenantId` bilan takrorlang.

**Qachon / qanday:** Kirish sahifasi. `accessToken` ni faqat XOTIRADA saqlang (localStorage/sessionStorage emas), `expiresIn` — soniya (900). `refresh_token` httpOnly cookie’sini brauzer o‘zi saqlaydi — so‘rov `credentials: "include"` bilan yuborilsin. 409 `AUTH_TENANT_REQUIRED` (bir xil email VA parol bir nechta do‘konda mos kelsa): `errors[].meta` da `{tenantId, tenantName}` ro‘yxati — do‘kon tanlatib, xuddi shu email/parol + `tenantId` bilan qayta yuboring. 423 `AUTH_ACCOUNT_LOCKED` — xodim ishdan bo‘shatilgan. To‘xtatilgan/o‘chirilayotgan do‘konga kirish MUMKIN: `user.tenant.status` (`suspended`/`deleting`) bo‘yicha faqat-o‘qish bannerini ko‘rsating. Daqiqasiga 10 urinish (IP bo‘yicha), oshsa — 429.

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Javob | `201` → [`LoginResponseDto`](schemas.md#loginresponsedto) |
| Chegara | 10 ta / daqiqa (IP bo‘yicha), oshsa — 429 |

**So‘rov tanasi** — [`LoginDto`](schemas.md#logindto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `email` | `string` | ✔ | misol `admin@crm.uz` |
| `password` | `string` | ✔ | misol `Qurilish2026!` |
| `tenantId` | `string` |  | Bitta email bir nechta do‘konda bo‘lsa, qaysi biriga kirish. Kerak bo‘lsa server AUTH_TENANT_REQUIRED xatosida ro‘yxatni beradi. |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` |
| `409` | `AUTH_TENANT_REQUIRED` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#auth)

---

<a id="post-auth-refresh"></a>

### `POST /auth/refresh` — Access tokenni yangilash

> Eski refresh token bekor qilinadi (rotatsiya). Bekor qilingan token qayta ishlatilsa barcha sessiyalar yopiladi.

**Qachon / qanday:** Tanasi yo‘q — faqat cookie. Qachon: (1) ilova ochilganda/sahifa yangilanganda (xotirada token yo‘q); (2) himoyalangan so‘rov 401 qaytarganda — keyin asl so‘rov bir marta qayta yuboriladi. Bir vaqtda FAQAT BITTA refresh (bir nechta tab bo‘lsa ham — `navigator.locks`): rotatsiya sabab ikkinchi parallel so‘rov eski cookie bilan boradi → `AUTH_TOKEN_REUSE` → foydalanuvchining BARCHA sessiyalari yopiladi. Xatolar: `AUTH_INVALID_REFRESH` — cookie yo‘q/noma’lum/muddati o‘tgan; bekor qilingan HAR QANDAY cookie (logout-all, parol o‘zgarishi, admin tiklashi, parallel refresh) — `AUTH_TOKEN_REUSE`; 423 — xodim bo‘shatilgan. Hammasida — «Sessiya tugadi», login sahifasi. Javobdagi `user.tenant.status` — do‘kon holati (banner uchun).

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Sarlavhalar | cookie `refresh_token` (brauzer o‘zi yuboradi: `credentials: "include"`) |
| Javob | `201` → [`LoginResponseDto`](schemas.md#loginresponsedto) |
| Chegara | 30 ta / daqiqa (IP bo‘yicha), oshsa — 429 |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_REFRESH` \| `AUTH_TOKEN_REUSE` |

[↑ Bo‘lim boshiga](#auth)

---

<a id="post-auth-logout"></a>

### `POST /auth/logout` — Joriy qurilmadan chiqish

**Qachon / qanday:** «Chiqish» tugmasi: cookie’dagi sessiya bekor qilinadi, cookie o‘chiriladi. Xotiradagi tokenni, so‘rovlar keshini tozalang va socket’ni uzing. Token yubormasa ham bo‘ladi.

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Sarlavhalar | cookie `refresh_token` (brauzer o‘zi yuboradi: `credentials: "include"`) |
| Javob | `201` → `{"ok": true}` |

[↑ Bo‘lim boshiga](#auth)

---

<a id="post-auth-logout-all"></a>

### `POST /auth/logout-all` — Barcha qurilmalardan chiqish

**Qachon / qanday:** Profil → «Barcha qurilmalardan chiqish». Qaytgan `revoked` — yopilgan sessiyalar soni. Boshqa qurilmalardagi access token muddati tugaguncha (≤ 15 daqiqa) ishlashi mumkin. Shu qurilmada darhol login sahifasiga o‘ting.

| | |
|---|---|
| Huquq | har qanday kirgan foydalanuvchi |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → `{"revoked": 3}` |
| Faqat-o‘qish do‘kon | ruxsat (to‘xtatilgan / o‘chirilayotgan do‘konda ham ishlaydi) |

[↑ Bo‘lim boshiga](#auth)

---

<a id="get-auth-me"></a>

### `GET /auth/me` — Joriy foydalanuvchi

**Qachon / qanday:** Joriy foydalanuvchi (ism, lavozim, rol, do‘kon). Login/refresh javobida ham xuddi shu `user` bor — ilova ochilganda alohida chaqirish shart emas. Menyu, sahifa va tugmalar — `permissions` ro‘yxatidan (README → Rollar). `access.changed` hodisasida qayta so‘rang — rol yoki uning ruxsatlari o‘zgargan.

| | |
|---|---|
| Huquq | har qanday kirgan foydalanuvchi |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`AuthUserDto`](schemas.md#authuserdto) |

[↑ Bo‘lim boshiga](#auth)

---

<a id="post-auth-change-password"></a>

### `POST /auth/change-password` — Parolni o‘zgartirish

> Muvaffaqiyatli bo‘lsa BARCHA sessiyalar yopiladi.

**Qachon / qanday:** Profil → «Parolni o‘zgartirish». Muvaffaqiyatda shu qurilma ham qo‘shilgan BARCHA sessiyalar yopiladi va cookie o‘chiriladi → foydalanuvchini login sahifasiga yuboring. Joriy parol xato — 401, kuchsiz yangi parol — 400.

| | |
|---|---|
| Huquq | har qanday kirgan foydalanuvchi |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → `{"ok": true}` |
| Faqat-o‘qish do‘kon | ruxsat (to‘xtatilgan / o‘chirilayotgan do‘konda ham ishlaydi) |

**So‘rov tanasi** — [`ChangePasswordDto`](schemas.md#changepassworddto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `currentPassword` | `string` | ✔ |  |
| `newPassword` | `string` | ✔ | Kamida 8 belgi; ommabop parollar rad etiladi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#auth)

---

<a id="get-tenants-registration"></a>

### `GET /tenants/registration` — Ro‘yxatdan o‘tish ochiqmi va egasining aloqasi

> Kirish sahifasi «Do‘kon ochish» havolasini shunga qarab ko‘rsatadi. `closed` — platforma egasi yopgan, do‘konni u ochadi; `support` — egasining telefoni/Telegram’i (yopiq rejimda va bloklangan do‘kon bannerida ko‘rsating).

**Qachon / qanday:** Kirish sahifasi ochilganda (hisobsiz): `mode: closed` bo‘lsa «Do‘kon ochish» havolasini va ro‘yxatdan o‘tish sahifasini yashiring (`/register` ga kirilsa — xabar va `support` dagi aloqa). `open` — avvalgidek.

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Javob | `200` → [`RegistrationInfoDto`](schemas.md#registrationinfodto) |

[↑ Bo‘lim boshiga](#auth)

---

<a id="post-tenants-register"></a>

### `POST /tenants/register` — Yangi do‘kon ochish

> Do‘kon, sozlama, sukut ombor, kategoriyalar va egasi (administrator) yaratiladi; javob — kirish bilan bir xil (access token + refresh cookie). Keyin mijoz sozlash sehrgarini ko‘rsatadi (`settings.onboarded = false`). Platforma egasi ro‘yxatdan o‘tishni yopgan bo‘lsa — 403 `REGISTRATION_CLOSED` (`GET /tenants/registration`).

**Qachon / qanday:** Ro‘yxatdan o‘tish sahifasi. Javob login bilan bir xil — foydalanuvchi darhol kirgan (admin). Keyin `GET /settings` → `onboarded: false` bo‘lsa dastlabki sozlash sehrgarini ko‘rsating, oxirida `PATCH /settings {"onboarded": true}`. IP bo‘yicha soatiga 5 ta. Bir email bilan bir nechta do‘kon ochish mumkin (email do‘kon ichida noyob). Login’da do‘kon tanlash (`AUTH_TENANT_REQUIRED`) faqat email VA parol bir nechta do‘konda mos kelsa chiqadi; parollar farqli bo‘lsa — mos kelgan do‘konga kiradi. 403 `REGISTRATION_CLOSED` — platforma egasi ro‘yxatdan o‘tishni yopgan: «Yangi do‘kon ochish vaqtincha yopiq» (oldindan `GET /tenants/registration`).

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Javob | `201` → [`LoginResponseDto`](schemas.md#loginresponsedto) |
| Chegara | 5 ta / soat (IP bo‘yicha), oshsa — 429 |

**So‘rov tanasi** — [`RegisterDto`](schemas.md#registerdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `storeName` | `string` | ✔ | maks. uzunlik `120`, misol `Ali Qurilish Mollari` |
| `ownerName` | `string` | ✔ | maks. uzunlik `120`, misol `Ali Valiyev` |
| `phone` | `string` | ✔ | misol `+998901234567` |
| `email` | `string` | ✔ | misol `ali@dokon.uz` |
| `password` | `string` | ✔ | Kamida 8 belgi; ommabop parollar rad etiladi — misol `Qurilish2026!` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `400` | `VALIDATION_FAILED` — jumladan kuchsiz parol |
| `403` | `REGISTRATION_CLOSED` — ro‘yxatdan o‘tish yopiq |

[↑ Bo‘lim boshiga](#auth)

---

<a id="account"></a>

## Do‘kon hisobi: tarif, holat, o‘chirish, egasiga murojaat

Sozlamalar → «Tarif va hisob» sahifasi va faqat-o‘qish banneridagi «Egasiga murojaat». Faqat administrator. Holatlar va cheklovlar — [README → Do‘kon holati va tarif](README.md#tenant), murojaat — [README → 8.5](README.md#support).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/tenants/current`](#get-tenants-current) | Tarif, holat, chegaralar va ishlatilgan hajm | faqat `admin` |
| `POST` | [`/tenants/current/delete`](#post-tenants-current-delete) | Do‘konni o‘chirish (30 kun muhlat) | faqat `admin` |
| `POST` | [`/tenants/current/restore`](#post-tenants-current-restore) | O‘chirish so‘rovini bekor qilish | faqat `admin` |
| `GET` | [`/tenants/current/requests`](#get-tenants-current-requests) | Murojaatlar tarixi | faqat `admin` |
| `POST` | [`/tenants/current/requests`](#post-tenants-current-requests) | Egasiga murojaat yuborish | faqat `admin` |
| `POST` | [`/tenants/current/requests/:id/messages`](#post-tenants-current-requests-id-messages) | Murojaatga xabar qo‘shish | faqat `admin` |

<a id="get-tenants-current"></a>

### `GET /tenants/current` — Tarif, holat, chegaralar va ishlatilgan hajm

**Qachon / qanday:** «Tarif va hisob» sahifasi: `plan`, `status`, `planExpiresAt`, `deletionScheduledAt`, `limits` va `usage` — «3 / 10 foydalanuvchi», «1,2 GB / 2 GB» kabi; `support` — egasining aloqasi (banner va murojaat oynasi). Banner uchun holat hamma rolga login/refresh javobida ham bor (`user.tenant.status`) — README → Do‘kon holati.

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`TenantAccountDto`](schemas.md#tenantaccountdto) |

[↑ Bo‘lim boshiga](#account)

---

<a id="post-tenants-current-delete"></a>

### `POST /tenants/current/delete` — Do‘konni o‘chirish (30 kun muhlat)

> Parol bilan tasdiq. Muhlat davomida faqat o‘qish va zaxira olish; keyin ma’lumot va fayllar to‘liq o‘chadi.

**Qachon / qanday:** «Xavfli zona». Parol bilan tasdiq; javobda yangilangan hisob (`status: deleting`, `deletionScheduledAt`). 30 kun — faqat o‘qish, keyin hamma narsa o‘chadi. Oldin zaxira olishni taklif qiling (`GET /backup/export`).

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`TenantAccountDto`](schemas.md#tenantaccountdto) |
| Audit jurnali | ha |
| Faqat-o‘qish do‘kon | ruxsat (to‘xtatilgan / o‘chirilayotgan do‘konda ham ishlaydi) |

**So‘rov tanasi** — [`DeleteTenantDto`](schemas.md#deletetenantdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `password` | `string` | ✔ | Administrator paroli — tasdiq uchun |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — parol noto‘g‘ri |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#account)

---

<a id="post-tenants-current-restore"></a>

### `POST /tenants/current/restore` — O‘chirish so‘rovini bekor qilish

**Qachon / qanday:** O‘chirish muhlatidagi do‘konni qaytarish (banner tugmasi). Tarif muddati o‘tib ketgan bo‘lsa holat `suspended` ga qaytadi (to‘lov kerak), aks holda `active`. Muhlatda bo‘lmasa — 422 `INVALID_STATUS_TRANSITION`.

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`TenantAccountDto`](schemas.md#tenantaccountdto) |
| Audit jurnali | ha |
| Faqat-o‘qish do‘kon | ruxsat (to‘xtatilgan / o‘chirilayotgan do‘konda ham ishlaydi) |

[↑ Bo‘lim boshiga](#account)

---

<a id="get-tenants-current-requests"></a>

### `GET /tenants/current/requests` — Murojaatlar tarixi

> Eng yangisi birinchi (20 tagacha), har birida barcha xabarlar. Yopilmagani (`status ≠ closed`) — bannerda ko‘rsatiladigani.

**Qachon / qanday:** Banner («Egasiga murojaat») va «Tarif va hisob» sahifasidagi murojaatlar bo‘limi: yopilmagani bo‘lsa — oyna uni ko‘rsatadi (xabarlar, javob yozish), bo‘lmasa — yangi murojaat formasi. `tenant.request` hodisasida qayta so‘rang.

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`TenantRequestDto`](schemas.md#tenantrequestdto)[] |

[↑ Bo‘lim boshiga](#account)

---

<a id="post-tenants-current-requests"></a>

### `POST /tenants/current/requests` — Egasiga murojaat yuborish

> Bloklangan va to‘xtatilgan do‘konda ham ishlaydi. Egasiga Telegram orqali darhol yetadi; javob — shu ro‘yxatda (`tenant.request` hodisasi). Bir vaqtda bitta yopilmagan murojaat: bor bo‘lsa 409 `ALREADY_EXISTS` (`meta.requestId`) — xabarni unga yozing.

**Qachon / qanday:** Forma: tur (`unblock` «Blokdan chiqarish», `billing` «To‘lov», `other` «Boshqa»), matn (1–1000), telefon (ixtiyoriy, sukut — administrator telefoni). Bloklangan/to‘xtatilgan do‘konda ham ishlaydi. 409 `ALREADY_EXISTS` — yopilmagani bor (`errors[0].meta.requestId`), unga xabar yozing; 429 — 24 soatda 5 ta xabar.

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`TenantRequestDto`](schemas.md#tenantrequestdto) |
| Audit jurnali | ha |
| Faqat-o‘qish do‘kon | ruxsat (to‘xtatilgan / o‘chirilayotgan do‘konda ham ishlaydi) |

**So‘rov tanasi** — [`CreateTenantRequestDto`](schemas.md#createtenantrequestdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `type` | `unblock` \| `billing` \| `other` | ✔ | `unblock` — blokdan chiqarish, `billing` — to‘lov masalasi, `other` — boshqa |
| `message` | `string` | ✔ | maks. uzunlik `1000`, misol `To‘lovni kecha o‘tkazdik, blokni olib tashlang` |
| `phone` | `string` |  | Aloqa telefoni — egasi qo‘ng‘iroq qilishi uchun (ixtiyoriy) — misol `+998901234567` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `ALREADY_EXISTS` — yopilmagan murojaat bor (`errors[0].meta.requestId`) |
| `429` | `MESSAGE_LIMIT_EXCEEDED` — 24 soatda 5 ta xabar (`meta.limit/used`) |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#account)

---

<a id="post-tenants-current-requests-id-messages"></a>

### `POST /tenants/current/requests/:id/messages` — Murojaatga xabar qo‘shish

> Yopilmagan murojaatga qo‘shimcha gap yoki egasi javobiga javob; holat yana `open` bo‘ladi.

**Qachon / qanday:** Murojaat oynasidagi «Yuborish»: egasi javobiga javob yoki qo‘shimcha gap; holat yana `open`. Yopilganiga — 422, yangisini oching.

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`TenantRequestDto`](schemas.md#tenantrequestdto) |
| Faqat-o‘qish do‘kon | ruxsat (to‘xtatilgan / o‘chirilayotgan do‘konda ham ishlaydi) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`AddRequestMessageDto`](schemas.md#addrequestmessagedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `message` | `string` | ✔ | maks. uzunlik `1000` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `422` | `INVALID_STATUS_TRANSITION` — murojaat yopilgan, yangisini yuboring |
| `429` | `MESSAGE_LIMIT_EXCEEDED` — 24 soatda 5 ta xabar (`meta.limit/used`) |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#account)

---

<a id="billing"></a>

## Obuna to‘lovi (Payme, Click)

Tarifni to‘lash: hisob-faktura yaratiladi, foydalanuvchi Payme/Click sahifasida to‘laydi, provayder serverimizga webhook yuboradi va tarif uzayadi. Frontend faqat `POST/GET /billing/invoices` ni chaqiradi.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `POST` | [`/billing/invoices`](#post-billing-invoices) | Hisob-faktura (tarif × oy) | faqat `admin` |
| `GET` | [`/billing/invoices`](#get-billing-invoices) | Hisob-fakturalar tarixi | faqat `admin` |
| `POST` | [`/billing/payme`](#post-billing-payme) 🔓 | Payme Merchant API (JSON-RPC) | ochiq |
| `POST` | [`/billing/click/prepare`](#post-billing-click-prepare) 🔓 | Click SHOP API — prepare | ochiq |
| `POST` | [`/billing/click/complete`](#post-billing-click-complete) 🔓 | Click SHOP API — complete | ochiq |

<a id="post-billing-invoices"></a>

### `POST /billing/invoices` — Hisob-faktura (tarif × oy)

> Faqat administrator. Javobda Payme va Click to‘lov sahifalari. Tarif to‘lov TASDIQLANGACH o‘zgaradi.

**Qachon / qanday:** «To‘lash»: `plan` (`basic` | `pro`) va `months` (1–12). Summa serverda: oylik narx × oy (`basic` 99 000, `pro` 249 000 so‘m). Javobdagi `payme`/`click` havolasini yangi oynada oching; `null` — serverda shu provayder sozlanmagan (tugmani yashiring). Tarif to‘lov TASDIQLANGACH o‘zgaradi: foydalanuvchi qaytgach `GET /billing/invoices` (`state: paid`) va `GET /tenants/current` ni qayta so‘rang. To‘xtatilgan (`suspended`) do‘konda ham ishlaydi.

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`CheckoutDto`](schemas.md#checkoutdto) |
| Audit jurnali | ha |
| Faqat-o‘qish do‘kon | ruxsat (to‘xtatilgan / o‘chirilayotgan do‘konda ham ishlaydi) |

**So‘rov tanasi** — [`CreateInvoiceDto`](schemas.md#createinvoicedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `plan` | `basic` \| `pro` | ✔ |  |
| `months` | `number` | ✔ | min `1`, max `12`, misol `1` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#billing)

---

<a id="get-billing-invoices"></a>

### `GET /billing/invoices` — Hisob-fakturalar tarixi

> Faqat administrator; oxirgi 50 ta.

**Qachon / qanday:** To‘lovlar tarixi (oxirgi 50). `state`: `created` → `pending` (provayder boshladi) → `paid` yoki `cancelled`.

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`InvoiceDto`](schemas.md#invoicedto)[] |

[↑ Bo‘lim boshiga](#billing)

---

<a id="post-billing-payme"></a>

### `POST /billing/payme` — Payme Merchant API (JSON-RPC)

> `Authorization: Basic base64("Paycom:KEY")`; xato ham 200.

**Qachon / qanday:** Frontend CHAQIRMAYDI — Payme serveri uchun (JSON-RPC, Basic auth).

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Sarlavhalar | `authorization` (majburiy) |
| Javob | `200` |
| Audit jurnali | ha |

**So‘rov tanasi** — [`PaymeRequestDto`](schemas.md#paymerequestdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `jsonrpc` | `string` |  | misol `2.0` |
| `id` | `object` | ✔ | So‘rov id — javobda aynan qaytadi — misol `1` |
| `method` | `string` | ✔ | misol `CheckPerformTransaction` |
| `params` | `object` | ✔ |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#billing)

---

<a id="post-billing-click-prepare"></a>

### `POST /billing/click/prepare` — Click SHOP API — prepare

**Qachon / qanday:** Frontend CHAQIRMAYDI — Click serveri uchun (form-urlencoded, MD5 imzo).

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Javob | `200` |
| Audit jurnali | ha |

**So‘rov tanasi** — [`ClickRequestDto`](schemas.md#clickrequestdto) (`application/x-www-form-urlencoded`)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `click_trans_id` | `string` | ✔ |  |
| `service_id` | `string` | ✔ |  |
| `click_paydoc_id` | `string` |  |  |
| `merchant_trans_id` | `string` | ✔ | Bizdagi hisob-faktura id |
| `merchant_prepare_id` | `string` |  | Faqat complete |
| `amount` | `string` | ✔ | misol `99000.00` |
| `action` | `string` | ✔ | 0 — prepare, 1 — complete — misol `0` |
| `error` | `string` | ✔ | misol `0` |
| `error_note` | `string` |  |  |
| `sign_time` | `string` | ✔ | misol `2026-09-23 12:00:00` |
| `sign_string` | `string` | ✔ |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#billing)

---

<a id="post-billing-click-complete"></a>

### `POST /billing/click/complete` — Click SHOP API — complete

**Qachon / qanday:** Frontend CHAQIRMAYDI — Click serveri uchun.

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Javob | `200` |
| Audit jurnali | ha |

**So‘rov tanasi** — [`ClickRequestDto`](schemas.md#clickrequestdto) (`application/x-www-form-urlencoded`)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `click_trans_id` | `string` | ✔ |  |
| `service_id` | `string` | ✔ |  |
| `click_paydoc_id` | `string` |  |  |
| `merchant_trans_id` | `string` | ✔ | Bizdagi hisob-faktura id |
| `merchant_prepare_id` | `string` |  | Faqat complete |
| `amount` | `string` | ✔ | misol `99000.00` |
| `action` | `string` | ✔ | 0 — prepare, 1 — complete — misol `0` |
| `error` | `string` | ✔ | misol `0` |
| `error_note` | `string` |  |  |
| `sign_time` | `string` | ✔ | misol `2026-09-23 12:00:00` |
| `sign_string` | `string` | ✔ |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#billing)

---

<a id="settings"></a>

## Do‘kon sozlamalari

Bitta obyekt (do‘kon nomi, QQS, chegirma chegarasi, ulgurji/bonus rejimi, chek matnlari). Ilova ochilganda bir marta o‘qiladi — POS hisobi shunga tayanadi.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/settings`](#get-settings) | Do‘kon sozlamalari | servisda / hamma |
| `PATCH` | [`/settings`](#patch-settings) 📡 | Sozlamalarni o‘zgartirish | `settings.edit` |

<a id="get-settings"></a>

### `GET /settings` — Do‘kon sozlamalari

> Barcha rollar o‘qiydi — kassa QQS va chegirma chegarasini shu yerdan oladi.

**Qachon / qanday:** Ilova ochilganda bir marta (hamma rol) va `PATCH` dan keyin. POS: `taxEnabled`/`taxRate`, `maxDiscountPct`, `wholesaleEnabled` (ulgurji narx tugmasi), `sellerWholesaleEnabled` (sotuvchiga ham ulgurji — o‘chiq bo‘lsa sotuvchida tugmani yashiring: narx unga kelmaydi, so‘rasa 403), `loyaltyEnabled`/`loyaltyRate` (bonus). Chek: `storeName`, `receiptPhone`, `receiptAddress`, `receiptFooter`, `currency`.

| | |
|---|---|
| Huquq | har qanday kirgan foydalanuvchi |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`SettingsDto`](schemas.md#settingsdto) |

[↑ Bo‘lim boshiga](#settings)

---

<a id="patch-settings"></a>

### `PATCH /settings` — Sozlamalarni o‘zgartirish

> Faqat yuborilgan maydonlar o‘zgaradi. Foizlar 0–100 oralig‘ida. `storeName` do‘kon nomini ham o‘zgartiradi (kirishdagi tanlov, `/auth/me`). `logoFileId` — tasdiqlangan `store_logo` fayli; almashtirilsa yoki `null` bo‘lsa eski fayl o‘chiriladi. Muvaffaqiyatdan keyin do‘kon xonasiga `settings.updated` hodisasi.

**Qachon / qanday:** Sozlamalar sahifasi va dastlabki sozlash sehrgari. Faqat o‘zgargan maydonlarni yuboring. Foizlar butun son 0–100. Server keshi darhol yangilanadi. `sellerWholesaleEnabled` o‘zgarsa — sotuvchilar katalogni qayta so‘rasin (`wholesalePrice` paydo bo‘ladi/yo‘qoladi).

| | |
|---|---|
| Huquq | `settings.edit` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`SettingsDto`](schemas.md#settingsdto) |
| Realtime | `settings.updated` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`UpdateSettingsDto`](schemas.md#updatesettingsdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `storeName` | `string` |  | maks. uzunlik `120`, misol `Qurilish Mollari` |
| `currency` | `string` |  | maks. uzunlik `10`, misol `so‘m` |
| `taxEnabled` | `boolean` |  |  |
| `taxRate` | `number` |  | min `0`, max `100` |
| `wholesaleEnabled` | `boolean` |  |  |
| `sellerWholesaleEnabled` | `boolean` |  | Sotuvchiga ulgurji narxda sotishni ochish |
| `loyaltyEnabled` | `boolean` |  |  |
| `loyaltyRate` | `number` |  | min `0`, max `100` |
| `maxDiscountPct` | `number` |  | min `0`, max `100` |
| `receiptPhone` | `string` |  | maks. uzunlik `40` |
| `receiptAddress` | `string` |  | maks. uzunlik `200` |
| `receiptFooter` | `string` |  | maks. uzunlik `500` |
| `onboarded` | `boolean` |  |  |
| `brandColor` | `string` \| `null` |  | `#RRGGBB`; `null` — standart rang — misol `#1A7F5A` |
| `logoFileId` | `string` (uuid) \| `null` |  | Tasdiqlangan `store_logo` fayli; `null` — logotipni olib tashlash (eski fayl o‘chiriladi) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `400` | `VALIDATION_FAILED` — jumladan `brandColor` (#RRGGBB emas) va `logoFileId` (begona, tasdiqlanmagan yoki boshqa turdagi fayl) |
| `403` | `PERMISSION_DENIED` |

Umumiy: 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#settings)

---

<a id="warehouses"></a>

## Omborlar

Omborlar ro‘yxati va kartalari. O‘chirish yo‘q — arxivlash. Sukut (`isDefault`) ombor arxivlanmaydi. Tarif ombor sonini cheklaydi (402).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/warehouses`](#get-warehouses) | Omborlar ro‘yxati | `products.view` |
| `POST` | [`/warehouses`](#post-warehouses) 💳 | Ombor qo‘shish | `stock.manage` |
| `GET` | [`/warehouses/stock`](#get-warehouses-stock) | Omborlar bo‘yicha tovar | `products.view` |
| `GET` | [`/warehouses/:id`](#get-warehouses-id) | Bitta ombor | `products.view` |
| `PATCH` | [`/warehouses/:id`](#patch-warehouses-id) 🔒 | Omborni tahrirlash | `stock.manage` |
| `POST` | [`/warehouses/:id/archive`](#post-warehouses-id-archive) | Omborni arxivlash | `stock.manage` |
| `POST` | [`/warehouses/:id/restore`](#post-warehouses-id-restore) 💳 | Omborni arxivdan qaytarish | `stock.manage` |

<a id="get-warehouses"></a>

### `GET /warehouses` — Omborlar ro‘yxati

> Arxivlanganlari ham (`archived` filtri bilan ajratiladi).

**Qachon / qanday:** Omborlar sahifasi va har qanday «ombor tanlash» ro‘yxati (POS, kirim, ko‘chirish, buyurtma). Tanlov uchun `archived=false`. Sukut tartib — yaratilish (sukut ombor birinchi).

| | |
|---|---|
| Huquq | `products.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `sort` | query | `id` \| `-id` \| `name` \| `-name` \| `createdAt` \| `-createdAt` |  | sukut `"createdAt"` |
| `archived` | query | `boolean` |  | Berilmasa — hammasi (arxivlanganlari ham) |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#warehouses)

---

<a id="post-warehouses"></a>

### `POST /warehouses` — Ombor qo‘shish

> Nom do‘kon ichida noyob.

**Qachon / qanday:** Yangi ombor. Tarif chegarasi to‘lsa — 402 `PLAN_LIMIT_EXCEEDED` («Tarifni oshiring» taklifi).

| | |
|---|---|
| Huquq | `stock.manage` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`WarehouseDto`](schemas.md#warehousedto) |
| Audit jurnali | ha — `warehouse.create` |

**So‘rov tanasi** — [`CreateWarehouseDto`](schemas.md#createwarehousedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `100`, misol `Sklad №2` |
| `address` | `string` \| `null` |  | maks. uzunlik `200`, misol `Toshkent, Sergeli 12` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `402` | `PLAN_LIMIT_EXCEEDED` — tarif chegarasi (`meta.resource`, `limit`, `used`); tarif oshirilgach darhol ochiladi |
| `409` | `ALREADY_EXISTS` — bunday nomli ombor bor |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#warehouses)

---

<a id="get-warehouses-stock"></a>

### `GET /warehouses/stock` — Omborlar bo‘yicha tovar

> Qoldig‘i bor turlar va tannarxdagi qiymat (sotuvchiga qiymat chiqmaydi).

**Qachon / qanday:** Omborlar sahifasidagi kartalar: har omborda qoldig‘i bor tovar turlari soni va tannarxdagi qiymati (`stockValue` sotuvchiga chiqmaydi).

| | |
|---|---|
| Huquq | `products.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`WarehouseStockDto`](schemas.md#warehousestockdto)[] |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#warehouses)

---

<a id="get-warehouses-id"></a>

### `GET /warehouses/:id` — Bitta ombor

**Qachon / qanday:** Bitta ombor — tahrir formasi (`updatedAt` → `If-Match`).

| | |
|---|---|
| Huquq | `products.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`WarehouseDto`](schemas.md#warehousedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#warehouses)

---

<a id="patch-warehouses-id"></a>

### `PATCH /warehouses/:id` — Omborni tahrirlash

**Qachon / qanday:** Nom/manzil. `If-Match: <updatedAt>` yuboring (README → Optimistik qulf).

| | |
|---|---|
| Huquq | `stock.manage` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `If-Match` (ixtiyoriy) |
| Javob | `200` → [`WarehouseDto`](schemas.md#warehousedto) |
| Audit jurnali | ha — `warehouse.update` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateWarehouseDto`](schemas.md#updatewarehousedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `100`, misol `Sklad №2` |
| `address` | `string` \| `null` |  | maks. uzunlik `200`, misol `Toshkent, Sergeli 12` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `ALREADY_EXISTS` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `VERSION_CONFLICT` (`If-Match` eskirgan — javobda `current`); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#warehouses)

---

<a id="post-warehouses-id-archive"></a>

### `POST /warehouses/:id/archive` — Omborni arxivlash

> Sukut ombor arxivlanmaydi (WAREHOUSE_DEFAULT_LOCKED). Omborda tovar qolgan bo‘lsa amal bajariladi, lekin `stockWarning` qaytadi. Joriy ombor arxivlansa kassa sukut omborga o‘tadi.

**Qachon / qanday:** Omborni arxivlash (o‘chirish o‘rniga). Javobdagi `stockWarning` bo‘lsa — «omborda N xil tovar qoldi» ogohlantirishi. Arxiv omborga kirim/ko‘chirish/sotuv yo‘q (422 `WAREHOUSE_ARCHIVED`), undan chiqim mumkin.

| | |
|---|---|
| Huquq | `stock.manage` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ArchivedWarehouseDto`](schemas.md#archivedwarehousedto) |
| Audit jurnali | ha — `warehouse.archive` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `422` | `WAREHOUSE_DEFAULT_LOCKED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#warehouses)

---

<a id="post-warehouses-id-restore"></a>

### `POST /warehouses/:id/restore` — Omborni arxivdan qaytarish

**Qachon / qanday:** Arxivdan qaytarish; tarif chegarasiga kiradi (402).

| | |
|---|---|
| Huquq | `stock.manage` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`WarehouseDto`](schemas.md#warehousedto) |
| Audit jurnali | ha — `warehouse.restore` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `402` | `PLAN_LIMIT_EXCEEDED` — tarif chegarasi (`meta.resource`, `limit`, `used`); tarif oshirilgach darhol ochiladi |
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#warehouses)

---

<a id="categories"></a>

## Mahsulot kategoriyalari

Katalog filtri va mahsulot formasidagi tanlov. `sortOrder` — ko‘rsatish tartibi.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/categories`](#get-categories) | Kategoriyalar ro‘yxati | `products.view` |
| `POST` | [`/categories`](#post-categories) | Kategoriya qo‘shish | `products.create` |
| `GET` | [`/categories/:id`](#get-categories-id) | Bitta kategoriya | `products.view` |
| `PATCH` | [`/categories/:id`](#patch-categories-id) 🔒 | Kategoriyani tahrirlash | `products.edit` |
| `DELETE` | [`/categories/:id`](#delete-categories-id) | Kategoriyani o‘chirish (yumshoq) | `products.delete` |
| `POST` | [`/categories/:id/restore`](#post-categories-id-restore) | O‘chirilgan kategoriyani tiklash (undo) | `products.delete` |

<a id="get-categories"></a>

### `GET /categories` — Kategoriyalar ro‘yxati

> Har biri mahsulotlar soni bilan.

**Qachon / qanday:** Katalog filtri, mahsulot formasi. Har kategoriyada mahsulotlar soni. Sukut tartib — `sortOrder`.

| | |
|---|---|
| Huquq | `products.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `sort` | query | `id` \| `-id` \| `name` \| `-name` \| `sortOrder` \| `-sortOrder` |  | sukut `"sortOrder"` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#categories)

---

<a id="post-categories"></a>

### `POST /categories` — Kategoriya qo‘shish

> Nom do‘kon ichida noyob.

**Qachon / qanday:** Yangi kategoriya (katalog yoki mahsulot formasidagi «+»). `sortOrder` berilmasa — ro‘yxat oxiriga. Nom band — 409 `ALREADY_EXISTS`.

| | |
|---|---|
| Huquq | `products.create` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`CategoryDto`](schemas.md#categorydto) |
| Audit jurnali | ha — `category.create` |

**So‘rov tanasi** — [`CreateCategoryDto`](schemas.md#createcategorydto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `60`, misol `Tom yopish materiallari` |
| `sortOrder` | `number` |  | Berilmasa — ro‘yxat oxiriga qo‘shiladi — min `0` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `ALREADY_EXISTS` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#categories)

---

<a id="get-categories-id"></a>

### `GET /categories/:id` — Bitta kategoriya

**Qachon / qanday:** Bitta kategoriya — tahrir formasi.

| | |
|---|---|
| Huquq | `products.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`CategoryDto`](schemas.md#categorydto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#categories)

---

<a id="patch-categories-id"></a>

### `PATCH /categories/:id` — Kategoriyani tahrirlash

> Nomni o‘zgartirish mahsulotlarga tegmaydi — ular `categoryId` bilan bog‘langan (D4).

**Qachon / qanday:** Nom yoki tartib. `If-Match` qo‘llanadi.

| | |
|---|---|
| Huquq | `products.edit` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `If-Match` (ixtiyoriy) |
| Javob | `200` → [`CategoryDto`](schemas.md#categorydto) |
| Audit jurnali | ha — `category.update` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateCategoryDto`](schemas.md#updatecategorydto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `60`, misol `Tom yopish materiallari` |
| `sortOrder` | `number` |  | Berilmasa — ro‘yxat oxiriga qo‘shiladi — min `0` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `ALREADY_EXISTS` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `VERSION_CONFLICT` (`If-Match` eskirgan — javobda `current`); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#categories)

---

<a id="delete-categories-id"></a>

### `DELETE /categories/:id` — Kategoriyani o‘chirish (yumshoq)

**Qachon / qanday:** Yumshoq o‘chirish; mahsulot bor bo‘lsa — 409 `CATEGORY_IN_USE`. Toast’dagi «Qaytarish» → `POST /categories/:id/restore`.

| | |
|---|---|
| Huquq | `products.delete` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha — `category.delete` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `CATEGORY_IN_USE` — kategoriyada mahsulot bor |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#categories)

---

<a id="post-categories-id-restore"></a>

### `POST /categories/:id/restore` — O‘chirilgan kategoriyani tiklash (undo)

**Qachon / qanday:** O‘chirishni qaytarish (toast’dagi «Qaytarish», undo).

| | |
|---|---|
| Huquq | `products.delete` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`CategoryDto`](schemas.md#categorydto) |
| Audit jurnali | ha — `category.restore` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#categories)

---

<a id="products"></a>

## Mahsulotlar

Katalog, mahsulot kartasi, POS qidiruvi, CSV import, ommaviy narx. Qoldiq mahsulot formasida O‘ZGARTIRILMAYDI — faqat ombor amallari (`/stock/*`), kirim buyurtmasi, sotuv orqali. Birliklar va narxlar qoidasi — [README → Mahsulot va birliklar](README.md#units).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/products/summary`](#get-products-summary) | Katalog xulosasi | `products.view` |
| `GET` | [`/products`](#get-products) | Mahsulotlar katalogi | `products.view` |
| `POST` | [`/products`](#post-products) | Mahsulot qo‘shish | `products.create` |
| `GET` | [`/products/:id/stats`](#get-products-id-stats) | Mahsulot kartasi raqamlari | `products.view` |
| `GET` | [`/products/:id`](#get-products-id) | Bitta mahsulot (ombor qoldiqlari bilan) | `products.view` |
| `PATCH` | [`/products/:id`](#patch-products-id) 🔒 | Mahsulotni tahrirlash | `products.edit` |
| `DELETE` | [`/products/:id`](#delete-products-id) | Mahsulotni o‘chirish (yumshoq) | `products.delete` |
| `POST` | [`/products/import`](#post-products-import) | Mahsulotlarni import qilish | `products.create` |
| `POST` | [`/products/bulk-price`](#post-products-bulk-price) | Narxni ommaviy o‘zgartirish | `products.edit` |
| `POST` | [`/products/:id/restore`](#post-products-id-restore) | O‘chirilgan mahsulotni tiklash (undo) | `products.delete` |

<a id="get-products-summary"></a>

### `GET /products/summary` — Katalog xulosasi

> Faol turlar, kam qolganlar, ombor qiymati (tannarxda; sotuvchiga chiqmaydi).

**Qachon / qanday:** Katalog tepasidagi kartalar: faol turlar, kam qolganlar, ombor qiymati (sotuvchiga qiymat chiqmaydi).

| | |
|---|---|
| Huquq | `products.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ProductSummaryDto`](schemas.md#productsummarydto) |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#products)

---

<a id="get-products"></a>

### `GET /products` — Mahsulotlar katalogi

> Qidiruv: nom va SKU bo‘yicha qism, shtrix-kod bo‘yicha aniq moslik. Har mahsulotda ombor bo‘yicha qoldiq (`stocks`). Sotuvchi rolida `cost` va `wholesalePrice` qaytmaydi. So‘rov byudjeti — 2.

**Qachon / qanday:** Katalog jadvali (server sahifalash/saralash), POS qidiruvi va mahsulot tanlash oynalari. `q` — nom/SKU bo‘yicha qism + shtrix-kod bo‘yicha aniq moslik (skaner shu bilan ishlaydi). `lowStock=true` — kam qolganlar (`stock ≤ minStock`). `warehouseId` — faqat shu omborda qoldig‘i BOR (> 0) mahsulotlar, `warehouseStock` — o‘sha ombor qoldig‘i (inventarizatsiya varag‘i uchun filtrsiz ro‘yxat + `stocks[warehouseId] ?? 0`). Har qatorda `stock` (jami) va `stocks` (`{warehouseId: qty}`). Sotuvchida `cost`, `wholesalePrice` YO‘Q.

| | |
|---|---|
| Huquq | `products.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `sort` | query | `id` \| `-id` \| `name` \| `-name` \| `sku` \| `-sku` \| `price` \| `-price` \| `stock` \| `-stock` \| `createdAt` \| `-createdAt` |  | sukut `"name"` |
| `categoryId` | query | `string` (uuid) |  |  |
| `supplierId` | query | `string` (uuid) |  |  |
| `warehouseId` | query | `string` (uuid) |  | Faqat shu omborda qoldig‘i bor tovarlar; har birida `warehouseStock` qaytadi |
| `lowStock` | query | `boolean` |  | Faqat kam qolganlar: qoldiq ≤ minimal |
| `archived` | query | `boolean` |  | `true` — faqat arxivlanganlar — sukut `false` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#products)

---

<a id="post-products"></a>

### `POST /products` — Mahsulot qo‘shish

> Qoldiq bu yerda berilmaydi — u kirim (ombor amali) orqali keladi.

**Qachon / qanday:** Yangi mahsulot. Qoldiq bu yerda BERILMAYDI — keyin `POST /stock/intake`. Rasm: avval fayl yuklang (`/files/presign` → PUT → `/files/:id/confirm`, `kind: product_image`), keyin `imageFileId`. Qo‘shimcha birlik: `altUnit` + `altFactor` birga, ma’nosi «1 `altUnit` = `altFactor` ta asosiy birlik»: asosiy `kg` + qo‘shimcha `qop` → `altFactor: 50` (1 qop = 50 kg); asosiy `qop` + qo‘shimcha `kg` → `altFactor: 0.02`.

| | |
|---|---|
| Huquq | `products.create` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`ProductDto`](schemas.md#productdto) |
| Audit jurnali | ha — `product.create` |

**So‘rov tanasi** — [`CreateProductDto`](schemas.md#createproductdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `200`, misol `Portland sement M400` |
| `sku` | `string` | ✔ | Do‘kon ichida noyob — maks. uzunlik `64`, misol `SEM-400` |
| `barcode` | `string` \| `null` |  | maks. uzunlik `64`, misol `4780000000011` |
| `categoryId` | `string` (uuid) \| `null` |  |  |
| `supplierId` | `string` (uuid) \| `null` |  |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ |  |
| `price` | `number` | ✔ | Butun so‘m — misol `60000` |
| `wholesalePrice` | `number` | ✔ | Butun so‘m — misol `55000` |
| `cost` | `number` | ✔ | Butun so‘m — misol `40000` |
| `minStock` | `number` |  | 3 kasr xonagacha — misol `20` |
| `archived` | `boolean` |  |  |
| `altUnit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` \| `null` |  | `altFactor` bilan birga beriladi |
| `altFactor` | `number` \| `null` |  | `altUnit` bilan birga beriladi — misol `50` |
| `imageFileId` | `string` (uuid) \| `null` |  | Tasdiqlangan (`ready`) `product_image` fayli; `null` — rasmni olib tashlash |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `DUPLICATE_SKU` \| `ALREADY_EXISTS` (shtrix-kod) |
| `422` | `REFERENCE_NOT_FOUND` — kategoriya/ta’minotchi |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#products)

---

<a id="get-products-id-stats"></a>

### `GET /products/:id/stats` — Mahsulot kartasi raqamlari

> Sof sotilgan miqdor (asosiy birlikda) va oxirgi sotuv — bitta so‘rov.

**Qachon / qanday:** Mahsulot kartasidagi raqamlar: sof sotilgan miqdor (asosiy birlikda) va oxirgi sotuv sanasi.

| | |
|---|---|
| Huquq | `products.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ProductStatsDto`](schemas.md#productstatsdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#products)

---

<a id="get-products-id"></a>

### `GET /products/:id` — Bitta mahsulot (ombor qoldiqlari bilan)

**Qachon / qanday:** Mahsulot kartasi / tahrir formasi (ombor qoldiqlari bilan).

| | |
|---|---|
| Huquq | `products.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ProductDto`](schemas.md#productdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#products)

---

<a id="patch-products-id"></a>

### `PATCH /products/:id` — Mahsulotni tahrirlash

> Qoldiqni bu yerda o‘zgartirib bo‘lmaydi (`stock` maydoni rad etiladi).

**Qachon / qanday:** Tahrir. `If-Match: <updatedAt>` yuboring. `imageFileId: null` — rasmni olib tashlash. Qoldiqni o‘zgartirib bo‘lmaydi.

| | |
|---|---|
| Huquq | `products.edit` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `If-Match` (ixtiyoriy) |
| Javob | `200` → [`ProductDto`](schemas.md#productdto) |
| Audit jurnali | ha — `product.update` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateProductDto`](schemas.md#updateproductdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `200`, misol `Portland sement M400` |
| `sku` | `string` |  | Do‘kon ichida noyob — maks. uzunlik `64`, misol `SEM-400` |
| `barcode` | `string` \| `null` |  | maks. uzunlik `64`, misol `4780000000011` |
| `categoryId` | `string` (uuid) \| `null` |  |  |
| `supplierId` | `string` (uuid) \| `null` |  |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` |  |  |
| `price` | `number` |  | Butun so‘m — misol `60000` |
| `wholesalePrice` | `number` |  | Butun so‘m — misol `55000` |
| `cost` | `number` |  | Butun so‘m — misol `40000` |
| `minStock` | `number` |  | 3 kasr xonagacha — misol `20` |
| `archived` | `boolean` |  |  |
| `altUnit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` \| `null` |  | `altFactor` bilan birga beriladi |
| `altFactor` | `number` \| `null` |  | `altUnit` bilan birga beriladi — misol `50` |
| `imageFileId` | `string` (uuid) \| `null` |  | Tasdiqlangan (`ready`) `product_image` fayli; `null` — rasmni olib tashlash |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `DUPLICATE_SKU` \| `ALREADY_EXISTS` |
| `422` | `REFERENCE_NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `VERSION_CONFLICT` (`If-Match` eskirgan — javobda `current`); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#products)

---

<a id="delete-products-id"></a>

### `DELETE /products/:id` — Mahsulotni o‘chirish (yumshoq)

**Qachon / qanday:** Yumshoq o‘chirish; toast’dagi «Qaytarish» → `POST /products/:id/restore`. Sotishni to‘xtatish uchun `archived: true` ham bor.

| | |
|---|---|
| Huquq | `products.delete` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha — `product.delete` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#products)

---

<a id="post-products-import"></a>

### `POST /products/import` — Mahsulotlarni import qilish

> Har qator alohida tekshiriladi: xato qatorlar `errors` da qaytadi, to‘g‘rilari saqlanadi (bitta tranzaksiyada, 1000 qator — bitta INSERT). Maksimal 5000 qator. Qoldiq importda yo‘q — u kirim orqali keladi. `upsert` — SKU bo‘yicha mavjudini yangilaydi.

**Qachon / qanday:** CSV import oynasi: fayl brauzerda o‘qiladi va qatorlar JSON bilan yuboriladi (≤ 5000). `mode: upsert` — SKU bo‘yicha mavjudini yangilaydi. Javobdagi `errors` (`{ row, code, detail }` — qator raqami, kod, sabab) jadvalda ko‘rsatilsin — to‘g‘ri qatorlar baribir saqlanadi. Qoldiq importda yo‘q.

| | |
|---|---|
| Huquq | `products.create` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ImportResultDto`](schemas.md#importresultdto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`ImportProductsDto`](schemas.md#importproductsdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `rows` | [`ProductImportRowDto`](schemas.md#productimportrowdto)[] | ✔ | ko‘pi bilan `5000` |
| `mode` | `create` \| `upsert` |  | `create` — faqat yangi; `upsert` — SKU bo‘yicha mavjudini yangilaydi — sukut `"create"` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `400` | `VALIDATION_FAILED` — so‘rov shakli |

Umumiy: 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#products)

---

<a id="post-products-bulk-price"></a>

### `POST /products/bulk-price` — Narxni ommaviy o‘zgartirish

> Bitta so‘rov bilan. Eski va yangi narxlar audit jurnaliga yoziladi. Natija manfiy bo‘lmaydi; foizda butun so‘mga yaxlitlanadi.

**Qachon / qanday:** Katalogda belgilangan mahsulotlar → «Narxni o‘zgartirish»: `percent` (−100…1000 %), `fixed` (± so‘m) yoki `set` (aniq narx); `target` — `price` yoki `wholesalePrice`. Eski/yangi narx auditga yoziladi.

| | |
|---|---|
| Huquq | `products.edit` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`BulkPriceResultDto`](schemas.md#bulkpriceresultdto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`BulkPriceDto`](schemas.md#bulkpricedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `ids` | (`string` (uuid))[] | ✔ | ko‘pi bilan `1000` |
| `mode` | `percent` \| `fixed` \| `set` | ✔ | `percent` — foizga (−100…1000), `fixed` — so‘mga (±), `set` — aniq narx |
| `value` | `number` | ✔ | misol `10` |
| `target` | `price` \| `wholesalePrice` | ✔ | Tannarx bu yerda o‘zgarmaydi — u kirimda hisoblanadi (I11) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `400` | `VALIDATION_FAILED` |

Umumiy: 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#products)

---

<a id="post-products-id-restore"></a>

### `POST /products/:id/restore` — O‘chirilgan mahsulotni tiklash (undo)

**Qachon / qanday:** O‘chirishni qaytarish; shtrix-kod shu orada boshqa mahsulotga berilgan bo‘lsa — 409 `ALREADY_EXISTS`.

| | |
|---|---|
| Huquq | `products.delete` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ProductDto`](schemas.md#productdto) |
| Audit jurnali | ha — `product.restore` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `ALREADY_EXISTS` — shtrix-kod boshqa mahsulotda |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#products)

---

<a id="stock"></a>

## Ombor amallari

Kirim, hisobdan chiqarish, inventarizatsiya, omborlar orasida ko‘chirish, harakatlar jurnali, buyurtma taklifi. Barcha yozuvchi amallar idempotent (`Idempotency-Key` majburiy), miqdor — mahsulotning ASOSIY birligida.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `POST` | [`/stock/intake`](#post-stock-intake) 🔁 📡 | Kirim | `stock.operate` |
| `POST` | [`/stock/writeoff`](#post-stock-writeoff) 🔁 📡 | Chiqim (hisobdan chiqarish) | `stock.operate` |
| `POST` | [`/stock/adjust`](#post-stock-adjust) 🔁 📡 | Inventarizatsiya | `stock.operate` |
| `POST` | [`/stock/transfer`](#post-stock-transfer) 🔁 📡 | Omborlar orasida ko‘chirish | `stock.operate` |
| `GET` | [`/stock/movements`](#get-stock-movements) | Harakatlar jurnali | `stock.view` |
| `GET` | [`/stock/reorder-suggestions`](#get-stock-reorder-suggestions) | Buyurtma taklifi | `stock.view` |

<a id="post-stock-intake"></a>

### `POST /stock/intake` — Kirim

> Qoldiq ortadi; `unitCost` berilsa o‘rtacha tannarx qayta hisoblanadi (I11). Idempotent.

**Qachon / qanday:** Kirim oynasi. `qty` — ASOSIY birlikda. `unitCost` berilsa o‘rtacha tannarx qayta hisoblanadi. Har yangi amal uchun yangi `Idempotency-Key`; tarmoq xatosida XUDDI SHU kalit bilan qayta yuboring. Javobda yangilangan qoldiq (`product.stock`, `stocks`).

| | |
|---|---|
| Huquq | `stock.operate` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`StockOperationResultDto`](schemas.md#stockoperationresultdto) |
| Realtime | `stock.changed` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`IntakeDto`](schemas.md#intakedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `productId` | `string` (uuid) | ✔ |  |
| `warehouseId` | `string` (uuid) |  | Berilmasa — joriy ombor |
| `qty` | `number` | ✔ | ASOSIY birlikda, 3 kasrgacha — misol `50` |
| `unitCost` | `number` |  | Kirim narxi, butun so‘m — o‘rtacha tannarx qayta hisoblanadi (I11) — misol `42000` |
| `supplierId` | `string` (uuid) |  |  |
| `note` | `string` |  | maks. uzunlik `500`, misol `Hujjat 4512` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `IDEMPOTENCY_MISMATCH` |
| `422` | `REFERENCE_NOT_FOUND` \| `WAREHOUSE_ARCHIVED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#stock)

---

<a id="post-stock-writeoff"></a>

### `POST /stock/writeoff` — Chiqim (hisobdan chiqarish)

> Sabab majburiy. Qoldiqdan ko‘p — 422 STOCK_INSUFFICIENT (I2).

**Qachon / qanday:** Hisobdan chiqarish (sinish, yo‘qotish). Sabab majburiy. Qoldiqdan ko‘p — 422 `STOCK_INSUFFICIENT` (`meta.available`).

| | |
|---|---|
| Huquq | `stock.operate` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`StockOperationResultDto`](schemas.md#stockoperationresultdto) |
| Realtime | `stock.changed` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`WriteoffDto`](schemas.md#writeoffdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `productId` | `string` (uuid) | ✔ |  |
| `warehouseId` | `string` (uuid) |  | Berilmasa — joriy ombor |
| `qty` | `number` | ✔ | ASOSIY birlikda, 3 kasrgacha — misol `2` |
| `reason` | `string` | ✔ | Sabab MAJBURIY — maks. uzunlik `500`, misol `Namlikdan yaroqsiz` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `422` | `STOCK_INSUFFICIENT` — qaysi omborda yetmagani bilan |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#stock)

---

<a id="post-stock-adjust"></a>

### `POST /stock/adjust` — Inventarizatsiya

> Sanalgan miqdor bilan farq bitta `adjustment` harakatiga yoziladi; farq 0 — harakat yo‘q.

**Qachon / qanday:** Inventarizatsiya: `items[]` — mahsulot va SANALGAN miqdor; farqni server hisoblaydi (farq 0 — harakat yozilmaydi). Javob: `{ adjusted: [{ productId, movementId, delta, balanceAfter }], unchanged }`.

| | |
|---|---|
| Huquq | `stock.operate` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`AdjustResultDto`](schemas.md#adjustresultdto) |
| Realtime | `stock.changed` (farq bo‘lsa) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`AdjustDto`](schemas.md#adjustdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `items` | [`AdjustItemDto`](schemas.md#adjustitemdto)[] | ✔ | ko‘pi bilan `500` |
| `warehouseId` | `string` (uuid) |  | Berilmasa — joriy ombor |
| `note` | `string` |  | maks. uzunlik `500`, misol `Oylik inventarizatsiya` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `400` | `VALIDATION_FAILED` — masalan takror mahsulot |

Umumiy: 403 `PERMISSION_DENIED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#stock)

---

<a id="post-stock-transfer"></a>

### `POST /stock/transfer` — Omborlar orasida ko‘chirish

> Ikki harakat (`transfer_out` + `transfer_in`) bitta amalda; jami qoldiq o‘zgarmaydi.

**Qachon / qanday:** Omborlar orasida ko‘chirish. Bir xil ombor — 422 `WAREHOUSE_SAME`. Javob: `{ outMovementId, inMovementId, product }`.

| | |
|---|---|
| Huquq | `stock.operate` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`TransferResultDto`](schemas.md#transferresultdto) |
| Realtime | `stock.changed` — har ombor uchun alohida (2 ta) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`TransferDto`](schemas.md#transferdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `productId` | `string` (uuid) | ✔ |  |
| `fromWarehouseId` | `string` (uuid) | ✔ |  |
| `toWarehouseId` | `string` (uuid) | ✔ |  |
| `qty` | `number` | ✔ | misol `30` |
| `note` | `string` |  | maks. uzunlik `500`, misol `Skladdan zalga` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `422` | `WAREHOUSE_SAME` \| `STOCK_INSUFFICIENT` \| `WAREHOUSE_ARCHIVED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#stock)

---

<a id="get-stock-movements"></a>

### `GET /stock/movements` — Harakatlar jurnali

> Kursorli sahifalash: javobdagi `nextCursor` keyingi so‘rovga `cursor` bo‘lib beriladi.

**Qachon / qanday:** Ombor harakatlari jurnali (kursorli: «Ko‘proq» yoki cheksiz aylantirish). Mahsulot kartasidagi tarix — `productId`.

| | |
|---|---|
| Huquq | `stock.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`MovementPageDto`](schemas.md#movementpagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `productId` | query | `string` (uuid) |  |  |
| `warehouseId` | query | `string` (uuid) |  |  |
| `type` | query | `intake` \| `writeoff` \| `adjustment` \| `sale` \| `return` \| `transfer_out` \| `transfer_in` |  |  |
| `dateFrom` | query | `string` |  | misol `2026-09-01` |
| `dateTo` | query | `string` |  | misol `2026-09-30` |
| `q` | query | `string` |  | Mahsulot nomi yoki izoh bo‘yicha |
| `cursor` | query | `string` |  | Oldingi javobdagi `nextCursor` |
| `limit` | query | `number` |  | min `1`, max `200`, sukut `50` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#stock)

---

<a id="get-stock-reorder-suggestions"></a>

### `GET /stock/reorder-suggestions` — Buyurtma taklifi

> Kam qolgan tovarlar ta’minotchi bo‘yicha: `max(minStock×2 − stock, minStock)` (shared).

**Qachon / qanday:** «Buyurtma berish kerak» ro‘yxati — kam qolgan tovarlar ta’minotchi bo‘yicha, taklif miqdori bilan. Bundan kirim buyurtmasi (`POST /purchase-orders`) tuzish mumkin.

| | |
|---|---|
| Huquq | `stock.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ReorderGroupDto`](schemas.md#reordergroupdto)[] |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#stock)

---

<a id="clients"></a>

## Mijozlar

Mijozlar sahifasi, mijoz kartasi, POS’da mijoz tanlash (bonus, nasiya). Telefon saqlashda normallashtiriladi (faqat raqamlar va boshidagi `+`).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/clients`](#get-clients) | Mijozlar ro‘yxati | `customers.view` |
| `POST` | [`/clients`](#post-clients) | Mijoz qo‘shish | `customers.create` |
| `GET` | [`/clients/:id/stats`](#get-clients-id-stats) | Mijoz kartasi raqamlari | `customers.view` |
| `GET` | [`/clients/:id`](#get-clients-id) | Bitta mijoz | `customers.view` |
| `PATCH` | [`/clients/:id`](#patch-clients-id) 🔒 | Mijozni tahrirlash | `customers.edit` |
| `DELETE` | [`/clients/:id`](#delete-clients-id) | Mijozni o‘chirish (yumshoq) | `customers.delete` |
| `POST` | [`/clients/:id/restore`](#post-clients-id-restore) | O‘chirilgan mijozni tiklash (undo) | `customers.delete` |
| `POST` | [`/clients/:id/telegram-link`](#post-clients-id-telegram-link) | Telegram’ga ulash — shaxsiy havola (QR uchun) | `customers.edit` |

<a id="get-clients"></a>

### `GET /clients` — Mijozlar ro‘yxati

> `q` — nom, kompaniya va telefon raqamlari bo‘yicha; `phone` — aniq moslik.

**Qachon / qanday:** Mijozlar sahifasi va POS’da mijoz tanlash (`q` — nom, kompaniya, telefon). `phone` — aniq moslik (skaner/telefon bilan tez topish). Qatorda `bonusPoints`, `salesCount`, `telegramStatus` (`telegramStatus=none` — botga ulanmaganlar).

| | |
|---|---|
| Huquq | `customers.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `sort` | query | `id` \| `-id` \| `name` \| `-name` \| `createdAt` \| `-createdAt` \| `bonusPoints` \| `-bonusPoints` |  | sukut `"-createdAt"` |
| `status` | query | `lead` \| `active` \| `inactive` |  |  |
| `group` | query | `retail` \| `wholesale` \| `vip` |  |  |
| `type` | query | `individual` \| `company` |  |  |
| `phone` | query | `string` |  | ANIQ moslik (kassada mijozni topish) — `(tenant_id, phone)` indeksi ishlatiladi — misol `+998901234567` |
| `telegramStatus` | query | `none` \| `linked` \| `blocked` |  | Masalan `none` — botga ulanmaganlar (ularga shaxsiy QR berish uchun) |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#clients)

---

<a id="post-clients"></a>

### `POST /clients` — Mijoz qo‘shish

**Qachon / qanday:** Yangi mijoz (Mijozlar sahifasi yoki POS’dagi «+ Mijoz»). Sukut: `type=individual`, `status=lead`, `group=retail`. `creditLimit` `null`/0 — nasiya cheklanmagan; `paymentTermDays` — nasiya chekning to‘lov muddati (kun).

| | |
|---|---|
| Huquq | `customers.create` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`ClientDto`](schemas.md#clientdto) |
| Audit jurnali | ha — `client.create` |

**So‘rov tanasi** — [`CreateClientDto`](schemas.md#createclientdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `200`, misol `Alisher Qodirov` |
| `phone` | `string` | ✔ | Saqlashda raqamlar va boshidagi `+` qoladi — misol `+998 90 123-45-67` |
| `type` | `individual` \| `company` |  | sukut `"individual"` |
| `email` | `string` |  | misol `ali@mail.uz` |
| `status` | `lead` \| `active` \| `inactive` |  | sukut `"lead"` |
| `group` | `retail` \| `wholesale` \| `vip` |  | sukut `"retail"` |
| `creditLimit` | `number` \| `null` |  | Nasiya limiti, butun so‘m; null yoki 0 — cheklanmagan |
| `paymentTermDays` | `number` \| `null` |  | min `0`, max `365` |
| `source` | `string` |  | maks. uzunlik `100`, misol `Instagram` |
| `company` | `string` \| `null` |  | maks. uzunlik `200` |
| `notes` | `string` \| `null` |  | maks. uzunlik `1000` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#clients)

---

<a id="get-clients-id-stats"></a>

### `GET /clients/:id/stats` — Mijoz kartasi raqamlari

> Sof xarid, qarz, muddati o‘tgani, oxirgi xarid — bitta so‘rov.

**Qachon / qanday:** Mijoz kartasi va POS’da mijoz tanlanganda: jami xarid, joriy qarz, muddati o‘tgan qarz, oxirgi xarid. `overdue > 0` bo‘lsa POS nasiyani ruxsat etmaydi — oldindan ogohlantiring.

| | |
|---|---|
| Huquq | `customers.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ClientStatsDto`](schemas.md#clientstatsdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#clients)

---

<a id="get-clients-id"></a>

### `GET /clients/:id` — Bitta mijoz

**Qachon / qanday:** Mijoz kartasi / tahrir formasi. Raqamlar (qarz, xarid) — `GET /clients/:id/stats`.

| | |
|---|---|
| Huquq | `customers.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ClientDto`](schemas.md#clientdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#clients)

---

<a id="patch-clients-id"></a>

### `PATCH /clients/:id` — Mijozni tahrirlash

> Bonus ballari bu yerda o‘zgarmaydi (I17).

**Qachon / qanday:** Tahrir. `If-Match` qo‘llanadi. Bonus ballari bu yerda o‘zgarmaydi (faqat sotuv/qaytarish).

| | |
|---|---|
| Huquq | `customers.edit` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `If-Match` (ixtiyoriy) |
| Javob | `200` → [`ClientDto`](schemas.md#clientdto) |
| Audit jurnali | ha — `client.update` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateClientDto`](schemas.md#updateclientdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `200`, misol `Alisher Qodirov` |
| `phone` | `string` |  | Saqlashda raqamlar va boshidagi `+` qoladi — misol `+998 90 123-45-67` |
| `type` | `individual` \| `company` |  | sukut `"individual"` |
| `email` | `string` |  | misol `ali@mail.uz` |
| `status` | `lead` \| `active` \| `inactive` |  | sukut `"lead"` |
| `group` | `retail` \| `wholesale` \| `vip` |  | sukut `"retail"` |
| `creditLimit` | `number` \| `null` |  | Nasiya limiti, butun so‘m; null yoki 0 — cheklanmagan |
| `paymentTermDays` | `number` \| `null` |  | min `0`, max `365` |
| `source` | `string` |  | maks. uzunlik `100`, misol `Instagram` |
| `company` | `string` \| `null` |  | maks. uzunlik `200` |
| `notes` | `string` \| `null` |  | maks. uzunlik `1000` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `VERSION_CONFLICT` (`If-Match` eskirgan — javobda `current`); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#clients)

---

<a id="delete-clients-id"></a>

### `DELETE /clients/:id` — Mijozni o‘chirish (yumshoq)

**Qachon / qanday:** Yumshoq o‘chirish. To‘lanmagan nasiya bor — 409 `CLIENT_HAS_DEBT` (`meta.debt`).

| | |
|---|---|
| Huquq | `customers.delete` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha — `client.delete` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `CLIENT_HAS_DEBT` — to‘lanmagan nasiya bor |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#clients)

---

<a id="post-clients-id-restore"></a>

### `POST /clients/:id/restore` — O‘chirilgan mijozni tiklash (undo)

**Qachon / qanday:** O‘chirishni qaytarish (undo).

| | |
|---|---|
| Huquq | `customers.delete` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ClientDto`](schemas.md#clientdto) |
| Audit jurnali | ha — `client.restore` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#clients)

---

<a id="post-clients-id-telegram-link"></a>

### `POST /clients/:id/telegram-link` — Telegram’ga ulash — shaxsiy havola (QR uchun)

> Mijoz havolani (QR) ochib Start bosadi — bot shu mijozga ulanadi, raqam yuborish shart emas. Bir martalik, 7 kun amal qiladi; har chaqiruv yangisini beradi (eskisi bekor).

**Qachon / qanday:** «Telegram’ga ulash» (mijoz kartasi): shaxsiy havola → QR (ekranda). Mijoz skanerlab Start bosadi — ulanadi (`telegramStatus: linked`). Bir martalik, 7 kun; har chaqiruv yangisini beradi — QR oynasi ochilganda so‘rang.

| | |
|---|---|
| Huquq | `customers.edit` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`TelegramLinkDto`](schemas.md#telegramlinkdto) |
| Audit jurnali | ha — `client.telegramLinkIssued` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `422` | `RECIPIENT_UNREACHABLE` (`meta.reason: no_channel`) — bot sozlanmagan |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#clients)

---

<a id="suppliers"></a>

## Ta’minotchilar

Ta’minotchilar ro‘yxati va kartasi (buyurtmalar, qarzimiz, to‘lovlar). Kreditorlik faqat KELGAN tovar bo‘yicha. Sotuvchi rolida pul maydonlari (`debt`, `totalPurchased`, buyurtma summalari, to‘lov `amount`) javobda YO‘Q — [README → Yashirin maydonlar](README.md#hidden).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/suppliers`](#get-suppliers) | Ta’minotchilar ro‘yxati | `suppliers.view` |
| `POST` | [`/suppliers`](#post-suppliers) | Ta’minotchi qo‘shish | `suppliers.create` |
| `GET` | [`/suppliers/summary`](#get-suppliers-summary) | Kreditorlik xulosasi | `suppliers.view` |
| `GET` | [`/suppliers/:id`](#get-suppliers-id) | Ta’minotchi kartasi | `suppliers.view` |
| `PATCH` | [`/suppliers/:id`](#patch-suppliers-id) 🔒 | Ta’minotchini tahrirlash | `suppliers.edit` |
| `DELETE` | [`/suppliers/:id`](#delete-suppliers-id) | Ta’minotchini o‘chirish (yumshoq) | `suppliers.delete` |
| `POST` | [`/suppliers/:id/restore`](#post-suppliers-id-restore) | O‘chirilgan ta’minotchini tiklash (undo) | `suppliers.delete` |

<a id="get-suppliers"></a>

### `GET /suppliers` — Ta’minotchilar ro‘yxati

> `q` — nom, aloqa shaxsi, telefon va STIR bo‘yicha.

**Qachon / qanday:** Ta’minotchilar sahifasi; `withDebt=true` — qarzimiz bor ta’minotchilar. Qatorda qarz (sotuvchida yo‘q) va mahsulotlar soni.

| | |
|---|---|
| Huquq | `suppliers.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `sort` | query | `id` \| `-id` \| `name` \| `-name` \| `createdAt` \| `-createdAt` |  | sukut `"name"` |
| `withDebt` | query | `boolean` |  | Faqat qarzimiz bor (kelgan tovar uchun to‘lanmagan) ta’minotchilar |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#suppliers)

---

<a id="post-suppliers"></a>

### `POST /suppliers` — Ta’minotchi qo‘shish

**Qachon / qanday:** Yangi ta’minotchi. `paymentTermDays` — kirim buyurtmasida `dueDate` berilmasa shundan hisoblanadi.

| | |
|---|---|
| Huquq | `suppliers.create` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`SupplierDto`](schemas.md#supplierdto) |
| Audit jurnali | ha — `supplier.create` |

**So‘rov tanasi** — [`CreateSupplierDto`](schemas.md#createsupplierdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `200`, misol `Bekabad Sement` |
| `phone` | `string` | ✔ | misol `+998 71 200 10 10` |
| `contactPerson` | `string` \| `null` |  | maks. uzunlik `200` |
| `address` | `string` \| `null` |  | maks. uzunlik `300` |
| `notes` | `string` \| `null` |  | maks. uzunlik `1000` |
| `email` | `string` \| `null` |  | misol `savdo@bekabad.uz` |
| `tin` | `string` \| `null` |  | STIR — aniq 9 raqam — misol `201234567` |
| `paymentTermDays` | `number` \| `null` |  | min `0`, max `365` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `400` | `VALIDATION_FAILED` — masalan STIR 9 raqam emas |

Umumiy: 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#suppliers)

---

<a id="get-suppliers-summary"></a>

### `GET /suppliers/summary` — Kreditorlik xulosasi

> Barcha ta’minotchilarga jami qarz va qarzimiz bor ta’minotchilar soni.

**Qachon / qanday:** Sahifa kartalari: jami qarzimiz (sotuvchida yo‘q) va qarzdor bo‘lgan ta’minotchilar soni.

| | |
|---|---|
| Huquq | `suppliers.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`SupplierSummaryDto`](schemas.md#suppliersummarydto) |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#suppliers)

---

<a id="get-suppliers-id"></a>

### `GET /suppliers/:id` — Ta’minotchi kartasi

> Buyurtmalar tarixi, jami qarz (faqat kelgan tovar, I18), oxirgi to‘lovlar — bitta so‘rovda.

**Qachon / qanday:** Ta’minotchi kartasi: buyurtmalar tarixi, qarzimiz (faqat kelgan tovar), oxirgi to‘lovlar — bitta so‘rovda. Sotuvchida summalar yo‘q (buyurtma raqami/holati/sanasi va to‘lov usuli qoladi).

| | |
|---|---|
| Huquq | `suppliers.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`SupplierCardDto`](schemas.md#suppliercarddto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#suppliers)

---

<a id="patch-suppliers-id"></a>

### `PATCH /suppliers/:id` — Ta’minotchini tahrirlash

**Qachon / qanday:** Tahrir. `If-Match` qo‘llanadi. STIR — aniq 9 raqam.

| | |
|---|---|
| Huquq | `suppliers.edit` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `If-Match` (ixtiyoriy) |
| Javob | `200` → [`SupplierDto`](schemas.md#supplierdto) |
| Audit jurnali | ha — `supplier.update` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateSupplierDto`](schemas.md#updatesupplierdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `200`, misol `Bekabad Sement` |
| `phone` | `string` |  | misol `+998 71 200 10 10` |
| `contactPerson` | `string` \| `null` |  | maks. uzunlik `200` |
| `address` | `string` \| `null` |  | maks. uzunlik `300` |
| `notes` | `string` \| `null` |  | maks. uzunlik `1000` |
| `email` | `string` \| `null` |  | misol `savdo@bekabad.uz` |
| `tin` | `string` \| `null` |  | STIR — aniq 9 raqam — misol `201234567` |
| `paymentTermDays` | `number` \| `null` |  | min `0`, max `365` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `VERSION_CONFLICT` (`If-Match` eskirgan — javobda `current`); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#suppliers)

---

<a id="delete-suppliers-id"></a>

### `DELETE /suppliers/:id` — Ta’minotchini o‘chirish (yumshoq)

**Qachon / qanday:** Ochiq (`ordered`/`partial`) buyurtmasi bor — 409 `SUPPLIER_HAS_OPEN_ORDERS`.

| | |
|---|---|
| Huquq | `suppliers.delete` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha — `supplier.delete` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `SUPPLIER_HAS_OPEN_ORDERS` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#suppliers)

---

<a id="post-suppliers-id-restore"></a>

### `POST /suppliers/:id/restore` — O‘chirilgan ta’minotchini tiklash (undo)

**Qachon / qanday:** O‘chirishni qaytarish (undo).

| | |
|---|---|
| Huquq | `suppliers.delete` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`SupplierDto`](schemas.md#supplierdto) |
| Audit jurnali | ha — `supplier.restore` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#suppliers)

---

<a id="employees"></a>

## Xodimlar

Xodim — shaxs (ism, lavozim, telefon, maosh, holat). Tizimga kirish hisobi alohida (`/users`) va xodimga bog‘lanadi: ism/lavozim foydalanuvchida takrorlanmaydi.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/employees`](#get-employees) | Xodimlar ro‘yxati | `employees.view` |
| `POST` | [`/employees`](#post-employees) | Xodim qo‘shish | `employees.create` |
| `GET` | [`/employees/:id`](#get-employees-id) | Bitta xodim | `employees.view` |
| `PATCH` | [`/employees/:id`](#patch-employees-id) 🔒 | Xodimni tahrirlash | `employees.edit` |
| `DELETE` | [`/employees/:id`](#delete-employees-id) | Xodimni o‘chirish (yumshoq) | `employees.delete` |
| `POST` | [`/employees/:id/restore`](#post-employees-id-restore) | O‘chirilgan xodimni tiklash (undo) | `employees.delete` |

<a id="get-employees"></a>

### `GET /employees` — Xodimlar ro‘yxati

**Qachon / qanday:** Xodimlar sahifasi va xodim tanlash ro‘yxatlari (haydovchi, sotuvchi; `status=active`). `employees.view` kerak (sukut — admin, manager): ruxsatsiz rolda ro‘yxat yo‘q (403) — xodim tanlash maydonini ko‘rsatmang.

| | |
|---|---|
| Huquq | `employees.view` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `sort` | query | `id` \| `-id` \| `name` \| `-name` \| `hiredAt` \| `-hiredAt` \| `createdAt` \| `-createdAt` |  | sukut `"name"` |
| `status` | query | `active` \| `on_leave` \| `fired` |  |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#employees)

---

<a id="post-employees"></a>

### `POST /employees` — Xodim qo‘shish

**Qachon / qanday:** Yangi xodim (kirish hisobisiz). Tizimga kirishi kerak bo‘lsa — keyin `POST /users` bilan hisob ochiladi.

| | |
|---|---|
| Huquq | `employees.create` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`EmployeeDto`](schemas.md#employeedto) |
| Audit jurnali | ha — `employee.create` |

**So‘rov tanasi** — [`CreateEmployeeDto`](schemas.md#createemployeedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `200`, misol `Bobur Toshmatov` |
| `position` | `string` | ✔ | maks. uzunlik `100`, misol `Kassir` |
| `phone` | `string` | ✔ | misol `+998 90 123 45 67` |
| `status` | `active` \| `on_leave` \| `fired` |  | sukut `"active"` |
| `salary` | `number` |  | Butun so‘m — misol `4500000` |
| `hiredAt` | `string` | ✔ | misol `2026-01-15` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#employees)

---

<a id="get-employees-id"></a>

### `GET /employees/:id` — Bitta xodim

**Qachon / qanday:** Xodim kartasi / tahrir formasi (`userId` — kirish hisobi bormi).

| | |
|---|---|
| Huquq | `employees.view` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`EmployeeDto`](schemas.md#employeedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#employees)

---

<a id="patch-employees-id"></a>

### `PATCH /employees/:id` — Xodimni tahrirlash

> Ism va lavozim foydalanuvchi hisobida ham darhol ko‘rinadi (D1).

**Qachon / qanday:** Tahrir. `If-Match` qo‘llanadi. `status: fired` — bo‘shatish (u endi tizimga kira olmaydi); oxirgi adminni bo‘shatib bo‘lmaydi (422 `LAST_ADMIN`).

| | |
|---|---|
| Huquq | `employees.edit` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `If-Match` (ixtiyoriy) |
| Javob | `200` → [`EmployeeDto`](schemas.md#employeedto) |
| Audit jurnali | ha — `employee.update` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateEmployeeDto`](schemas.md#updateemployeedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `200`, misol `Bobur Toshmatov` |
| `position` | `string` |  | maks. uzunlik `100`, misol `Kassir` |
| `phone` | `string` |  | misol `+998 90 123 45 67` |
| `status` | `active` \| `on_leave` \| `fired` |  | sukut `"active"` |
| `salary` | `number` |  | Butun so‘m — misol `4500000` |
| `hiredAt` | `string` |  | misol `2026-01-15` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `422` | `LAST_ADMIN` — oxirgi administratorni bo‘shatib bo‘lmaydi |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `VERSION_CONFLICT` (`If-Match` eskirgan — javobda `current`); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#employees)

---

<a id="delete-employees-id"></a>

### `DELETE /employees/:id` — Xodimni o‘chirish (yumshoq)

**Qachon / qanday:** Kirish hisobi bor xodim o‘chmaydi — 409 `EMPLOYEE_HAS_USER` (avval `DELETE /users/:id`).

| | |
|---|---|
| Huquq | `employees.delete` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha — `employee.delete` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `EMPLOYEE_HAS_USER` — avval kirish hisobini o‘chiring |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#employees)

---

<a id="post-employees-id-restore"></a>

### `POST /employees/:id/restore` — O‘chirilgan xodimni tiklash (undo)

**Qachon / qanday:** O‘chirishni qaytarish (undo).

| | |
|---|---|
| Huquq | `employees.delete` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`EmployeeDto`](schemas.md#employeedto) |
| Audit jurnali | ha — `employee.restore` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#employees)

---

<a id="users"></a>

## Foydalanuvchilar (kirish hisoblari)

`users.*` ruxsati (sukut — faqat administrator). Email + parol + rol (`roleId`), mavjud xodimga bog‘lanadi. Administrator bo‘lmagan boshqaruvchi o‘zidan kengroq rolga tegolmaydi (403). Tarif foydalanuvchi sonini cheklaydi (402).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/users`](#get-users) | Foydalanuvchilar ro‘yxati | `users.view` |
| `POST` | [`/users`](#post-users) 💳 | Kirish hisobi yaratish | `users.create` |
| `GET` | [`/users/:id`](#get-users-id) | Bitta foydalanuvchi | `users.view` |
| `PATCH` | [`/users/:id`](#patch-users-id) 🔒 💳 📡 | Foydalanuvchini tahrirlash | `users.edit` |
| `DELETE` | [`/users/:id`](#delete-users-id) | Foydalanuvchini o‘chirish (yumshoq) | `users.delete` |
| `POST` | [`/users/:id/restore`](#post-users-id-restore) 💳 | O‘chirilgan foydalanuvchini tiklash | `users.delete` |

<a id="get-users"></a>

### `GET /users` — Foydalanuvchilar ro‘yxati

> Ism va lavozim xodim yozuvidan (D1). `deleted=true` — o‘chirilganlar (tiklash uchun).

**Qachon / qanday:** Foydalanuvchilar sahifasi. Ism va lavozim xodim yozuvidan, rol — `roleId`/`roleName`/`role`. `lastLoginAt` bor. `roleId=` — shu roldagilar. `deleted=true` — «O‘chirilganlar» (faqat o‘chirilgan hisoblar, `deletedAt` bilan) → «Tiklash» tugmasi.

| | |
|---|---|
| Huquq | `users.view` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `sort` | query | `id` \| `-id` \| `name` \| `-name` \| `email` \| `-email` \| `createdAt` \| `-createdAt` \| `lastLoginAt` \| `-lastLoginAt` |  | sukut `"name"` |
| `roleId` | query | `string` |  | Shu roldagilar |
| `role` | query | `admin` \| `manager` \| `sotuvchi` \| `omborchi` |  | ESKIRGAN — `roleId` ishlating. Tizim roli kaliti |
| `isActive` | query | `boolean` |  |  |
| `deleted` | query | `boolean` |  | `true` — faqat o‘chirilgan hisoblar (tiklash uchun) |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#users)

---

<a id="post-users"></a>

### `POST /users` — Kirish hisobi yaratish

> Mavjud xodimga bog‘lanadi — ism va lavozim alohida kiritilmaydi (D1). Rol — `roleId` (`GET /roles`).

**Qachon / qanday:** Kirish hisobi: mavjud `employeeId` (hisobi yo‘q xodim), email, parol, `roleId` (`GET /roles`; eski `role` kaliti ham qabul qilinadi). Xodimda allaqachon hisob bor — 409 `EMPLOYEE_HAS_USER` — `errors[0].meta: { userId, deleted }`; `deleted: true` bo‘lsa yangisi o‘rniga «Tiklash» taklif qiling (`POST /users/{userId}/restore`); email band — 409 `ALREADY_EXISTS`; tarif to‘lgan — 402.

| | |
|---|---|
| Huquq | `users.create` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`UserDto`](schemas.md#userdto) |
| Audit jurnali | ha — `user.create` |

**So‘rov tanasi** — [`CreateUserDto`](schemas.md#createuserdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `employeeId` | `string` | ✔ | Mavjud xodim — kirish hisobi DOIM xodimga tegishli (D1) |
| `email` | `string` | ✔ | misol `kassir@crm.uz` |
| `password` | `string` | ✔ | Kamida 8 belgi; ommabop parollar rad etiladi |
| `roleId` | `string` |  | Rol (`GET /roles`). `role` berilmasa — SHART |
| `role` | `admin` \| `manager` \| `sotuvchi` \| `omborchi` |  | ESKIRGAN — `roleId` ishlating. Tizim roli kaliti: shu kalitli rol beriladi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `400` | `VALIDATION_FAILED` — masalan kuchsiz parol |
| `402` | `PLAN_LIMIT_EXCEEDED` — tarif chegarasi (`meta.resource`, `limit`, `used`); tarif oshirilgach darhol ochiladi |
| `403` | `PERMISSION_DENIED` — o‘zingizdan kengroq huquqli rol (administrator emas) |
| `409` | `EMPLOYEE_HAS_USER` (`meta.userId`, `meta.deleted` — o‘chirilgan bo‘lsa uni tiklang) \| `ALREADY_EXISTS` (email) |
| `422` | `REFERENCE_NOT_FOUND` — xodim (`employeeId`) yoki rol (`roleId`) yo‘q |

Umumiy: 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#users)

---

<a id="get-users-id"></a>

### `GET /users/:id` — Bitta foydalanuvchi

**Qachon / qanday:** Foydalanuvchi tahrir formasi.

| | |
|---|---|
| Huquq | `users.view` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`UserDto`](schemas.md#userdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#users)

---

<a id="patch-users-id"></a>

### `PATCH /users/:id` — Foydalanuvchini tahrirlash

> Parol almashsa yoki hisob faolsizlantirilsa — barcha sessiyalari yopiladi. Yangi rol va faolsizlantirish keyingi so‘rovdanoq kuchga kiradi; rol o‘zgarsa do‘konga `access.changed` hodisasi.

**Qachon / qanday:** Rol (`roleId`), email, faollik, parolni tiklash. Parol yoki `isActive: false` — shu foydalanuvchining barcha sessiyalari yopiladi. Yangi rol va faolsizlantirish uning KEYINGI so‘rovidanoq kuchga kiradi (token o‘sha); rol o‘zgarsa — `access.changed`. O‘z rolini/o‘zini o‘chirish — 422; oxirgi admin — 422 `LAST_ADMIN`; o‘zidan kengroq rol — 403.

| | |
|---|---|
| Huquq | `users.edit` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `If-Match` (ixtiyoriy) |
| Javob | `200` → [`UserDto`](schemas.md#userdto) |
| Realtime | `access.changed` (rol o‘zgarsa) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha — `user.update` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateUserDto`](schemas.md#updateuserdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `email` | `string` |  | misol `kassir@crm.uz` |
| `roleId` | `string` |  | Boshqa rol (`GET /roles`). O‘z rolingizni o‘zgartirib bo‘lmaydi |
| `role` | `admin` \| `manager` \| `sotuvchi` \| `omborchi` |  | ESKIRGAN — `roleId` ishlating. Tizim roli kaliti: shu kalitli rol beriladi |
| `isActive` | `boolean` |  | `false` — kira olmaydi, sessiyalari yopiladi |
| `password` | `string` |  | Parolni tiklash (administrator). Barcha sessiyalar yopiladi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `402` | `PLAN_LIMIT_EXCEEDED` — tarif chegarasi (`meta.resource`, `limit`, `used`); tarif oshirilgach darhol ochiladi |
| `403` | `PERMISSION_DENIED` — o‘zingizdan kengroq huquqli rol (administrator emas) |
| `404` | `NOT_FOUND` |
| `409` | `ALREADY_EXISTS` (email) |
| `422` | `LAST_ADMIN` \| `SELF_ROLE_CHANGE` \| `SELF_DELETE` \| `REFERENCE_NOT_FOUND` (`roleId`) |

Umumiy: 400 `VALIDATION_FAILED`; 409 `VERSION_CONFLICT` (`If-Match` eskirgan — javobda `current`); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#users)

---

<a id="delete-users-id"></a>

### `DELETE /users/:id` — Foydalanuvchini o‘chirish (yumshoq)

**Qachon / qanday:** Yumshoq o‘chirish (xodim qoladi). O‘zini — 422 `SELF_DELETE`, oxirgi admin — 422 `LAST_ADMIN`.

| | |
|---|---|
| Huquq | `users.delete` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha — `user.delete` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `422` | `LAST_ADMIN` \| `SELF_DELETE` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#users)

---

<a id="post-users-id-restore"></a>

### `POST /users/:id/restore` — O‘chirilgan foydalanuvchini tiklash

> O‘chirilganlar — `GET /users?deleted=true`. Parol va rol o‘zgarmaydi; eski sessiyalar qaytmaydi.

**Qachon / qanday:** O‘chirilgan hisobni qaytarish (ro‘yxat — `GET /users?deleted=true`, yoki toast’dagi undo). Parol, rol va email o‘zgarmaydi; faol hisob tarif chegarasiga kiradi (402). Xodimi o‘chirilgan — 422 `REFERENCE_NOT_FOUND` (avval `POST /employees/:id/restore`).

| | |
|---|---|
| Huquq | `users.delete` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`UserDto`](schemas.md#userdto) |
| Audit jurnali | ha — `user.restore` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `402` | `PLAN_LIMIT_EXCEEDED` — tarif chegarasi (`meta.resource`, `limit`, `used`); tarif oshirilgach darhol ochiladi |
| `404` | `NOT_FOUND` |
| `422` | `REFERENCE_NOT_FOUND` — xodim o‘chirilgan (avval uni tiklang) |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#users)

---

<a id="roles"></a>

## Rollar va ruxsatlar

Ruxsatlar ROLGA beriladi (foydalanuvchiga emas), foydalanuvchi — bitta rolda. Har do‘konda 4 ta tizim roli (`admin`, `manager`, `sotuvchi`, `omborchi`) + do‘kon yaratgan rollar. Boshqarish — `roles.*` ruxsatlari (sukut — faqat administrator); administrator bo‘lmagan egasi faqat o‘zida bor ruxsatlarni beradi (403). Katalog, qoidalar va frontend oqimi — [README → Rollar](README.md#roles).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/roles`](#get-roles) | Do‘kon rollari | `roles.view` |
| `POST` | [`/roles`](#post-roles) | Rol yaratish | `roles.create` |
| `GET` | [`/roles/catalog`](#get-roles-catalog) | Ruxsatlar katalogi | `roles.view` |
| `GET` | [`/roles/:id`](#get-roles-id) | Bitta rol | `roles.view` |
| `PATCH` | [`/roles/:id`](#patch-roles-id) 🔒 📡 | Rolni tahrirlash: ruxsat berish va olib tashlash | `roles.edit` |
| `DELETE` | [`/roles/:id`](#delete-roles-id) 📡 | Rolni o‘chirish | `roles.delete` |

<a id="get-roles"></a>

### `GET /roles` — Do‘kon rollari

> Hammasi, sahifasiz: avval tizim rollari (admin, manager, sotuvchi, omborchi), keyin nom bo‘yicha.

**Qachon / qanday:** Foydalanuvchilar → «Rollar» sahifasi va hisob formasidagi rol tanlovi. Hammasi, sahifasiz: avval tizim rollari, keyin nom bo‘yicha. `usersCount` — o‘chirilmagan hisoblar. Tizim rolini `key` bo‘yicha tarjima qiling, do‘kon rolini — `name`.

| | |
|---|---|
| Huquq | `roles.view` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`RoleDto`](schemas.md#roledto)[] |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#roles)

---

<a id="post-roles"></a>

### `POST /roles` — Rol yaratish

> Administrator bo‘lmagan — faqat o‘zida bor ruxsatlardan.

**Qachon / qanday:** «Yangi rol». `permissions` — katalog kalitlari; server normallashtiradi (bo‘lim amali → uning `view` i, `profit.view` → `cost.view`), javobdagi ro‘yxatni ko‘rsating. Nom band (harf farqsiz) — 409 `ALREADY_EXISTS` (`field: name`).

| | |
|---|---|
| Huquq | `roles.create` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`RoleDto`](schemas.md#roledto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CreateRoleDto`](schemas.md#createroledto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | Do‘konda noyob (katta-kichik harf farqsiz) — maks. uzunlik `50`, misol `Katta kassir` |
| `permissions` | (`sales.view` \| `sales.create` \| `sales.return` \| `sales.cancel` \| `quotes.view` \| `quotes.create` \| `quotes.edit` \| `quotes.delete` \| `deliveries.view` \| `deliveries.create` \| `deliveries.edit` \| `deliveries.delete` \| `products.view` \| `products.create` \| `products.edit` \| `products.delete` \| `stock.view` \| `stock.operate` \| `stock.manage` \| `purchases.view` \| `purchases.create` \| `purchases.edit` \| `purchases.receive` \| `purchases.pay` \| `purchases.delete` \| `suppliers.view` \| `suppliers.create` \| `suppliers.edit` \| `suppliers.delete` \| `cash.view` \| `cash.operate` \| `debts.view` \| `debts.collect` \| `expenses.view` \| `expenses.create` \| `expenses.edit` \| `expenses.delete` \| `reports.view` \| `customers.view` \| `customers.create` \| `customers.edit` \| `customers.delete` \| `messages.view` \| `messages.send` \| `employees.view` \| `employees.create` \| `employees.edit` \| `employees.delete` \| `users.view` \| `users.create` \| `users.edit` \| `users.delete` \| `roles.view` \| `roles.create` \| `roles.edit` \| `roles.delete` \| `audit.view` \| `settings.view` \| `settings.edit` \| `cost.view` \| `wholesale.view` \| `profit.view` \| `salary.view`)[] | ✔ | Server normallashtiradi: takror olib tashlanadi, bo‘limning istalgan amali uning `view` ini qo‘shadi; bog‘liqliklar: `sales.create`, `quotes.create/edit`, `stock.view` → `products.view`; `purchases.view` → `suppliers.view` + `products.view`; `messages.view` → `customers.view`; `profit.view` → `cost.view`. Javobda — saqlangan (to‘liq) ro‘yxat |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `403` | `PERMISSION_DENIED` — ruxsat yo‘q yoki o‘zingizdan kengroq rol/ruxsat |
| `409` | `ALREADY_EXISTS` (`name`) |

Umumiy: 400 `VALIDATION_FAILED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#roles)

---

<a id="get-roles-catalog"></a>

### `GET /roles/catalog` — Ruxsatlar katalogi

> Rol oynasi shundan quriladi: guruhlar → bo‘limlar (modullar) → amallar. Statik — keshlash mumkin.

**Qachon / qanday:** Rol oynasidagi ruxsatlar jadvali shundan quriladi: guruh → bo‘lim → amallar (birinchisi doim `view`). Statik — ilova versiyasi bilan keshlang (`staleTime: Infinity`).

| | |
|---|---|
| Huquq | `roles.view` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`PermissionCatalogDto`](schemas.md#permissioncatalogdto) |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#roles)

---

<a id="get-roles-id"></a>

### `GET /roles/:id` — Bitta rol

**Qachon / qanday:** Rol oynasini ochishda (tahrir oldidan) — `updatedAt` ni `If-Match` uchun oling.

| | |
|---|---|
| Huquq | `roles.view` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`RoleDto`](schemas.md#roledto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#roles)

---

<a id="patch-roles-id"></a>

### `PATCH /roles/:id` — Rolni tahrirlash: ruxsat berish va olib tashlash

> `permissions` — TO‘LIQ ro‘yxat (almashtiriladi, qo‘shilmaydi). Ruxsat o‘zgarsa — shu rol foydalanuvchilariga keyingi so‘rovdanoq kuchga kiradi, do‘konga `access.changed` hodisasi. Administrator bo‘lmagan — faqat o‘zidan keng bo‘lmagan rolni va faqat o‘zida bor ruxsatlar bilan.

**Qachon / qanday:** Ruxsat berish va olib tashlash: `permissions` — TO‘LIQ ro‘yxat (almashtiriladi — berish uchun kalitni qo‘shing, olish uchun chiqaring). O‘zida yo‘q ruxsat yoki o‘zidan kengroq rol (administrator bo‘lmaganda) — 403. `admin` — 422 `ROLE_PROTECTED`; tizim rolining nomi — 422 (`field: name`), ruxsatlari o‘zgaradi. `If-Match` qo‘llanadi. Shu rol egalariga keyingi so‘rovdanoq kuchga kiradi.

| | |
|---|---|
| Huquq | `roles.edit` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `If-Match` (ixtiyoriy) |
| Javob | `200` → [`RoleDto`](schemas.md#roledto) |
| Realtime | `access.changed` (ruxsatlar o‘zgarsa) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateRoleDto`](schemas.md#updateroledto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | Do‘konda noyob (katta-kichik harf farqsiz) — maks. uzunlik `50`, misol `Katta kassir` |
| `permissions` | (`sales.view` \| `sales.create` \| `sales.return` \| `sales.cancel` \| `quotes.view` \| `quotes.create` \| `quotes.edit` \| `quotes.delete` \| `deliveries.view` \| `deliveries.create` \| `deliveries.edit` \| `deliveries.delete` \| `products.view` \| `products.create` \| `products.edit` \| `products.delete` \| `stock.view` \| `stock.operate` \| `stock.manage` \| `purchases.view` \| `purchases.create` \| `purchases.edit` \| `purchases.receive` \| `purchases.pay` \| `purchases.delete` \| `suppliers.view` \| `suppliers.create` \| `suppliers.edit` \| `suppliers.delete` \| `cash.view` \| `cash.operate` \| `debts.view` \| `debts.collect` \| `expenses.view` \| `expenses.create` \| `expenses.edit` \| `expenses.delete` \| `reports.view` \| `customers.view` \| `customers.create` \| `customers.edit` \| `customers.delete` \| `messages.view` \| `messages.send` \| `employees.view` \| `employees.create` \| `employees.edit` \| `employees.delete` \| `users.view` \| `users.create` \| `users.edit` \| `users.delete` \| `roles.view` \| `roles.create` \| `roles.edit` \| `roles.delete` \| `audit.view` \| `settings.view` \| `settings.edit` \| `cost.view` \| `wholesale.view` \| `profit.view` \| `salary.view`)[] |  | Server normallashtiradi: takror olib tashlanadi, bo‘limning istalgan amali uning `view` ini qo‘shadi; bog‘liqliklar: `sales.create`, `quotes.create/edit`, `stock.view` → `products.view`; `purchases.view` → `suppliers.view` + `products.view`; `messages.view` → `customers.view`; `profit.view` → `cost.view`. Javobda — saqlangan (to‘liq) ro‘yxat |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `403` | `PERMISSION_DENIED` — ruxsat yo‘q yoki o‘zingizdan kengroq rol/ruxsat |
| `404` | `NOT_FOUND` |
| `409` | `ALREADY_EXISTS` (`name`) \| `VERSION_CONFLICT` |
| `422` | `ROLE_PROTECTED` — `admin` roli yoki tizim rolining nomi |

Umumiy: 400 `VALIDATION_FAILED`; 409 `VERSION_CONFLICT` (`If-Match` eskirgan — javobda `current`); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#roles)

---

<a id="delete-roles-id"></a>

### `DELETE /roles/:id` — Rolni o‘chirish

> Faqat do‘kon yaratgan rol. Foydalanuvchilari bo‘lsa — `replaceWith` rolga o‘tkaziladi (o‘chirilgan hisoblar ham).

**Qachon / qanday:** Faqat do‘kon yaratgan rol (tizim roli — 422 `ROLE_PROTECTED`). Rolda hisob bo‘lsa — 409 `ROLE_IN_USE` (`errors[0].meta.users`) → «Qaysi rolga o‘tkazamiz?» tanlovi → `?replaceWith=<roleId>` bilan qayta.

| | |
|---|---|
| Huquq | `roles.delete` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Realtime | `access.changed` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |
| `replaceWith` | query | `string` |  | Rolda foydalanuvchi bo‘lsa — SHART: ular shu rolga o‘tkaziladi (o‘chirilgan hisoblar ham) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `403` | `PERMISSION_DENIED` — ruxsat yo‘q yoki o‘zingizdan kengroq rol/ruxsat |
| `404` | `NOT_FOUND` |
| `409` | `ROLE_IN_USE` — `replaceWith` berilmagan (`meta.users` — nechta) |
| `422` | `ROLE_PROTECTED` — tizim roli \| `REFERENCE_NOT_FOUND` (`replaceWith`) |

Umumiy: 400 `VALIDATION_FAILED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#roles)

---

<a id="sales"></a>

## Sotuvlar (chek, qaytarish, bekor qilish)

POS va cheklar jurnali. Chek BITTA so‘rov bilan yoziladi, summalarni server qayta hisoblaydi. Qoidalar (QQS, chegirma, bonus, yaxlitlash, nasiya, qaytim) — [README → Kassa (POS)](README.md#pos).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `POST` | [`/sales`](#post-sales) 🔁 📡 | Sotuv (chek) | `sales.create` |
| `GET` | [`/sales`](#get-sales) | Cheklar ro‘yxati | `sales.view` |
| `GET` | [`/sales/:id`](#get-sales-id) | Chek (qatorlari bilan) | `sales.view` |
| `GET` | [`/sales/:id/receipt`](#get-sales-id-receipt) | Chop etish uchun chek | `sales.view` |
| `POST` | [`/sales/:id/receipt/telegram`](#post-sales-id-receipt-telegram) | Chekni mijozga Telegram’da yuborish | `sales.view` |
| `POST` | [`/sales/:id/return`](#post-sales-id-return) 🔁 📡 | Qaytarish | `sales.return` |
| `POST` | [`/sales/:id/cancel`](#post-sales-id-cancel) 🔁 📡 | Bekor qilish | `sales.cancel` |

<a id="post-sales"></a>

### `POST /sales` — Sotuv (chek)

> Bitta tranzaksiya: qoldiq (qulf bilan), chek, ombor harakatlari, kassa, bonus, yetkazish, audit. Ochiq smena shart (I8). Idempotent.

**Qachon / qanday:** POS «To‘lash» (F9). Savat brauzerda turadi, chek BITTA so‘rov bilan yoziladi. `total` — ekranda ko‘rsatilgan jami: yuboring, farq bo‘lsa 422 `TOTAL_MISMATCH` (`meta.client/server`) — chek yozilmaydi, pul noto‘g‘ri olinmaydi. `paid.cash` — mijoz BERGAN naqd (qaytim server hisoblaydi → `change`). To‘lanmagan qismi — nasiya (`customerId` shart). Smena yopiq — 423 `SHIFT_REQUIRED` → smena ochish oynasi. Muvaffaqiyatda chek: `GET /sales/:id/receipt`. Offline navbatga tushsa — XUDDI SHU `Idempotency-Key` bilan qayta yuboriladi. `priceTier: "wholesale"` — sotuvchiga faqat `sellerWholesaleEnabled` bilan (aks holda 403 `PERMISSION_DENIED`).

| | |
|---|---|
| Huquq | `sales.create` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`SaleDto`](schemas.md#saledto) |
| Realtime | `sale.created` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CreateSaleDto`](schemas.md#createsaledto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `type` | `sale` |  | Faqat `sale`; qaytarish — `POST /sales/:id/return` |
| `customerId` | `string` (uuid) |  | Nasiyada MAJBURIY (I15) |
| `sellerId` | `string` (uuid) |  | Berilmasa — joriy foydalanuvchining xodimi |
| `warehouseId` | `string` (uuid) |  | Berilmasa — joriy ombor |
| `priceTier` | `retail` \| `wholesale` |  | `wholesale` — `wholesaleEnabled` bo‘lsa (aks holda chakana). Sotuvchiga — `sellerWholesaleEnabled` bilan, aks holda 403 — sukut `"retail"` |
| `items` | [`SaleItemInputDto`](schemas.md#saleiteminputdto)[] | ✔ | ko‘pi bilan `200` |
| `discount` | `number` |  | Umumiy chegirma, so‘m (`maxDiscountPct` gacha) — misol `20000` |
| `bonusUsed` | `number` |  | Ishlatiladigan bonus ball (mavjudigacha) — misol `5000` |
| `roundTo` | `0` \| `500` \| `1000` |  | sukut `0` |
| `delivery` | [`DeliveryInputDto`](schemas.md#deliveryinputdto) |  |  |
| `paid` | [`PaidDto`](schemas.md#paiddto) | ✔ |  |
| `date` | `string` |  | Berilmasa — bugun; kelajak sana rad etiladi — misol `2026-09-23` |
| `total` | `number` |  | Mijoz ko‘rsatgan jami — faqat SOLISHTIRILADI; farq bo‘lsa 422 TOTAL_MISMATCH (yozilmaydi) — misol `188600` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `403` | `PERMISSION_DENIED` — sotuvchi `priceTier: "wholesale"` yubordi, `sellerWholesaleEnabled` o‘chiq |
| `422` | `STOCK_INSUFFICIENT` \| `DISCOUNT_LIMIT` \| `TOTAL_MISMATCH` \| `PAYMENT_EXCEEDS_TOTAL` \| `CREDIT_REQUIRES_CUSTOMER` \| `CREDIT_LIMIT_EXCEEDED` \| `CREDIT_OVERDUE` \| `PRODUCT_ARCHIVED` \| `WAREHOUSE_ARCHIVED` \| `REFERENCE_NOT_FOUND` |
| `423` | `SHIFT_REQUIRED` |

Umumiy: 400 `VALIDATION_FAILED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#sales)

---

<a id="get-sales"></a>

### `GET /sales` — Cheklar ro‘yxati

> Kursorli sahifalash (`nextCursor`). Har chekda qolgan qarz — bazada hisoblangan (I13).

**Qachon / qanday:** Cheklar jurnali (kursorli, yangisi birinchi). `payment=debt` — qarzi qolgan cheklar; `q` — chek raqami yoki mijoz nomi; `relatedSaleId` — shu chek bo‘yicha qaytarish hujjatlari (chek kartasidagi «Qaytarishlar»). Qatorlarsiz — tafsilot `GET /sales/:id` da.

| | |
|---|---|
| Huquq | `sales.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`SalePageDto`](schemas.md#salepagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `dateFrom` | query | `string` |  | misol `2026-09-01` |
| `dateTo` | query | `string` |  | misol `2026-09-30` |
| `status` | query | `completed` \| `pending` \| `cancelled` |  |  |
| `type` | query | `sale` \| `return` |  |  |
| `sellerId` | query | `string` (uuid) |  |  |
| `customerId` | query | `string` (uuid) |  |  |
| `relatedSaleId` | query | `string` (uuid) |  | Shu chek bo‘yicha qaytarish hujjatlari (`QAYT-…`) |
| `payment` | query | `cash` \| `card` \| `transfer` \| `debt` |  | `debt` — qolgan qarzi bor cheklar |
| `q` | query | `string` |  | Chek raqami yoki mijoz nomi |
| `cursor` | query | `string` |  | Oldingi javobdagi `nextCursor` |
| `limit` | query | `number` |  | min `1`, max `200`, sukut `50` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#sales)

---

<a id="get-sales-id"></a>

### `GET /sales/:id` — Chek (qatorlari bilan)

**Qachon / qanday:** Chek tafsiloti: qatorlar (`items[].id` — qaytarishda `saleItemId`; `items[].returnedQty` — shu qatordan qaytarilgani, yana qaytarish mumkin: `qty − returnedQty`), to‘lov, qarz, yetkazish holati.

| | |
|---|---|
| Huquq | `sales.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`SaleDto`](schemas.md#saledto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#sales)

---

<a id="get-sales-id-receipt"></a>

### `GET /sales/:id/receipt` — Chop etish uchun chek

> Do‘kon rekvizitlari bilan. `format=pdf` — 80 mm termal chek (brauzerdagi chek ko‘rinishida, fiskal QR bilan), `Content-Disposition: inline; filename="<raqam>.pdf"` (09 §9.13).

**Qachon / qanday:** Chop etish uchun: do‘kon rekvizitlari + chek + mijoz/sotuvchi nomi + fiskal ma’lumot. `fiscal: null` — OFD o‘chiq; `fiscal.status: pending|sent` — hali fiskal raqam yo‘q (`sale.fiscalized` hodisasidan keyin QR bilan qayta chop etish mumkin). `format=pdf` — tayyor 80 mm termal chek (PDF, fiskal QR bilan): token bilan `fetch` → `blob` → `URL.createObjectURL` → yangi oynada ochish/chop etish yoki yuklab olish (`Content-Disposition: inline; filename="CHEK-….pdf"`). `<a href>` token yubora olmaydi — to‘g‘ridan-to‘g‘ri havola ishlamaydi.

| | |
|---|---|
| Huquq | `sales.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ReceiptDto`](schemas.md#receiptdto) yoki `application/pdf` — `format=json` (sukut) — chek ma’lumoti; `format=pdf` — PDF fayl |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |
| `format` | query | `json` \| `pdf` |  | sukut `"json"` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#sales)

---

<a id="post-sales-id-receipt-telegram"></a>

### `POST /sales/:id/receipt/telegram` — Chekni mijozga Telegram’da yuborish

> Chekdagi mijoz botga ulangan bo‘lsa — PDF chek (chop etiladigan bilan bir xil) va izoh (raqam, jami, qarz, bonus) bitta xabarda. Darhol yuboriladi. Yetkazib bo‘lmasa — 422 `RECIPIENT_UNREACHABLE`, `meta.reason`: `no_customer` (chekda mijoz yo‘q), `not_linked` (botga ulanmagan), `blocked` (botni bloklagan), `no_channel` (bot sozlanmagan).

**Qachon / qanday:** «Telegram’ga yuborish» (chek oynasi, POS): chekdagi mijozga PDF chek + izoh (raqam, jami, qarz, bonus) — 204. Yetkazib bo‘lmasa 422 `RECIPIENT_UNREACHABLE` (`meta.reason`: `no_customer`, `not_linked`, `blocked`, `no_channel`) — `not_linked` da «Telegram’ga ulash» (QR) taklif qiling; 503 — Telegram javob bermadi (qayta urinish).

| | |
|---|---|
| Huquq | `sales.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — Yuborildi |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `422` | `RECIPIENT_UNREACHABLE` |
| `503` | Telegram javob bermadi — qayta urinib ko‘ring |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#sales)

---

<a id="post-sales-id-return"></a>

### `POST /sales/:id/return` — Qaytarish

> QQS asl chek foizi bo‘yicha (I6); ombor qoldig‘i bilan cheklanmaydi (I7). Nasiya chekda avval qarz yopiladi, qolgani naqd qaytariladi. Idempotent.

**Qachon / qanday:** Qaytarish oynasi: asl chek qatorlari (`saleItemId`) va miqdor (asl qator birligida, ko‘pi bilan `qty − returnedQty` — `GET /sales/:id`) + sabab. Qaytariladigan summani brauzerda HISOBLAMANG: javobdagi hujjat — `total` (jami), `paid.cash` (kassadan qaytariladigan naqd), `debtPaid` (nasiya chekda qarzdan yopilgan qism). Ochiq smena shart.

| | |
|---|---|
| Huquq | `sales.return` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`SaleDto`](schemas.md#saledto) — Qaytarish hujjati (`QAYT-…`) |
| Realtime | `sale.created` (qaytarish hujjati) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`ReturnSaleDto`](schemas.md#returnsaledto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `items` | [`ReturnItemInputDto`](schemas.md#returniteminputdto)[] | ✔ | ko‘pi bilan `200` |
| `reason` | `string` | ✔ | maks. uzunlik `500`, misol `Sifatsiz` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `SALE_ALREADY_CANCELLED` |
| `422` | `RETURN_EXCEEDS_SOLD` \| `SALE_NOT_RETURNABLE` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#sales)

---

<a id="post-sales-id-cancel"></a>

### `POST /sales/:id/cancel` — Bekor qilish

> Tovar AYNAN sotilgan omborga qaytadi (I24), naqd kassadan qaytariladi, bonus olib qo‘yiladi (I17).

**Qachon / qanday:** Chekni bekor qilish (`sales.cancel`). Qaytarish yoki qarz to‘lovi bor chek — 409 `SALE_NOT_CANCELLABLE` (`meta.reason`). Naqd qaytarilsa ochiq smena kerak. Chekni o‘chirish yo‘q — faqat bekor qilish.

| | |
|---|---|
| Huquq | `sales.cancel` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `200` → [`SaleDto`](schemas.md#saledto) |
| Realtime | `sale.cancelled` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `SALE_ALREADY_CANCELLED` \| `SALE_NOT_CANCELLABLE` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#sales)

---

<a id="cash"></a>

## Kassa: smena va naqd harakatlar

Smena ochish/yopish, joriy kassa balansi, naqd kirim/chiqim, X/Z hisobot. Sotuv, qaytarish, naqd to‘lovlar faqat OCHIQ smenada (aks holda 423 `SHIFT_REQUIRED`).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/cash/shifts/current`](#get-cash-shifts-current) | Joriy smena va kassa balansi | `cash.view` |
| `GET` | [`/cash/shifts`](#get-cash-shifts) | Smenalar tarixi | `cash.view` |
| `POST` | [`/cash/shifts/open`](#post-cash-shifts-open) 🔁 📡 | Smena ochish | `cash.operate` |
| `POST` | [`/cash/shifts/close`](#post-cash-shifts-close) 🔁 📡 | Smena yopish | `cash.operate` |
| `GET` | [`/cash/shifts/:id/report`](#get-cash-shifts-id-report) | X/Z hisobot | `cash.view` |
| `POST` | [`/cash/movements`](#post-cash-movements) 🔁 | Naqd kirim/chiqim | `cash.operate` |
| `GET` | [`/cash/movements`](#get-cash-movements) | Smenadagi naqd harakatlar | `cash.view` |

<a id="get-cash-shifts-current"></a>

### `GET /cash/shifts/current` — Joriy smena va kassa balansi

> `shift: null` — smena ochilmagan

**Qachon / qanday:** POS va Kassa sahifasi ochilganda: `shift` (`null` — smena yopiq → «Smena ochish») va `cashBalance` (yashikdagi kutilgan naqd). `shift.*`, `sale.*`, `debt.paid` hodisalarida qayta so‘rang.

| | |
|---|---|
| Huquq | `cash.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`CurrentShiftDto`](schemas.md#currentshiftdto) |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#cash)

---

<a id="get-cash-shifts"></a>

### `GET /cash/shifts` — Smenalar tarixi

**Qachon / qanday:** Smenalar tarixi (`cashierName` bilan), sana/holat filtri.

| | |
|---|---|
| Huquq | `cash.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ShiftPageDto`](schemas.md#shiftpagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `status` | query | `open` \| `closed` |  |  |
| `dateFrom` | query | `string` |  | Ochilgan kun (Toshkent) — shu kundan — misol `2026-09-01` |
| `dateTo` | query | `string` |  | Ochilgan kun (Toshkent) — shu kun ham — misol `2026-09-30` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#cash)

---

<a id="post-cash-shifts-open"></a>

### `POST /cash/shifts/open` — Smena ochish

> Balans sanoqqa tenglashadi (I10). Bir vaqtda bitta smena (I8). Idempotent.

**Qachon / qanday:** Smena ochish: yashikdagi SANALGAN naqd (`openingBalance`). Ochiq smena bor — 409 `SHIFT_ALREADY_OPEN`.

| | |
|---|---|
| Huquq | `cash.operate` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`ShiftDto`](schemas.md#shiftdto) |
| Realtime | `shift.opened` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`OpenShiftDto`](schemas.md#openshiftdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `openingBalance` | `number` | ✔ | Yashikdagi SANALGAN naqd — kassa balansi shunga tenglashadi (I10) — misol `200000` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `SHIFT_ALREADY_OPEN` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#cash)

---

<a id="post-cash-shifts-close"></a>

### `POST /cash/shifts/close` — Smena yopish

> Kutilgan, sanalgan va farq saqlanadi (I10). Idempotent.

**Qachon / qanday:** Smena yopish: sanalgan naqd (`countedBalance`), ixtiyoriy kupyuralar (`{"100000": 3, ...}` — yig‘indisi teng bo‘lsin). Javobda kutilgan/sanalgan/farq. So‘ng Z-hisobot: `GET /cash/shifts/:id/report`.

| | |
|---|---|
| Huquq | `cash.operate` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `200` → [`ShiftDto`](schemas.md#shiftdto) |
| Realtime | `shift.closed` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CloseShiftDto`](schemas.md#closeshiftdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `countedBalance` | `number` | ✔ | Yopishda sanalgan naqd — misol `1450000` |
| `note` | `string` |  | maks. uzunlik `500`, misol `5000 kam chiqdi` |
| `denominations` | `Record<string, integer>` |  | Kupyura → soni. Berilsa, yig‘indisi `countedBalance` ga teng bo‘lishi shart |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `SHIFT_NOT_OPEN` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#cash)

---

<a id="get-cash-shifts-id-report"></a>

### `GET /cash/shifts/:id/report` — X/Z hisobot

> Barcha raqamlar bitta agregat so‘rovda; nasiya cheklar ham (I4).

**Qachon / qanday:** X-hisobot (ochiq smena) yoki Z-hisobot (yopilgan): sotuv, qaytarish, naqd kirim/chiqim, xarajat, qarz va ta’minotchi to‘lovlari.

| | |
|---|---|
| Huquq | `cash.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ShiftReportDto`](schemas.md#shiftreportdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#cash)

---

<a id="post-cash-movements"></a>

### `POST /cash/movements` — Naqd kirim/chiqim

> Faqat ochiq smenada (I8, I9); sabab majburiy. Idempotent.

**Qachon / qanday:** Naqd kirim/chiqim (inkassatsiya, maydalash). Sabab majburiy; faqat ochiq smenada.

| | |
|---|---|
| Huquq | `cash.operate` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`CashMovementDto`](schemas.md#cashmovementdto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CashMovementInputDto`](schemas.md#cashmovementinputdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `direction` | `in` \| `out` | ✔ |  |
| `amount` | `number` | ✔ | misol `500000` |
| `reason` | `string` | ✔ | maks. uzunlik `500`, misol `Egasi oldi` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `423` | `SHIFT_REQUIRED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#cash)

---

<a id="get-cash-movements"></a>

### `GET /cash/movements` — Smenadagi naqd harakatlar

> `shiftId` berilmasa — joriy smena

**Qachon / qanday:** Smena ichidagi naqd harakatlar; `shiftId` berilmasa — joriy smena.

| | |
|---|---|
| Huquq | `cash.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`CashMovementPageDto`](schemas.md#cashmovementpagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `shiftId` | query | `string` (uuid) |  | Berilmasa — joriy smena |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#cash)

---

<a id="debts"></a>

## Qarzlar (nasiya)

Qarzdorlar (mijoz yoki chek bo‘yicha), eskirish (30/60/60+), qarz to‘lovlari. Qarz — nasiya chekning `outstanding` qiymati, bazada hisoblanadi.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/debts`](#get-debts) | Qarzdorlar | `debts.view` |
| `GET` | [`/debts/payments`](#get-debts-payments) | Qarz to‘lovlari tarixi | `debts.view` |
| `POST` | [`/debts/payments`](#post-debts-payments) 🔁 📡 | Qarz to‘lovi | `debts.collect` |

<a id="get-debts"></a>

### `GET /debts` — Qarzdorlar

> `view=customers` — mijoz bo‘yicha (`client_balances`), `receipts` — cheklar. Eskirish 30/60/60+, muddati o‘tgan.

**Qachon / qanday:** Qarzlar sahifasi. `view=customers` (sukut) — mijoz bo‘yicha yig‘ma (`CustomerDebtDto`), `view=receipts` — chek bo‘yicha (`DebtReceiptDto`). `aging` — `d30` (0–30 kun), `d60` (31–60), `d60plus`; `overdue=true` — muddati o‘tganlar. Javobdagi `summary` (jami qarz, muddati o‘tgan, qarzdorlar soni, eng eski sana) — sahifa kartalari uchun: `customerId` ga bog‘liq, qolgan filtrlarga (`view`, `aging`, `overdue`, `q`) bog‘liq emas.

| | |
|---|---|
| Huquq | `debts.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DebtPageDto`](schemas.md#debtpagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `view` | query | `customers` \| `receipts` |  | sukut `"customers"` |
| `aging` | query | `d30` \| `d60` \| `d60plus` |  | Mijozlar: ENG ESKI qarzi bo‘yicha; cheklar: chek sanasi |
| `overdue` | query | `boolean` |  | Faqat muddati o‘tganlar |
| `customerId` | query | `string` (uuid) |  |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#debts)

---

<a id="get-debts-payments"></a>

### `GET /debts/payments` — Qarz to‘lovlari tarixi

**Qachon / qanday:** Qarz to‘lovlari tarixi; `saleId` yoki `customerId` bo‘yicha.

| | |
|---|---|
| Huquq | `debts.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DebtPaymentPageDto`](schemas.md#debtpaymentpagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `saleId` | query | `string` (uuid) |  |  |
| `customerId` | query | `string` (uuid) |  |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#debts)

---

<a id="post-debts-payments"></a>

### `POST /debts/payments` — Qarz to‘lovi

> Qarzdan oshmaydi (I14); to‘liq to‘langanda chek `completed`. Naqd — kassaga (smena shart). Idempotent.

**Qachon / qanday:** Qarz to‘lovi ANIQ chek bo‘yicha (`saleId`). Mijozning bir nechta nasiya cheki bo‘lsa — foydalanuvchi chekni tanlaydi (yoki frontend eng eskisidan boshlab ketma-ket bir nechta so‘rov yuboradi, har biriga ALOHIDA kalit). Qarzdan ko‘p — 422 `PAYMENT_EXCEEDS_DEBT`. `cash` — kassaga (ochiq smena shart), `bank` — kassaga ta’sirsiz.

| | |
|---|---|
| Huquq | `debts.collect` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`DebtPaymentResultDto`](schemas.md#debtpaymentresultdto) |
| Realtime | `debt.paid` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`DebtPaymentInputDto`](schemas.md#debtpaymentinputdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `saleId` | `string` (uuid) | ✔ |  |
| `amount` | `number` | ✔ | misol `100000` |
| `method` | `cash` \| `bank` | ✔ | `cash` — kassaga kiradi (ochiq smena shart, I8) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `422` | `PAYMENT_EXCEEDS_DEBT` \| `REFERENCE_NOT_FOUND` |
| `423` | `SHIFT_REQUIRED` (naqd) |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#debts)

---

<a id="quotes"></a>

## Takliflar (smeta)

Mijozga narx taklifi: qoldiq band qilinmaydi, kassaga ta’sir yo‘q. Qabul qilinsa — sotuvga aylantiriladi (bir marta).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/quotes`](#get-quotes) | Takliflar ro‘yxati | `quotes.view` |
| `POST` | [`/quotes`](#post-quotes) | Taklif yaratish | `quotes.create` |
| `GET` | [`/quotes/summary`](#get-quotes-summary) | Takliflar xulosasi | `quotes.view` |
| `GET` | [`/quotes/:id`](#get-quotes-id) | Taklif (qatorlari bilan) | `quotes.view` |
| `PATCH` | [`/quotes/:id`](#patch-quotes-id) | Taklifni tahrirlash | `quotes.edit` |
| `DELETE` | [`/quotes/:id`](#delete-quotes-id) | Taklifni o‘chirish (yumshoq) | `quotes.delete` |
| `POST` | [`/quotes/:id/restore`](#post-quotes-id-restore) | O‘chirilgan taklifni tiklash (undo) | `quotes.delete` |
| `POST` | [`/quotes/:id/convert`](#post-quotes-id-convert) 🔁 📡 | Taklifni sotuvga aylantirish | `sales.create` |

<a id="get-quotes"></a>

### `GET /quotes` — Takliflar ro‘yxati

> `expired` — amal muddati o‘tgan ochiq taklif

**Qachon / qanday:** Takliflar ro‘yxati; `expired=true` — amal muddati o‘tgan ochiq takliflar.

| | |
|---|---|
| Huquq | `quotes.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`QuotePageDto`](schemas.md#quotepagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `status` | query | `draft` \| `sent` \| `accepted` \| `rejected` \| `converted` |  |  |
| `customerId` | query | `string` (uuid) |  |  |
| `dateFrom` | query | `string` |  | Taklif sanasi — shu kundan — misol `2026-09-01` |
| `dateTo` | query | `string` |  | Taklif sanasi — shu kun ham — misol `2026-09-30` |
| `expired` | query | `boolean` |  | Faqat amal muddati o‘tgan ochiq takliflar |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#quotes)

---

<a id="post-quotes"></a>

### `POST /quotes` — Taklif yaratish

> Raqam `TKLF-…` (I12); summalar sotuv bilan bir xil qoidada.

**Qachon / qanday:** Taklif (smeta). Summalar sotuv qoidasida hisoblanadi; qoldiq band QILINMAYDI. `priceTier` berilmasa: `wholesaleEnabled` bo‘lsa — `retail` bo‘lmagan har qanday guruh (`wholesale`, `vip`) ulgurji, aks holda chakana. Aniq berilgan `priceTier` `wholesaleEnabled=false` da ham qo‘llanadi (sotuvdan farqli).

| | |
|---|---|
| Huquq | `quotes.create` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`QuoteDto`](schemas.md#quotedto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CreateQuoteDto`](schemas.md#createquotedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `customerId` | `string` (uuid) |  |  |
| `sellerId` | `string` (uuid) |  | Berilmasa — joriy foydalanuvchining xodimi |
| `priceTier` | `retail` \| `wholesale` |  | Berilmasa — mijoz guruhidan. `wholesale` — `wholesaleEnabled` bo‘lsa; sotuvchiga — `sellerWholesaleEnabled` bilan (aks holda so‘ralgani 403, mijoz guruhidan kelgani — chakana) |
| `items` | [`SaleItemInputDto`](schemas.md#saleiteminputdto)[] | ✔ | ko‘pi bilan `200` |
| `discount` | `number` |  | misol `50000` |
| `validUntil` | `string` |  | Amal muddati — misol `2026-10-01` |
| `note` | `string` |  | maks. uzunlik `1000` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `403` | `PERMISSION_DENIED` — sotuvchiga ulgurji narx yopiq |
| `422` | `DISCOUNT_LIMIT` \| `PRODUCT_ARCHIVED` \| `REFERENCE_NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#quotes)

---

<a id="get-quotes-summary"></a>

### `GET /quotes/summary` — Takliflar xulosasi

> Jami, qabul qilingan va javob kutilayotgan summa — bitta so‘rov.

**Qachon / qanday:** Takliflar kartalari: jami, qabul qilingan, javob kutilayotgan summa.

| | |
|---|---|
| Huquq | `quotes.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`QuoteSummaryDto`](schemas.md#quotesummarydto) |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#quotes)

---

<a id="get-quotes-id"></a>

### `GET /quotes/:id` — Taklif (qatorlari bilan)

**Qachon / qanday:** Taklif (qatorlari bilan) — ko‘rish, chop etish, tahrir.

| | |
|---|---|
| Huquq | `quotes.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`QuoteDto`](schemas.md#quotedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#quotes)

---

<a id="patch-quotes-id"></a>

### `PATCH /quotes/:id` — Taklifni tahrirlash

> Qatorlar berilsa — to‘liq almashtiriladi. Holat: draft\|sent\|accepted\|rejected.

**Qachon / qanday:** Tahrir va holat (`draft` → `sent` → `accepted`/`rejected`). `items` berilsa — to‘liq almashtiriladi. Aylantirilgan taklif o‘zgarmaydi (409).

| | |
|---|---|
| Huquq | `quotes.edit` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`QuoteDto`](schemas.md#quotedto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateQuoteDto`](schemas.md#updatequotedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `customerId` | `string` (uuid) \| `null` |  |  |
| `sellerId` | `string` (uuid) |  |  |
| `priceTier` | `retail` \| `wholesale` |  | Yaratishdagi qoida bilan |
| `items` | [`SaleItemInputDto`](schemas.md#saleiteminputdto)[] |  | Berilsa — qatorlar TO‘LIQ almashtiriladi |
| `discount` | `number` |  |  |
| `validUntil` | `string` |  | misol `2026-10-01` |
| `note` | `string` |  | maks. uzunlik `1000` |
| `status` | `draft` \| `sent` \| `accepted` \| `rejected` |  | `converted` — faqat aylantirish orqali |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `403` | `PERMISSION_DENIED` — sotuvchiga ulgurji narx yopiq |
| `409` | `QUOTE_ALREADY_CONVERTED` |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#quotes)

---

<a id="delete-quotes-id"></a>

### `DELETE /quotes/:id` — Taklifni o‘chirish (yumshoq)

**Qachon / qanday:** Yumshoq o‘chirish; sotuvga aylantirilgan taklif o‘chmaydi (409). «Qaytarish» → `POST /quotes/:id/restore`.

| | |
|---|---|
| Huquq | `quotes.delete` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `QUOTE_ALREADY_CONVERTED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#quotes)

---

<a id="post-quotes-id-restore"></a>

### `POST /quotes/:id/restore` — O‘chirilgan taklifni tiklash (undo)

**Qachon / qanday:** O‘chirishni qaytarish (undo).

| | |
|---|---|
| Huquq | `quotes.delete` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`QuoteDto`](schemas.md#quotedto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#quotes)

---

<a id="post-quotes-id-convert"></a>

### `POST /quotes/:id/convert` — Taklifni sotuvga aylantirish

> Qoldiq tanlangan omborda (`warehouseId`, berilmasa — joriy) tekshiriladi, bir marta (I20); to‘lov usuli chaqiruvchidan; nasiyada mijoz shart. Idempotent.

**Qachon / qanday:** Qabul qilingan taklifni sotuvga aylantirish: `method` — `cash|card|transfer` (to‘liq to‘lov) yoki `debt` (nasiya, mijoz shart). Ochiq smena shart; qoldiq yetmasa — 422 `QUOTE_STOCK_SHORT` (`errors[]` — qaysi tovar). Ombor — `warehouseId` (kassada tanlangani; berilmasa — joriy, amalda sukut ombor), arxiv — 422 `WAREHOUSE_ARCHIVED`. Server holatni tekshirmaydi — aylantirilmagan HAR QANDAY taklif (`draft`, `rejected`, muddati o‘tgan ham) aylantiriladi; tugmani faqat `accepted` da ko‘rsatish — frontend qoidasi. Javob — yaratilgan chek.

| | |
|---|---|
| Huquq | `sales.create` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`SaleDto`](schemas.md#saledto) |
| Realtime | `sale.created` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`ConvertQuoteDto`](schemas.md#convertquotedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `method` | `cash` \| `card` \| `transfer` \| `debt` | ✔ | To‘lov usuli chaqiruvchidan (I20) — `debt`: nasiya |
| `warehouseId` | `string` (uuid) |  | Chiqim ombori (kassada tanlangani); berilmasa — joriy ombor |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `QUOTE_ALREADY_CONVERTED` |
| `422` | `QUOTE_STOCK_SHORT` \| `CREDIT_REQUIRES_CUSTOMER` \| `CREDIT_*` \| `WAREHOUSE_ARCHIVED` \| `REFERENCE_NOT_FOUND` (ombor) |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#quotes)

---

<a id="purchase-orders"></a>

## Kirim buyurtmalari (ta’minotchidan xarid)

Buyurtma → qabul (to‘liq/qisman, kirim harakatlari va o‘rtacha tannarx) → ta’minotchiga to‘lov. Holatlar: `ordered` → `partial` → `received`; `cancelled` faqat hech narsa kelmagan buyurtmada. Sotuvchi rolida summalar (`total`, `receivedValue`, `paid`, `outstanding`, qator `cost`) javobda YO‘Q — bitta qatorli buyurtmada summa ÷ miqdor = tannarx.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/purchase-orders`](#get-purchase-orders) | Kirim buyurtmalari | `purchases.view` |
| `POST` | [`/purchase-orders`](#post-purchase-orders) | Buyurtma yaratish | `purchases.create` |
| `GET` | [`/purchase-orders/summary`](#get-purchase-orders-summary) | Xaridlar xulosasi | `purchases.view` |
| `GET` | [`/purchase-orders/:id`](#get-purchase-orders-id) | Kirim buyurtmasi | `purchases.view` |
| `PATCH` | [`/purchase-orders/:id`](#patch-purchase-orders-id) | Buyurtmani tahrirlash | `purchases.edit` |
| `DELETE` | [`/purchase-orders/:id`](#delete-purchase-orders-id) | Buyurtmani o‘chirish | `purchases.delete` |
| `POST` | [`/purchase-orders/:id/cancel`](#post-purchase-orders-id-cancel) | Buyurtmani bekor qilish | `purchases.edit` |
| `POST` | [`/purchase-orders/:id/restore`](#post-purchase-orders-id-restore) | O‘chirilgan buyurtmani tiklash (undo) | `purchases.delete` |
| `POST` | [`/purchase-orders/:id/receive`](#post-purchase-orders-id-receive) 🔁 📡 | Qabul qilish (to‘liq yoki qisman) | `purchases.receive` |
| `POST` | [`/purchase-orders/:id/pay`](#post-purchase-orders-id-pay) 🔁 | Ta’minotchiga to‘lov | `purchases.pay` |

<a id="get-purchase-orders"></a>

### `GET /purchase-orders` — Kirim buyurtmalari

> Har buyurtmada qarz — faqat kelgan tovar uchun (I18)

**Qachon / qanday:** Xaridlar sahifasi. Har buyurtmada `outstanding` — faqat KELGAN tovar uchun qarzimiz. Sotuvchida summalar yo‘q (ustunlarni yashiring).

| | |
|---|---|
| Huquq | `purchases.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`PurchaseOrderPageDto`](schemas.md#purchaseorderpagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `status` | query | `ordered` \| `partial` \| `received` \| `cancelled` |  |  |
| `supplierId` | query | `string` (uuid) |  |  |
| `dateFrom` | query | `string` |  | Buyurtma sanasi — shu kundan — misol `2026-09-01` |
| `dateTo` | query | `string` |  | Buyurtma sanasi — shu kun ham — misol `2026-09-30` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="post-purchase-orders"></a>

### `POST /purchase-orders` — Buyurtma yaratish

> Raqam `BUY-NNNN` (I12)

**Qachon / qanday:** Buyurtma: ta’minotchi, qatorlar (`productId`, `qty` — asosiy birlikda, `cost` — birlik narx), ixtiyoriy qabul ombori va to‘lov muddati. Raqam `BUY-NNNN`.

| | |
|---|---|
| Huquq | `purchases.create` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`PurchaseOrderDto`](schemas.md#purchaseorderdto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CreatePurchaseOrderDto`](schemas.md#createpurchaseorderdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `supplierId` | `string` (uuid) | ✔ |  |
| `warehouseId` | `string` (uuid) |  | Qabul ombori; berilmasa — qabul paytidagi joriy ombor |
| `items` | [`PoItemInputDto`](schemas.md#poiteminputdto)[] | ✔ | ko‘pi bilan `500` |
| `date` | `string` |  | Berilmasa — bugun — misol `2026-09-23` |
| `dueDate` | `string` |  | Berilmasa — ta’minotchi to‘lov muddatidan — misol `2026-10-23` |
| `note` | `string` |  | maks. uzunlik `1000` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `422` | `REFERENCE_NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="get-purchase-orders-summary"></a>

### `GET /purchase-orders/summary` — Xaridlar xulosasi

> Kreditorlik, kutilayotgan buyurtmalar, oy va qabul qilingan summa — bitta so‘rov.

**Qachon / qanday:** Xaridlar kartalari: kreditorlik, kutilayotgan buyurtmalar, oy xaridi, qabul qilingan summa. Sotuvchida faqat `openOrders`.

| | |
|---|---|
| Huquq | `purchases.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`PurchaseOrderSummaryDto`](schemas.md#purchaseordersummarydto) |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="get-purchase-orders-id"></a>

### `GET /purchase-orders/:id` — Kirim buyurtmasi

**Qachon / qanday:** Buyurtma kartasi: qatorlar (`items[].id` — qabulda `poItemId`, `receivedQty` — kelgani), to‘langan va qarz.

| | |
|---|---|
| Huquq | `purchases.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`PurchaseOrderDto`](schemas.md#purchaseorderdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="patch-purchase-orders-id"></a>

### `PATCH /purchase-orders/:id` — Buyurtmani tahrirlash

> Faqat `ordered` holatida

**Qachon / qanday:** Faqat `ordered` holatida (hech narsa kelmagan). `items` berilsa — to‘liq almashtiriladi.

| | |
|---|---|
| Huquq | `purchases.edit` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`PurchaseOrderDto`](schemas.md#purchaseorderdto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdatePurchaseOrderDto`](schemas.md#updatepurchaseorderdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `warehouseId` | `string` (uuid) |  |  |
| `items` | [`PoItemInputDto`](schemas.md#poiteminputdto)[] |  | Berilsa — qatorlar TO‘LIQ almashtiriladi |
| `dueDate` | `string` |  |  |
| `note` | `string` |  | maks. uzunlik `1000` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `PO_ALREADY_RECEIVED` \| `PO_CANCELLED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="delete-purchase-orders-id"></a>

### `DELETE /purchase-orders/:id` — Buyurtmani o‘chirish

> Tovar kelmagan va to‘lanmagan bo‘lsa

**Qachon / qanday:** Faqat `ordered` yoki `cancelled` va to‘lanmagan buyurtma (aks holda 409 `PO_ALREADY_RECEIVED`); toast’dagi «Qaytarish» → `.../restore`.

| | |
|---|---|
| Huquq | `purchases.delete` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="post-purchase-orders-id-cancel"></a>

### `POST /purchase-orders/:id/cancel` — Buyurtmani bekor qilish

> Faqat `ordered` — qisman kelgani bekor qilinmaydi (I19)

**Qachon / qanday:** Faqat `ordered` (hech narsa kelmagan) buyurtma bekor qilinadi; qisman kelgan — 409 `PO_ALREADY_RECEIVED`.

| | |
|---|---|
| Huquq | `purchases.edit` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`PurchaseOrderDto`](schemas.md#purchaseorderdto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `PO_ALREADY_RECEIVED` \| `PO_CANCELLED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="post-purchase-orders-id-restore"></a>

### `POST /purchase-orders/:id/restore` — O‘chirilgan buyurtmani tiklash (undo)

**Qachon / qanday:** O‘chirishni qaytarish (undo).

| | |
|---|---|
| Huquq | `purchases.delete` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`PurchaseOrderDto`](schemas.md#purchaseorderdto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="post-purchase-orders-id-receive"></a>

### `POST /purchase-orders/:id/receive` — Qabul qilish (to‘liq yoki qisman)

> Buyurtmadan oshmaydi (I19); har qator — kirim harakati va o‘rtacha tannarx (I11). Idempotent.

**Qachon / qanday:** Tovar keldi: `items[]` — `poItemId` va kelgan miqdor (qisman bo‘lishi mumkin); `items` berilmasa — qolgani HAMMASI. Buyurtmadan ko‘p — 422 `PO_OVER_RECEIVE`. Har qator — kirim harakati va o‘rtacha tannarx.

| | |
|---|---|
| Huquq | `purchases.receive` — sukut bo‘yicha: admin, manager, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `200` → [`PurchaseOrderDto`](schemas.md#purchaseorderdto) |
| Realtime | `po.received` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`ReceivePurchaseOrderDto`](schemas.md#receivepurchaseorderdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `items` | [`ReceiveItemDto`](schemas.md#receiveitemdto)[] |  | Berilmasa — qolgan HAMMASI qabul qilinadi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `409` | `PO_ALREADY_RECEIVED` \| `PO_CANCELLED` |
| `422` | `PO_OVER_RECEIVE` \| `WAREHOUSE_ARCHIVED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="post-purchase-orders-id-pay"></a>

### `POST /purchase-orders/:id/pay` — Ta’minotchiga to‘lov

> Kelgan tovar qarzidan oshmaydi (I18); naqd — kassadan (smena hisobotida). Idempotent.

**Qachon / qanday:** Ta’minotchiga to‘lov (`purchases.pay`). Kelgan tovar qarzidan oshmaydi (422 `PAYMENT_EXCEEDS_DEBT`) — oldindan to‘lov yo‘q. `cash` — kassadan (ochiq smena shart). `cost.view` siz rolda xatoda qarz miqdori aytilmaydi (`meta: { requested }`).

| | |
|---|---|
| Huquq | `purchases.pay` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`PoPaymentResultDto`](schemas.md#popaymentresultdto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`PayPurchaseOrderDto`](schemas.md#paypurchaseorderdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `amount` | `number` | ✔ | misol `400000` |
| `method` | `cash` \| `bank` | ✔ | `cash` — kassadan chiqadi (ochiq smena shart) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `422` | `PAYMENT_EXCEEDS_DEBT` |
| `423` | `SHIFT_REQUIRED` (naqd) |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#purchase-orders)

---

<a id="deliveries"></a>

## Yetkazib berish

Yetkazishlar ro‘yxati, haydovchi ko‘rinishi (`/my`), marshrut varaqasi. Holat faqat oldinga: `pending` → `on_way` → `delivered`; faol holatdan `cancelled`.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/deliveries`](#get-deliveries) | Yetkazishlar | `deliveries.view` |
| `POST` | [`/deliveries`](#post-deliveries) | Yetkazish qo‘shish | `deliveries.create` |
| `GET` | [`/deliveries/summary`](#get-deliveries-summary) | Yetkazishlar xulosasi | `deliveries.view` |
| `GET` | [`/deliveries/my`](#get-deliveries-my) | Haydovchi ko‘rinishi | `deliveries.view` |
| `GET` | [`/deliveries/route`](#get-deliveries-route) | Marshrut varaqasi | `deliveries.view` |
| `GET` | [`/deliveries/:id`](#get-deliveries-id) | Yetkazish | `deliveries.view` |
| `PATCH` | [`/deliveries/:id`](#patch-deliveries-id) | Yetkazishni tahrirlash | `deliveries.edit` |
| `DELETE` | [`/deliveries/:id`](#delete-deliveries-id) | Yetkazishni o‘chirish | `deliveries.delete` |
| `POST` | [`/deliveries/:id/status`](#post-deliveries-id-status) 📡 | Holatni o‘zgartirish | `deliveries.view` |
| `POST` | [`/deliveries/:id/restore`](#post-deliveries-id-restore) | O‘chirilgan yetkazishni tiklash (undo) | `deliveries.delete` |

<a id="get-deliveries"></a>

### `GET /deliveries` — Yetkazishlar

**Qachon / qanday:** Yetkazishlar sahifasi; `overdue=true` — rejalashtirilgan sanasi o‘tgan faollari.

| | |
|---|---|
| Huquq | `deliveries.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DeliveryPageDto`](schemas.md#deliverypagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `status` | query | `pending` \| `on_way` \| `delivered` \| `cancelled` |  |  |
| `driverId` | query | `string` (uuid) |  |  |
| `dateFrom` | query | `string` |  | misol `2026-09-01` |
| `dateTo` | query | `string` |  | misol `2026-09-30` |
| `overdue` | query | `boolean` |  | Faqat muddati o‘tgan faol yetkazishlar |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="post-deliveries"></a>

### `POST /deliveries` — Yetkazish qo‘shish

> Chekli — narx chekdan (D3); chekSIZ — `fee` alohida

**Qachon / qanday:** Qo‘lda yetkazish. Chekka bog‘liq (`saleId`) — narx chekdan; cheksiz (alohida xizmat) — `fee`. Odatda yetkazish POS’da chek bilan birga yaratiladi (`POST /sales` → `delivery`).

| | |
|---|---|
| Huquq | `deliveries.create` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`DeliveryDto`](schemas.md#deliverydto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CreateDeliveryDto`](schemas.md#createdeliverydto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `saleId` | `string` (uuid) |  | Chekka bog‘langan yetkazish — narx chekdan (D3) |
| `customerId` | `string` (uuid) |  |  |
| `address` | `string` | ✔ | misol `Toshkent, Chilonzor 7` |
| `phone` | `string` | ✔ | misol `+998901234567` |
| `scheduledDate` | `string` | ✔ | misol `2026-09-24` |
| `driverId` | `string` (uuid) |  | Haydovchi — xodim |
| `fee` | `number` |  | Faqat chekSIZ (alohida xizmat) yetkazishda — misol `20000` |
| `note` | `string` |  | maks. uzunlik `500` |
| `lat` | `number` |  | misol `41.31` |
| `lng` | `number` |  | misol `69.24` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="get-deliveries-summary"></a>

### `GET /deliveries/summary` — Yetkazishlar xulosasi

> Holatlar bo‘yicha son, yetkazilganlar narxi, haydovchilar yuki

**Qachon / qanday:** Kartalar: holatlar bo‘yicha son, yetkazilganlar narxi, haydovchilar yuki.

| | |
|---|---|
| Huquq | `deliveries.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DeliverySummaryDto`](schemas.md#deliverysummarydto) |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="get-deliveries-my"></a>

### `GET /deliveries/my` — Haydovchi ko‘rinishi

> Faqat O‘ZIGA biriktirilgan faol yetkazishlar (xodim tokendan)

**Qachon / qanday:** Haydovchi ko‘rinishi: faqat O‘ZIGA (token’dagi xodim) biriktirilgan faol yetkazishlar. Alohida haydovchi roli yo‘q.

| | |
|---|---|
| Huquq | `deliveries.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DeliveryDto`](schemas.md#deliverydto)[] |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="get-deliveries-route"></a>

### `GET /deliveries/route` — Marshrut varaqasi

> Haydovchining kungi yetkazishlari, olinadigan pul bilan — bitta so‘rov

**Qachon / qanday:** Marshrut varaqasi: haydovchining kungi yetkazishlari va olinadigan pul (`date`, `driverId`).

| | |
|---|---|
| Huquq | `deliveries.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`RouteSheetDto`](schemas.md#routesheetdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `date` | query | `string` |  | Berilmasa — bugun — misol `2026-09-24` |
| `driverId` | query | `string` (uuid) |  | Berilmasa — joriy foydalanuvchining o‘zi |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="get-deliveries-id"></a>

### `GET /deliveries/:id` — Yetkazish

**Qachon / qanday:** Bitta yetkazish — karta / tahrir formasi.

| | |
|---|---|
| Huquq | `deliveries.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DeliveryDto`](schemas.md#deliverydto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="patch-deliveries-id"></a>

### `PATCH /deliveries/:id` — Yetkazishni tahrirlash

> Faqat faol holatda; holat — alohida yo‘l bilan

**Qachon / qanday:** Faqat faol holatda. `driverId: null` — haydovchini olib tashlash, `lat/lng: null` — joylashuvni tozalash.

| | |
|---|---|
| Huquq | `deliveries.edit` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DeliveryDto`](schemas.md#deliverydto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateDeliveryDto`](schemas.md#updatedeliverydto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `address` | `string` |  |  |
| `phone` | `string` |  |  |
| `scheduledDate` | `string` |  |  |
| `driverId` | `string` (uuid) \| `null` |  | `null` — haydovchi olib tashlanadi |
| `fee` | `number` |  | Faqat chekSIZ yetkazishda |
| `note` | `string` \| `null` |  | maks. uzunlik `500` |
| `lat` | `number` \| `null` |  | `null` — joylashuv tozalanadi |
| `lng` | `number` \| `null` |  |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="delete-deliveries-id"></a>

### `DELETE /deliveries/:id` — Yetkazishni o‘chirish

**Qachon / qanday:** Yumshoq o‘chirish; «Qaytarish» → `POST /deliveries/:id/restore`.

| | |
|---|---|
| Huquq | `deliveries.delete` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="post-deliveries-id-status"></a>

### `POST /deliveries/:id/status` — Holatni o‘zgartirish

> Faqat oldinga: pending → on_way → delivered; faoldan — cancelled. Tahrir huquqi yo‘q bo‘lsa — faqat o‘z yetkazishi.

**Qachon / qanday:** Holat: `pending` → `on_way` → `delivered`; faol holatdan → `cancelled`. `deliveries.edit` bor rol HAR QANDAY yetkazish holatini o‘zgartiradi; `edit` siz rol (haydovchi) — faqat O‘ZIGA biriktirilganini (aks holda 403). Orqaga — 422 `INVALID_STATUS_TRANSITION`.

| | |
|---|---|
| Huquq | `deliveries.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DeliveryDto`](schemas.md#deliverydto) |
| Realtime | `delivery.status` (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`DeliveryStatusDto`](schemas.md#deliverystatusdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `status` | `pending` \| `on_way` \| `delivered` \| `cancelled` | ✔ | pending → on_way → delivered; faol holatdan — cancelled |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `403` | Boshqa haydovchining yetkazishi |
| `422` | `INVALID_STATUS_TRANSITION` |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="post-deliveries-id-restore"></a>

### `POST /deliveries/:id/restore` — O‘chirilgan yetkazishni tiklash (undo)

**Qachon / qanday:** O‘chirishni qaytarish (undo).

| | |
|---|---|
| Huquq | `deliveries.delete` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DeliveryDto`](schemas.md#deliverydto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#deliveries)

---

<a id="expenses"></a>

## Xarajatlar va takrorlanuvchi shablonlar

Xarajatlar jurnali va kartalari. Naqd xarajat kassadan chiqadi (ochiq smena shart). Shablonlar (ijara, oylik) har kuni 00:05 da avtomatik xarajatga aylanadi.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/expenses`](#get-expenses) | Xarajatlar ro‘yxati | `expenses.view` |
| `POST` | [`/expenses`](#post-expenses) 🔁 | Xarajat qo‘shish | `expenses.create` |
| `GET` | [`/expenses/summary`](#get-expenses-summary) | Xarajatlar xulosasi | `expenses.view` |
| `GET` | [`/expenses/:id`](#get-expenses-id) | Xarajat | `expenses.view` |
| `PATCH` | [`/expenses/:id`](#patch-expenses-id) | Xarajatni tahrirlash | `expenses.edit` |
| `DELETE` | [`/expenses/:id`](#delete-expenses-id) | Xarajatni o‘chirish | `expenses.delete` |
| `POST` | [`/expenses/:id/restore`](#post-expenses-id-restore) | O‘chirilgan xarajatni tiklash | `expenses.delete` |
| `GET` | [`/expense-templates`](#get-expense-templates) | Shablonlar | `expenses.view` |
| `POST` | [`/expense-templates`](#post-expense-templates) | Shablon qo‘shish | `expenses.create` |
| `POST` | [`/expense-templates/run-due`](#post-expense-templates-run-due) | Muddati kelgan shablonlarni hozir ishga tushirish | `expenses.create` |
| `PATCH` | [`/expense-templates/:id`](#patch-expense-templates-id) | Shablonni tahrirlash | `expenses.edit` |
| `DELETE` | [`/expense-templates/:id`](#delete-expense-templates-id) | Shablonni o‘chirish | `expenses.delete` |

<a id="get-expenses"></a>

### `GET /expenses` — Xarajatlar ro‘yxati

**Qachon / qanday:** Xarajatlar jurnali. `withDeleted=true` — o‘chirilganlari ham (tiklash uchun).

| | |
|---|---|
| Huquq | `expenses.view` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ExpensePageDto`](schemas.md#expensepagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `dateFrom` | query | `string` |  | misol `2026-09-01` |
| `dateTo` | query | `string` |  | misol `2026-09-30` |
| `category` | query | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` |  |  |
| `method` | query | `cash` \| `bank` |  |  |
| `withDeleted` | query | `boolean` |  | O‘chirilganlar ham (tiklash uchun) |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#expenses)

---

<a id="post-expenses"></a>

### `POST /expenses` — Xarajat qo‘shish

> Naqd — kassadan chiqadi, ochiq smena shart (I8). Idempotent.

**Qachon / qanday:** Xarajat. `method: cash` — kassadan chiqadi (ochiq smena shart, aks holda 423), `bank` — kassaga ta’sirsiz.

| | |
|---|---|
| Huquq | `expenses.create` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>`, `Idempotency-Key` (majburiy) |
| Javob | `201` → [`ExpenseDto`](schemas.md#expensedto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CreateExpenseDto`](schemas.md#createexpensedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` | ✔ |  |
| `amount` | `number` | ✔ | misol `500000` |
| `method` | `cash` \| `bank` | ✔ | `cash` — kassadan chiqadi (ochiq smena shart, I8) |
| `date` | `string` |  | Berilmasa — bugun — misol `2026-09-23` |
| `note` | `string` |  | maks. uzunlik `500` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `423` | `SHIFT_REQUIRED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan); 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#expenses)

---

<a id="get-expenses-summary"></a>

### `GET /expenses/summary` — Xarajatlar xulosasi

> Bugun, oy va jami — filtrsiz; kategoriya taqsimoti — ro‘yxat filtrlari bilan.

**Qachon / qanday:** Kartalar: bugun, oy, jami (filtrsiz) + kategoriya taqsimoti (ro‘yxat filtrlari bilan).

| | |
|---|---|
| Huquq | `expenses.view` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ExpenseSummaryDto`](schemas.md#expensesummarydto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `dateFrom` | query | `string` |  | misol `2026-09-01` |
| `dateTo` | query | `string` |  | misol `2026-09-30` |
| `category` | query | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` |  |  |
| `method` | query | `cash` \| `bank` |  |  |
| `withDeleted` | query | `boolean` |  | O‘chirilganlar ham (tiklash uchun) |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#expenses)

---

<a id="get-expenses-id"></a>

### `GET /expenses/:id` — Xarajat

**Qachon / qanday:** Bitta xarajat — tahrir formasi.

| | |
|---|---|
| Huquq | `expenses.view` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ExpenseDto`](schemas.md#expensedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#expenses)

---

<a id="patch-expenses-id"></a>

### `PATCH /expenses/:id` — Xarajatni tahrirlash

> Eski kassa ta’siri qaytarilib, yangisi qo‘llanadi

**Qachon / qanday:** Tahrir: eski kassa ta’siri qaytariladi, yangisi joriy smenaga qo‘llanadi. Ochiq smena faqat naqd ta’sir o‘zgarsa (summa yoki usul) kerak.

| | |
|---|---|
| Huquq | `expenses.edit` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ExpenseDto`](schemas.md#expensedto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateExpenseDto`](schemas.md#updateexpensedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` |  |  |
| `amount` | `number` |  | misol `500000` |
| `method` | `cash` \| `bank` |  | `cash` — kassadan chiqadi (ochiq smena shart, I8) |
| `date` | `string` |  | Berilmasa — bugun — misol `2026-09-23` |
| `note` | `string` |  | maks. uzunlik `500` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#expenses)

---

<a id="delete-expenses-id"></a>

### `DELETE /expenses/:id` — Xarajatni o‘chirish

> Naqd xarajat puli kassaga qaytadi

**Qachon / qanday:** O‘chirish: naqd xarajat puli kassaga qaytadi. «Qaytarish» → `POST /expenses/:id/restore`.

| | |
|---|---|
| Huquq | `expenses.delete` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#expenses)

---

<a id="post-expenses-id-restore"></a>

### `POST /expenses/:id/restore` — O‘chirilgan xarajatni tiklash

> Naqd xarajat yana kassadan chiqadi

**Qachon / qanday:** O‘chirilgan xarajatni qaytarish: naqd bo‘lsa yana kassadan chiqadi.

| | |
|---|---|
| Huquq | `expenses.delete` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ExpenseDto`](schemas.md#expensedto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#expenses)

---

<a id="get-expense-templates"></a>

### `GET /expense-templates` — Shablonlar

**Qachon / qanday:** Takrorlanuvchi xarajat shablonlari (ijara, oylik).

| | |
|---|---|
| Huquq | `expenses.view` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ExpenseTemplateDto`](schemas.md#expensetemplatedto)[] |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#expenses)

---

<a id="post-expense-templates"></a>

### `POST /expense-templates` — Shablon qo‘shish

**Qachon / qanday:** Shablon: `period` (`monthly` — `dayOfPeriod` 1–28, `weekly` — 1–7, dushanba = 1).

| | |
|---|---|
| Huquq | `expenses.create` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`ExpenseTemplateDto`](schemas.md#expensetemplatedto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CreateExpenseTemplateDto`](schemas.md#createexpensetemplatedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | misol `Do‘kon ijarasi` |
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` | ✔ |  |
| `amount` | `number` | ✔ | misol `5000000` |
| `method` | `cash` \| `bank` | ✔ |  |
| `period` | `monthly` \| `weekly` | ✔ |  |
| `dayOfPeriod` | `number` | ✔ | Oylik: 1–28, haftalik: 1–7 (dushanba = 1) — misol `1` |
| `active` | `boolean` |  | sukut `true` |
| `note` | `string` |  | maks. uzunlik `500` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#expenses)

---

<a id="post-expense-templates-run-due"></a>

### `POST /expense-templates/run-due` — Muddati kelgan shablonlarni hozir ishga tushirish

> Cron har kuni 00:05 da o‘zi ishlaydi; bu — qo‘lda. Davrga bir marta (I21).

**Qachon / qanday:** «Hozir ishga tushirish» tugmasi — muddati kelgan shablonlar xarajatga aylanadi (davrga bir marta). Cron o‘zi ham har kuni 00:05 da ishlaydi.

| | |
|---|---|
| Huquq | `expenses.create` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`RunDueResultDto`](schemas.md#rundueresultdto) |
| Audit jurnali | ha |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#expenses)

---

<a id="patch-expense-templates-id"></a>

### `PATCH /expense-templates/:id` — Shablonni tahrirlash

**Qachon / qanday:** Shablonni tahrirlash yoki vaqtincha to‘xtatish (`active: false`).

| | |
|---|---|
| Huquq | `expenses.edit` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ExpenseTemplateDto`](schemas.md#expensetemplatedto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateExpenseTemplateDto`](schemas.md#updateexpensetemplatedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | misol `Do‘kon ijarasi` |
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` |  |  |
| `amount` | `number` |  | misol `5000000` |
| `method` | `cash` \| `bank` |  |  |
| `period` | `monthly` \| `weekly` |  |  |
| `dayOfPeriod` | `number` |  | Oylik: 1–28, haftalik: 1–7 (dushanba = 1) — misol `1` |
| `active` | `boolean` |  | sukut `true` |
| `note` | `string` |  | maks. uzunlik `500` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#expenses)

---

<a id="delete-expense-templates-id"></a>

### `DELETE /expense-templates/:id` — Shablonni o‘chirish

**Qachon / qanday:** Shablonni o‘chirish; undan oldin yaratilgan xarajatlar qoladi.

| | |
|---|---|
| Huquq | `expenses.delete` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 404 `NOT_FOUND`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#expenses)

---

<a id="messages"></a>

## Xabarlar (Telegram va SMS)

Mijozlarga xabar: qabul qiluvchilar serverda hisoblanadi, yuborish fonda. Kanal: botga ulangan → Telegram (bepul), aks holda SMS (sozlangan bo‘lsa), aks holda yetib bormaydi. Kunlik chegara (tarifga bog‘liq) faqat SMS’ni sanaydi. Bot oqimi (shaxsiy QR, chek) — [README → Telegram](README.md#telegram).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/telegram`](#get-telegram) | Telegram bot holati | `customers.view` |
| `POST` | [`/telegram/webhook`](#post-telegram-webhook) 🔓 | Telegram webhook | ochiq |
| `GET` | [`/messages`](#get-messages) | Xabarlar jurnali | `messages.view` |
| `POST` | [`/messages`](#post-messages) | Xabar yuborish | `messages.send` |
| `POST` | [`/messages/preview`](#post-messages-preview) | Qabul qiluvchilar soni | `messages.send` |

<a id="get-telegram"></a>

### `GET /telegram` — Telegram bot holati

> `enabled: false` — serverda bot sozlanmagan: «Telegram’ga ulash» va «Chekni Telegram’ga» tugmalarini ko‘rsatmang.

**Qachon / qanday:** Bot holati: `enabled: false` — serverda bot sozlanmagan, «Telegram’ga ulash» va «Chekni Telegram’ga» tugmalarini ko‘rsatmang.

| | |
|---|---|
| Huquq | `customers.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`TelegramStatusDto`](schemas.md#telegramstatusdto) |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#messages)

---

<a id="post-telegram-webhook"></a>

### `POST /telegram/webhook` — Telegram webhook

> Faqat Telegram chaqiradi: `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`, aks holda 401. Qayta ishlash xatosida ham 200 — Telegram yangilanishni qayta-qayta yubormasin.

**Qachon / qanday:** Frontend CHAQIRMAYDI — Telegram serveri uchun (`X-Telegram-Bot-Api-Secret-Token`).

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Sarlavhalar | `x-telegram-bot-api-secret-token` (majburiy) |
| Javob | `200` |
| Audit jurnali | ha |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#messages)

---

<a id="get-messages"></a>

### `GET /messages` — Xabarlar jurnali

> Har xabarda yuborish holati statistikasi

**Qachon / qanday:** Xabarlar jurnali: `recipients` (yuborilganlar; `telegram` — shundan Telegram orqali), `unreachable` (yetib bormaganlar) va yuborish holati statistikasi.

| | |
|---|---|
| Huquq | `messages.view` — sukut bo‘yicha: admin, manager, sotuvchi, omborchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`MessagePageDto`](schemas.md#messagepagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#messages)

---

<a id="post-messages"></a>

### `POST /messages` — Xabar yuborish

> Qabul qiluvchilar serverda hisoblanadi, shablon o‘zgaruvchilari almashtiriladi. Yuborish fonda (navbat) — so‘rov kutmaydi. Kunlik chegara bor.

**Qachon / qanday:** Xabar yuborish: `target` (`customer` + `customerId`, `group` + `group`, `debtors`, `all`) va matn (≤ 600). O‘zgaruvchilar: `{name}`, `{phone}`, `{debt}`, `{bonus}`, `{store}` — har qabul qiluvchiga serverda almashtiriladi. Yuborish fonda. Botga ulangan mijozga — Telegram (do‘kon kartasi: sarlavha, qalin qiymatlar, aloqa), aks holda SMS (sozlangan bo‘lsa). Yetib bormaydigan bitta mijoz — 422 `RECIPIENT_UNREACHABLE` («Mijoz botga ulanmagan», `meta.reason`); guruhda — qolganlarga yuboriladi, yetmaganlar `unreachable` da (hech kimga — 422). Kunlik chegara (faqat SMS) — tarif `smsPerDay` va server `SMS_DAILY_LIMIT` (sukut 1000) ning kichigi; oshsa 429 `MESSAGE_LIMIT_EXCEEDED` (`meta.limit/used/requested`).

| | |
|---|---|
| Huquq | `messages.send` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `201` → [`MessageDto`](schemas.md#messagedto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`SendMessageDto`](schemas.md#sendmessagedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `target` | `customer` \| `group` \| `debtors` \| `all` | ✔ | customer \| group \| debtors \| all |
| `customerId` | `string` (uuid) |  | `target=customer` da majburiy |
| `group` | `retail` \| `wholesale` \| `vip` |  | `target=group` da majburiy |
| `text` | `string` | ✔ | O‘zgaruvchilar: {name}, {phone}, {debt}, {bonus}, {store} — maks. uzunlik `600`, misol `Hurmatli {name}, qarzingiz {debt} so‘m. {store}` |
| `template` | `string` |  | Qaysi shablondan (jurnal uchun) — misol `debt-reminder` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `429` | `MESSAGE_LIMIT_EXCEEDED` |

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#messages)

---

<a id="post-messages-preview"></a>

### `POST /messages/preview` — Qabul qiluvchilar soni

> Yubormaydi — faqat kim oladi (serverda hisoblanadi)

**Qachon / qanday:** Yuborishdan OLDIN (yubormaydi): `recipients` — yetib boradiganlar, shundan `telegram` — Telegram orqali, `unreachable` — yetib bormaydiganlar (botga ulanmagan, SMS yo‘q). `unreachable > 0` — ogohlantirib tasdiqlating.

| | |
|---|---|
| Huquq | `messages.send` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`AudiencePreviewDto`](schemas.md#audiencepreviewdto) |

**So‘rov tanasi** — [`MessageAudienceDto`](schemas.md#messageaudiencedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `target` | `customer` \| `group` \| `debtors` \| `all` | ✔ | customer \| group \| debtors \| all |
| `customerId` | `string` (uuid) |  | `target=customer` da majburiy |
| `group` | `retail` \| `wholesale` \| `vip` |  | `target=group` da majburiy |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#messages)

---

<a id="reports"></a>

## Hisobotlar

Bosh sahifa (dashboard), foyda/zarar (P&L), analitika. Barcha raqamlar SERVERDA hisoblanadi — brauzerda yig‘indi qilinmaydi. Tannarx/foyda maydonlari rol ruxsatiga qarab (`cost.view`, `profit.view`) yashiriladi.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/dashboard`](#get-dashboard) | Boshqaruv paneli | `reports.view` |
| `GET` | [`/reports/pnl`](#get-reports-pnl) | Foyda/zarar | `reports.view` |
| `GET` | [`/analytics`](#get-analytics) | Analitika | `reports.view` |

<a id="get-dashboard"></a>

### `GET /dashboard` — Boshqaruv paneli

> Bugun/kecha, balanslar, trend, toplar — bitta so‘rovda

**Qachon / qanday:** Bosh sahifa (moliya huquqi): bugun/kecha, debitor/kreditor, kam qolganlar, trend (`days` = 7 | 30 | 90), top mahsulot/qarzdor, oxirgi cheklar. Sotuvchida `profit` va `payables` (ta’minotchilarga qarz) yo‘q.

| | |
|---|---|
| Huquq | `reports.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`DashboardDto`](schemas.md#dashboarddto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `days` | query | `7` \| `30` \| `90` |  | Trend va top mahsulot davri (kun) — sukut `30` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#reports)

---

<a id="get-reports-pnl"></a>

### `GET /reports/pnl` — Foyda/zarar

> Oldingi davr bilan solishtirish, trend, to‘lov turlari, top mahsulot/sotuvchi, sotilmayotgan tovar

**Qachon / qanday:** Hisobotlar sahifasi: `from`/`to` (YYYY-MM-DD, ≤ 3 yil) — oldingi teng davr bilan solishtirish, trend (kun/oy), to‘lov turlari, xarajat kategoriyalari, top mahsulot, sotuvchilar va sotilmayotgan tovar (`limit` — shu uchala ro‘yxat uzunligi, sukut 20). Jami (`current/previous`) qaytarishlar ayirilgan; `trend` va top ro‘yxatlar — yalpi sotuv (qaytarishsiz), `trend` faqat sotuv bo‘lgan kunlar.

| | |
|---|---|
| Huquq | `reports.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`PnlDto`](schemas.md#pnldto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `from` | query | `string` | ✔ | misol `2026-09-01` |
| `to` | query | `string` | ✔ | misol `2026-09-30` |
| `limit` | query | `number` |  | `topProducts`, `sellers` va `deadStock.items` ro‘yxatlari chegarasi — min `1`, max `100`, sukut `20` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#reports)

---

<a id="get-analytics"></a>

### `GET /analytics` — Analitika

> ABC (80/95 %) — sotilgan BARCHA mahsulot (sahifalash mijozda), kategoriya va to‘lov taqsimoti, kunlik trend

**Qachon / qanday:** Analitika sahifasi: ABC tahlil (80/95 %) — sotilgan BARCHA mahsulot (jadvalni brauzerda sahifalang), kategoriya va to‘lov taqsimoti, kunlik trend — yalpi sotuv (qaytarishsiz). Faqat `from`/`to` — `limit` yuborilsa 400.

| | |
|---|---|
| Huquq | `reports.view` — sukut bo‘yicha: admin, manager, sotuvchi (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`AnalyticsDto`](schemas.md#analyticsdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `from` | query | `string` | ✔ | misol `2026-09-01` |
| `to` | query | `string` | ✔ | misol `2026-09-30` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#reports)

---

<a id="audit"></a>

## Audit jurnali

Kim, qachon, nima qildi — faqat o‘qish. `audit.view` ruxsati (sukut — faqat administrator).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/audit`](#get-audit) | Amallar jurnali | `audit.view` |

<a id="get-audit"></a>

### `GET /audit` — Amallar jurnali

> Yangisi birinchi; kalitli sahifa (`nextCursor`). Diff’da maxfiy maydonlar yo‘q.

**Qachon / qanday:** Audit jurnali sahifasi (kursorli). `group` — amal guruhi (`sale` → `sale.create`, `sale.cancel`, ...), `entityId` — bitta yozuv tarixi (masalan chek yoki mahsulot kartasida «Tarix» bo‘limi), `userId` — kim qilgan.

| | |
|---|---|
| Huquq | `audit.view` — sukut bo‘yicha: admin (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`AuditPageDto`](schemas.md#auditpagedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `userId` | query | `string` (uuid) |  | Kim qilgan (foydalanuvchi) |
| `group` | query | `string` |  | Amal guruhi — `sale.create`, `sale.cancel` … hammasi — misol `sale` |
| `entityId` | query | `string` (uuid) |  | Bitta yozuv tarixi (chek, mahsulot …) |
| `dateFrom` | query | `string` |  | Toshkent kuni bo‘yicha — misol `2026-09-01` |
| `dateTo` | query | `string` |  | misol `2026-09-30` |
| `q` | query | `string` |  | Amal yoki tafsilot matnida |
| `cursor` | query | `string` |  | Oldingi javobdagi `nextCursor` |
| `limit` | query | `number` |  | min `1`, max `200`, sukut `50` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`; 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#audit)

---

<a id="files"></a>

## Fayllar (rasm, hujjat)

Fayl serverdan O‘TMAYDI: server ruxsat beradi (presigned PUT), brauzer to‘g‘ridan-to‘g‘ri S3/MinIO ga yuklaydi, keyin server tasdiqlaydi. To‘liq oqim — [README → Fayl yuklash](README.md#files).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `POST` | [`/files/presign`](#post-files-presign) | Yuklash ruxsati (presigned PUT) | servisda / hamma |
| `POST` | [`/files/:id/confirm`](#post-files-id-confirm) | Yuklashni tasdiqlash | servisda / hamma |
| `GET` | [`/files/usage`](#get-files-usage) | Saqlash hajmi | `settings.view` |
| `GET` | [`/files/urls`](#get-files-urls) | Bir nechta fayl havolasi (`<img src>` uchun) | servisda / hamma |
| `GET` | [`/files/:id`](#get-files-id) | Fayl metama’lumoti | servisda / hamma |
| `DELETE` | [`/files/:id`](#delete-files-id) | Faylni o‘chirish (yumshoq) | servisda / hamma |
| `GET` | [`/files/:id/raw`](#get-files-id-raw) | Faylni o‘qish (302 → presigned GET) | servisda / hamma |

<a id="post-files-presign"></a>

### `POST /files/presign` — Yuklash ruxsati (presigned PUT)

> Tur, MIME (oq ro‘yxat), hajm va kvota tekshiriladi, keyin 10 daqiqalik PUT havolasi beriladi. Shu tarkib (`sha256`) allaqachon bor bo‘lsa — `reused: true`, havola yo‘q, mavjud fayl qaytadi. Jurnalga tasdiqlashda yoziladi (kutilayotgan fayl hali o‘zgarish emas).

**Qachon / qanday:** 1-qadam: brauzerda faylning SHA-256 (hex) hisoblanadi, `kind`, `mime`, `size` bilan yuboriladi. `reused: true` — bu tarkib allaqachon bor: `file.id` ni darhol ishlating (yuklash kerak emas). Aks holda `upload.url` ga `PUT` (aynan `upload.headers` bilan, 10 daqiqa ichida), keyin 2-qadam.

| | |
|---|---|
| Huquq | fayl turiga qarab (servisda, `FILE_RULES`): `product_image`, `import` → `products.view/create/delete`; `avatar` → `employees.*`; `document` → `sales.view/create/cancel`; `export` → `reports.view`; `tenant_backup`, `store_logo` → `settings.view` (o‘qish; logotipni hamma o‘qiydi) / `settings.edit` (yuklash, o‘chirish). Tartib: o‘qish / yuklash va tasdiqlash / o‘chirish |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`PresignResultDto`](schemas.md#presignresultdto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`PresignDto`](schemas.md#presigndto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `kind` | `product_image` \| `document` \| `export` \| `import` \| `tenant_backup` \| `avatar` \| `store_logo` | ✔ |  |
| `mime` | `string` | ✔ | Oq ro‘yxatdan (09 §9.6) — misol `image/webp` |
| `size` | `number` | ✔ | Bayt — imzoga kiradi — misol `153600` |
| `sha256` | `string` | ✔ | Tarkib SHA-256 (hex) — takror yuklashni aniqlash — misol `ab12…` |
| `originalName` | `string` |  | maks. uzunlik `200`, misol `sement.webp` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `413` | `PAYLOAD_TOO_LARGE` \| `STORAGE_QUOTA_EXCEEDED` |
| `422` | `FILE_REJECTED` — shu tarkib avval rad etilgan |

Umumiy: 400 `VALIDATION_FAILED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#files)

---

<a id="post-files-id-confirm"></a>

### `POST /files/:id/confirm` — Yuklashni tasdiqlash

> Obyekt hajmi, boshlanish baytlari (MIME) va xeshi tekshiriladi. Mos kelmasa obyekt o‘chiriladi, fayl karantinga tushadi va jurnalga yoziladi (422). Takroriy chaqiruv — tayyor faylni qaytaradi.

**Qachon / qanday:** 2-qadam (PUT dan keyin): server hajm, MIME (sehrli baytlar) va xeshni tekshiradi → `status: ready`. Shundan keyin `id` ni mahsulotga (`imageFileId`) bog‘lang. PUT hali bo‘lmagan — 409 `FILE_NOT_UPLOADED`; tarkib mos emas — 422 `FILE_REJECTED`.

| | |
|---|---|
| Huquq | fayl turiga qarab (servisda, `FILE_RULES`): `product_image`, `import` → `products.view/create/delete`; `avatar` → `employees.*`; `document` → `sales.view/create/cancel`; `export` → `reports.view`; `tenant_backup`, `store_logo` → `settings.view` (o‘qish; logotipni hamma o‘qiydi) / `settings.edit` (yuklash, o‘chirish). Tartib: o‘qish / yuklash va tasdiqlash / o‘chirish |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`FileDto`](schemas.md#filedto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |
| `409` | `FILE_NOT_UPLOADED` — obyekt hali PUT qilinmagan |
| `413` | `STORAGE_QUOTA_EXCEEDED` |
| `422` | `FILE_REJECTED` |

Umumiy: 400 `VALIDATION_FAILED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#files)

---

<a id="get-files-usage"></a>

### `GET /files/usage` — Saqlash hajmi

> Band hajm, tarif chegarasi va tur bo‘yicha taqsimot

**Qachon / qanday:** «Tarif va hisob» sahifasida saqlash hajmi: band, chegara va tur bo‘yicha.

| | |
|---|---|
| Huquq | `settings.view` — sukut bo‘yicha: admin, manager (do‘kon rollarida — administrator belgilaydi) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`UsageDto`](schemas.md#usagedto) |

**Xatolar**

Umumiy: 403 `PERMISSION_DENIED`.

[↑ Bo‘lim boshiga](#files)

---

<a id="get-files-urls"></a>

### `GET /files/urls` — Bir nechta fayl havolasi (`<img src>` uchun)

> Sahifadagi rasmlar uchun bitta so‘rov: id → 10 daqiqalik imzolangan havola. Variant tayyor bo‘lmasa — asl fayl. Boshqa do‘kon, tayyor bo‘lmagan yoki huquq yetmagan fayl javobda bo‘lmaydi.

**Qachon / qanday:** Ro‘yxatdagi rasmlar uchun BITTA so‘rov: `ids` (vergul bilan, ≤ 100) → `{id: url}` (10 daqiqa). `<img src>` token yubora olmaydi — shuning uchun imzolangan havola. `variant` sukut `128` (ro‘yxat), kartada `512`. Havola `expiresAt` dan oldin yangilansin.

| | |
|---|---|
| Huquq | fayl turiga qarab (servisda, `FILE_RULES`): `product_image`, `import` → `products.view/create/delete`; `avatar` → `employees.*`; `document` → `sales.view/create/cancel`; `export` → `reports.view`; `tenant_backup`, `store_logo` → `settings.view` (o‘qish; logotipni hamma o‘qiydi) / `settings.edit` (yuklash, o‘chirish). Tartib: o‘qish / yuklash va tasdiqlash / o‘chirish |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`FileUrlsDto`](schemas.md#fileurlsdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `ids` | query | `string` | ✔ | Vergul bilan, ko‘pi bilan 100 ta — misol `0199…,0199…` |
| `variant` | query | `orig` \| `128` \| `512` |  | Variant tayyor bo‘lmasa — `orig` — sukut `"128"` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#files)

---

<a id="get-files-id"></a>

### `GET /files/:id` — Fayl metama’lumoti

**Qachon / qanday:** Fayl metama’lumoti: holat (`pending|ready|quarantined`), tayyor variantlar (`128`, `512`).

| | |
|---|---|
| Huquq | fayl turiga qarab (servisda, `FILE_RULES`): `product_image`, `import` → `products.view/create/delete`; `avatar` → `employees.*`; `document` → `sales.view/create/cancel`; `export` → `reports.view`; `tenant_backup`, `store_logo` → `settings.view` (o‘qish; logotipni hamma o‘qiydi) / `settings.edit` (yuklash, o‘chirish). Tartib: o‘qish / yuklash va tasdiqlash / o‘chirish |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`FileDto`](schemas.md#filedto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#files)

---

<a id="delete-files-id"></a>

### `DELETE /files/:id` — Faylni o‘chirish (yumshoq)

> Mahsulotlardagi havola uziladi; obyekt 30 kundan keyin tozalanadi (tiklash imkoni uchun).

**Qachon / qanday:** Faylni o‘chirish; mahsulotlardagi havola uziladi. S3’dan 30 kundan keyin tozalanadi.

| | |
|---|---|
| Huquq | fayl turiga qarab (servisda, `FILE_RULES`): `product_image`, `import` → `products.view/create/delete`; `avatar` → `employees.*`; `document` → `sales.view/create/cancel`; `export` → `reports.view`; `tenant_backup`, `store_logo` → `settings.view` (o‘qish; logotipni hamma o‘qiydi) / `settings.edit` (yuklash, o‘chirish). Tartib: o‘qish / yuklash va tasdiqlash / o‘chirish |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `204` — tana yo‘q |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#files)

---

<a id="get-files-id-raw"></a>

### `GET /files/:id/raw` — Faylni o‘qish (302 → presigned GET)

> Huquq tekshiriladi, keyin 10 daqiqalik havolaga yo‘naltiriladi. Variant (`128`, `512`) hali tayyor bo‘lmasa — asl fayl. Boshqa do‘kon fayli — 404.

**Qachon / qanday:** Bitta faylni ochish: 302 → imzolangan havola. Diqqat: bu yo‘l `Authorization` talab qiladi, shuning uchun `<img src>` da ishlamaydi — rasm uchun `GET /files/urls` dan foydalaning; bu yo‘l fetch/yuklab olish uchun.

| | |
|---|---|
| Huquq | fayl turiga qarab (servisda, `FILE_RULES`): `product_image`, `import` → `products.view/create/delete`; `avatar` → `employees.*`; `document` → `sales.view/create/cancel`; `export` → `reports.view`; `tenant_backup`, `store_logo` → `settings.view` (o‘qish; logotipni hamma o‘qiydi) / `settings.edit` (yuklash, o‘chirish). Tartib: o‘qish / yuklash va tasdiqlash / o‘chirish |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `302` — `Location` — imzolangan havola |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |
| `variant` | query | `orig` \| `128` \| `512` |  | Variant tayyor bo‘lmasa — `orig` — sukut `"orig"` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#files)

---

<a id="exports"></a>

## Eksport (CSV/JSON)

5000 qatorgacha — fayl darhol javobda; ko‘p bo‘lsa — fon ishi (202) va keyin yuklab olish havolasi.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/exports/jobs/:id`](#get-exports-jobs-id) | Eksport ishi holati | servisda / hamma |
| `GET` | [`/exports/jobs/:id/download`](#get-exports-jobs-id-download) | Tayyor eksportni yuklab olish (302 → presigned GET) | servisda / hamma |
| `GET` | [`/exports/:resource`](#get-exports-resource) | Ro‘yxatni eksport qilish (CSV/JSON) | servisda / hamma |

<a id="get-exports-jobs-id"></a>

### `GET /exports/jobs/:id` — Eksport ishi holati

> Faqat so‘rovchi ko‘radi. Tayyor bo‘lsa — `url` (imzolangan havola, `expiresAt` gacha): brauzerda `window.location` bilan oching.

**Qachon / qanday:** Fon eksporti holati: `queued` → `running` → `ready` (yoki `failed`, sababi `error` da). `ready` da `url` — imzolangan havola (`expiresAt` gacha, ~10 daqiqa; eskirsa shu so‘rovni takrorlang) → `window.location.href = url`.

| | |
|---|---|
| Huquq | faqat eksportni so‘ragan foydalanuvchi (boshqasiga — 404) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`ExportJobDto`](schemas.md#exportjobdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#exports)

---

<a id="get-exports-jobs-id-download"></a>

### `GET /exports/jobs/:id/download` — Tayyor eksportni yuklab olish (302 → presigned GET)

> Faqat so‘rovchi.

**Qachon / qanday:** Muqobil yo‘l: 302 → imzolangan havola (fayl 7 kun saqlanadi). `Authorization` talab qiladi, `fetch` bilan faqat API frontend bilan bir manbada bo‘lsa ishlaydi — odatda `GET /exports/jobs/:id` dagi `url` qulayroq.

| | |
|---|---|
| Huquq | faqat eksportni so‘ragan foydalanuvchi (boshqasiga — 404) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `302` — `Location` — imzolangan havola (`attachment`) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#exports)

---

<a id="get-exports-resource"></a>

### `GET /exports/:resource` — Ro‘yxatni eksport qilish (CSV/JSON)

> 5000 qatorgacha — darhol fayl (200, CSV — UTF-8 BOM bilan). Ko‘p bo‘lsa — fon ishi (202): holat `GET /exports/jobs/{id}`, tayyor bo‘lgach javobdagi `url` (yoki `…/download`). Tannarx kabi maydonlar rolga qarab chiqmaydi.

**Qachon / qanday:** «Eksport» tugmasi: `products`, `clients`, `sales`, `stock-movements`, `expenses`, `audit`; `format` — `csv` (Excel uchun BOM bilan) yoki `json`; sanali ro‘yxatlarda `dateFrom`/`dateTo`. 200 — fayl (blob; nom `Content-Disposition` da). 202 — fon ishi: `GET /exports/jobs/{id}` ni `status: ready` bo‘lguncha so‘rang (masalan 2–3 s da bir), keyin javobdagi `url` ni `window.location.href` bilan oching (token va CORS kerak emas).

| | |
|---|---|
| Huquq | ro‘yxatga qarab (servisda): `products` → `products.view`; `stock-movements` → `stock.view`; `clients` → `customers.view`; `sales` → `sales.view`; `expenses` → `expenses.view`; `audit` → `users.view` |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` — Fayl (`Content-Disposition: attachment`); `202` → [`ExportJobDto`](schemas.md#exportjobdto) — Katta eksport — fonda |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `resource` | yo‘l | `products` \| `clients` \| `sales` \| `stock-movements` \| `expenses` \| `audit` | ✔ |  |
| `format` | query | `csv` \| `json` |  | CSV — UTF-8 BOM bilan (Excel) — sukut `"csv"` |
| `dateFrom` | query | `string` |  | Sanali ro‘yxatlar uchun (sotuv, harakat, xarajat) — misol `2026-09-01` |
| `dateTo` | query | `string` |  | misol `2026-09-30` |

**Xatolar**

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#exports)

---

<a id="backup"></a>

## Do‘kon zaxirasi

Butun do‘kon ma’lumoti bitta JSON (gzip) fayl — yuklab olish havolasi 1 soat amal qiladi. Faqat administrator.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/backup/export`](#get-backup-export) | Do‘kon zaxirasi: butun ma’lumot JSON (gzip), havola 1 soat | faqat `admin` |

<a id="get-backup-export"></a>

### `GET /backup/export` — Do‘kon zaxirasi: butun ma’lumot JSON (gzip), havola 1 soat

> Brauzerdagi «Sozlamalar → Zaxira» shakli (`CrmSnapshot` + `settings`, parolsiz `users`) — `POST /migration/import` bilan boshqa do‘konga yuklanadi. Bitta izchil surat. To‘xtatilgan va o‘chirilayotgan do‘konda ham ishlaydi.

**Qachon / qanday:** Sozlamalar → «Zaxira olish»: javobdagi `url` ni ochib yuklab oling (`expiresAt` gacha, 1 soat). To‘xtatilgan/o‘chirilayotgan do‘konda ham ishlaydi. Tiklash (boshqa, bo‘sh do‘konga): faylni ochib (gunzip) `{ source: "localStorage", version, exportedAt, data: <butun fayl>, settings, users }` ko‘rinishida `POST /migration/import` ga (README 10.18).

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`BackupDto`](schemas.md#backupdto) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `403` | Faqat administrator |
| `413` | `STORAGE_QUOTA_EXCEEDED` — fayllar hajmi tarif chegarasida |

[↑ Bo‘lim boshiga](#backup)

---

<a id="migration"></a>

## Migratsiya (brauzerdagi eski ma’lumotni serverga ko‘chirish)

Eski (localStorage) versiyadan ko‘chirish sehrgari uchun: avval tekshirish (dry-run), keyin import. Faqat administrator. Sehrgar talablari — [README → Migratsiya](README.md#migration).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `POST` | [`/migration/validate`](#post-migration-validate) | Tekshirish (dry-run) | faqat `admin` |
| `POST` | [`/migration/import`](#post-migration-import) 💳 | Import | faqat `admin` |

<a id="post-migration-validate"></a>

### `POST /migration/validate` — Tekshirish (dry-run)

> Yozmaydi: nechta yozuv ko‘chadi, nimasi o‘tkazib yuboriladi (`error`) yoki tuzatiladi (`warning`), serverda allaqachon nima bor (`existing` — takroriy importdan ogohlantirish).

**Qachon / qanday:** Sehrgarning «Tekshirish» qadami: hech narsa yozmaydi. `counts` (nusxada), `accepted` (yoziladi), `existing` (serverda allaqachon bor — takroriy import ogohlantirishi), `issues` (`error` — o‘tkazib yuboriladi, `warning` — tuzatiladi).

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`MigrationReportDto`](schemas.md#migrationreportdto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`MigrationDto`](schemas.md#migrationdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `source` | `string` | ✔ | misol `localStorage` |
| `version` | `number` | ✔ | min `12`, max `15`, misol `15` |
| `exportedAt` | `string` |  | misol `2026-08-06T09:00:00Z` |
| `data` | `object` | ✔ | Brauzerdagi `CrmSnapshot` |
| `settings` | `object` |  | Brauzer sozlamalari (`Settings`) |
| `users` | [`MigrationUserDto`](schemas.md#migrationuserdto)[] |  | Parolsiz — server vaqtinchalik parol beradi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `403` | Faqat administrator |

Umumiy: 400 `VALIDATION_FAILED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#migration)

---

<a id="post-migration-import"></a>

### `POST /migration/import` — Import

> Bitta tranzaksiyada, tashqi kalitlar tartibida. Qayta yuborish ikkilanmaydi (id — eski id’dan deterministik). Buzilgan havola va invariantlar tiklanadi, rasmlar S3’ga ko‘chadi; muammolar `issues` da. Foydalanuvchilar uchun vaqtinchalik parollar faqat SHU javobda.

**Qachon / qanday:** Sehrgarning «Yuborish» qadami (tana ≤ 25 MB, 5 daqiqagacha). Qayta yuborish ikkilantirmaydi. Javobdagi `users[]` — vaqtinchalik parollar FAQAT shu javobda: foydalanuvchiga ko‘rsating va saqlab olishni so‘rang.

| | |
|---|---|
| Huquq | faqat `admin` roli (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`) |
| Sarlavhalar | `Authorization: Bearer <accessToken>` |
| Javob | `200` → [`MigrationResultDto`](schemas.md#migrationresultdto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`MigrationDto`](schemas.md#migrationdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `source` | `string` | ✔ | misol `localStorage` |
| `version` | `number` | ✔ | min `12`, max `15`, misol `15` |
| `exportedAt` | `string` |  | misol `2026-08-06T09:00:00Z` |
| `data` | `object` | ✔ | Brauzerdagi `CrmSnapshot` |
| `settings` | `object` |  | Brauzer sozlamalari (`Settings`) |
| `users` | [`MigrationUserDto`](schemas.md#migrationuserdto)[] |  | Parolsiz — server vaqtinchalik parol beradi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `402` | `PLAN_LIMIT_EXCEEDED` — tarif chegarasi (`meta.resource`, `limit`, `used`); tarif oshirilgach darhol ochiladi |
| `403` | Faqat administrator |

Umumiy: 400 `VALIDATION_FAILED`; 423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/bloklangan/o‘chirilmoqda).

[↑ Bo‘lim boshiga](#migration)

---

<a id="platform"></a>

## Platforma egasi paneli

DO‘KON ILOVASI UCHUN EMAS — alohida egasi paneli (`owner.workspaces.uz`): do‘konlar ro‘yxati, ochish, bloklash, tarif va qo‘lda to‘lov, o‘chirish, hisoblar, barcha hisob-fakturalar, egasi jurnali; egasi hisoblari va operatorlar (`role`), ikki bosqichli kirish (TOTP), egasining Telegram’i, platforma sozlamasi (ro‘yxatdan o‘tish, aloqa); do‘kon murojaatlari (javob, yopish). O‘z kirishi (`/platform/auth/*`, token `kind: platform`, cookie `platform_refresh`), do‘kon tokeni o‘tmaydi. To‘liq qo‘llanma — [owner-panel.md](owner-panel.md).

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `POST` | [`/platform/auth/login`](#post-platform-auth-login) 🔓 | Egasi paneliga kirish | ochiq |
| `POST` | [`/platform/auth/refresh`](#post-platform-auth-refresh) 🔓 | Egasi access tokenini yangilash | ochiq |
| `POST` | [`/platform/auth/logout`](#post-platform-auth-logout) 🔓 | Egasi panelidan chiqish | ochiq |
| `GET` | [`/platform/auth/me`](#get-platform-auth-me) | Joriy egasi | egasi tokeni |
| `POST` | [`/platform/auth/totp/setup`](#post-platform-auth-totp-setup) | Ikki bosqichli kirishni sozlashni boshlash | egasi tokeni |
| `POST` | [`/platform/auth/totp/enable`](#post-platform-auth-totp-enable) | Ikki bosqichli kirishni yoqish | egasi tokeni |
| `POST` | [`/platform/auth/totp/disable`](#post-platform-auth-totp-disable) | Ikki bosqichli kirishni o‘chirish | egasi tokeni |
| `POST` | [`/platform/auth/telegram-link`](#post-platform-auth-telegram-link) | Telegram botga ulanish havolasi | egasi tokeni |
| `DELETE` | [`/platform/auth/telegram-link`](#delete-platform-auth-telegram-link) | Telegram ulanishini olib tashlash | egasi tokeni |
| `GET` | [`/platform/tenants`](#get-platform-tenants) | Do‘konlar ro‘yxati | egasi tokeni |
| `POST` | [`/platform/tenants`](#post-platform-tenants) | Do‘kon ochish | egasi tokeni |
| `GET` | [`/platform/tenants/:id`](#get-platform-tenants-id) | Do‘kon kartasi | egasi tokeni |
| `PATCH` | [`/platform/tenants/:id`](#patch-platform-tenants-id) | Nom va egasi izohi | egasi tokeni |
| `POST` | [`/platform/tenants/:id/block`](#post-platform-tenants-id-block) 📡 | Do‘konni bloklash | egasi tokeni |
| `POST` | [`/platform/tenants/:id/unblock`](#post-platform-tenants-id-unblock) 📡 | Blokdan chiqarish | egasi tokeni |
| `POST` | [`/platform/tenants/:id/plan`](#post-platform-tenants-id-plan) 📡 | Tarif berish / qo‘lda to‘lov | egasi tokeni |
| `POST` | [`/platform/tenants/:id/delete`](#post-platform-tenants-id-delete) 📡 | Do‘konni o‘chirish (30 kun muhlat) | egasi tokeni |
| `POST` | [`/platform/tenants/:id/restore`](#post-platform-tenants-id-restore) 📡 | O‘chirishni bekor qilish | egasi tokeni |
| `GET` | [`/platform/tenants/:id/users`](#get-platform-tenants-id-users) | Do‘kon kirish hisoblari | egasi tokeni |
| `POST` | [`/platform/tenants/:id/users/:userId/reset-password`](#post-platform-tenants-id-users-userid-reset-password) | Do‘kon hisobiga yangi parol | egasi tokeni |
| `GET` | [`/platform/tenants/:id/invoices`](#get-platform-tenants-id-invoices) | Do‘kon hisob-fakturalari | egasi tokeni |
| `GET` | [`/platform/requests`](#get-platform-requests) | Do‘kon murojaatlari | egasi tokeni |
| `GET` | [`/platform/requests/:id`](#get-platform-requests-id) | Murojaat va xabarlari | egasi tokeni |
| `POST` | [`/platform/requests/:id/reply`](#post-platform-requests-id-reply) 📡 | Javob yozish | egasi tokeni |
| `POST` | [`/platform/requests/:id/close`](#post-platform-requests-id-close) 📡 | Murojaatni yopish | egasi tokeni |
| `GET` | [`/platform/admins`](#get-platform-admins) | Egasi hisoblari ro‘yxati | egasi tokeni |
| `POST` | [`/platform/admins`](#post-platform-admins) | Hisob ochish | egasi tokeni |
| `PATCH` | [`/platform/admins/:id`](#patch-platform-admins-id) | Nom, rol, faollik | egasi tokeni |
| `POST` | [`/platform/admins/:id/reset-password`](#post-platform-admins-id-reset-password) | Hisobga yangi parol | egasi tokeni |
| `POST` | [`/platform/admins/:id/totp/reset`](#post-platform-admins-id-totp-reset) | Ikki bosqichli kirishni olib tashlash | egasi tokeni |
| `GET` | [`/platform/stats`](#get-platform-stats) | Boshqaruv paneli | egasi tokeni |
| `GET` | [`/platform/invoices`](#get-platform-invoices) | Barcha do‘konlar hisob-fakturalari | egasi tokeni |
| `GET` | [`/platform/audit`](#get-platform-audit) | Egasi amallari jurnali | egasi tokeni |
| `GET` | [`/platform/settings`](#get-platform-settings) | Platforma sozlamasi | egasi tokeni |
| `PATCH` | [`/platform/settings`](#patch-platform-settings) | Sozlamani o‘zgartirish | egasi tokeni |

<a id="post-platform-auth-login"></a>

### `POST /platform/auth/login` — Egasi paneliga kirish

> Access token javobda (`kind: platform` — do‘kon yo‘llarida o‘tmaydi), refresh token `platform_refresh` httpOnly cookie’da. Ikki bosqichli kirish yoqilgan hisobda `totpCode` majburiy: kodsiz — 401 `AUTH_TOTP_REQUIRED` (parol to‘g‘ri, kod maydonini ko‘rsating), noto‘g‘ri kod — 401 `AUTH_TOTP_INVALID`.

**Qachon / qanday:** Egasi paneli kirish sahifasi. `accessToken` faqat XOTIRADA; `platform_refresh` httpOnly cookie faqat `/api/v1/platform/auth/*` ga boradi (`credentials: "include"`). Daqiqasiga 5 urinish (IP), oshsa — 429.

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Javob | `201` → [`PlatformLoginResponseDto`](schemas.md#platformloginresponsedto) |
| Chegara | 5 ta / daqiqa (IP bo‘yicha), oshsa — 429 |

**So‘rov tanasi** — [`PlatformLoginDto`](schemas.md#platformlogindto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `email` | `string` | ✔ | misol `owner@workspaces.uz` |
| `password` | `string` | ✔ |  |
| `totpCode` | `string` |  | Ikki bosqichli kirish yoqilgan hisobda majburiy: autentifikator ilovasidagi 6 raqam. Yo‘q bo‘lsa — 401 `AUTH_TOTP_REQUIRED` — misol `123456` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` \| `AUTH_TOTP_REQUIRED` \| `AUTH_TOTP_INVALID` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-auth-refresh"></a>

### `POST /platform/auth/refresh` — Egasi access tokenini yangilash

> Rotatsiya: eski cookie bekor, yangisi beriladi; bekor qilingani qayta ishlatilsa barcha sessiyalar yopiladi.

**Qachon / qanday:** 401 da BIR marta (parallel 401’lar bitta refresh’ni kutadi). `AUTH_TOKEN_REUSE` — barcha sessiyalar yopilgan: kirish sahifasiga.

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Sarlavhalar | cookie `platform_refresh` (brauzer o‘zi yuboradi: `credentials: "include"`) |
| Javob | `201` → [`PlatformLoginResponseDto`](schemas.md#platformloginresponsedto) |
| Chegara | 30 ta / daqiqa (IP bo‘yicha), oshsa — 429 |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_REFRESH` \| `AUTH_TOKEN_REUSE` |

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-auth-logout"></a>

### `POST /platform/auth/logout` — Egasi panelidan chiqish

**Qachon / qanday:** Chiqish tugmasi; keyin xotiradagi tokenni o‘chiring.

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Sarlavhalar | cookie `platform_refresh` (brauzer o‘zi yuboradi: `credentials: "include"`) |
| Javob | `201` → `{"ok": true}` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-auth-me"></a>

### `GET /platform/auth/me` — Joriy egasi

> Rol, ikki bosqichli kirish va Telegram holati ham shu yerda (profil sahifasi).

**Qachon / qanday:** Ilova ochilganda: avval `refresh`, keyin shu — sarlavhadagi egasi nomi. `role` (`owner`/`operator`) bo‘yicha faqat egasiga tegishli tugmalarni (o‘chirish/qaytarish, «Hisoblar», «Sozlamalar») yashiring; `totpEnabled`, `telegramLinked` — profil sahifasi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformAdminDto`](schemas.md#platformadmindto) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-auth-totp-setup"></a>

### `POST /platform/auth/totp/setup` — Ikki bosqichli kirishni sozlashni boshlash

> Yangi sir: QR (`otpauthUrl`) yoki qo‘lda `secret`. Kirishga hali ta’sir qilmaydi — `totp/enable` da ilovadagi kod bilan tasdiqlanadi. Qayta chaqirish — yangi sir.

**Qachon / qanday:** Profil → «Ikki bosqichli kirish» → «Yoqish»: `otpauthUrl` dan QR kod chizing (masalan `qrcode` paketi), yonida `secret` (qo‘lda kiritish uchun). Keyin kod maydoni → `totp/enable`. Yoqilgan bo‘lsa — 422.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `201` → [`TotpSetupDto`](schemas.md#totpsetupdto) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `422` | `INVALID_STATUS_TRANSITION` — holat bunga yo‘l qo‘ymaydi (yoqilgan/yoqilmagan) |

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-auth-totp-enable"></a>

### `POST /platform/auth/totp/enable` — Ikki bosqichli kirishni yoqish

> Ilovadagi kod sozlangan sirga mos kelsa yoqiladi; keyingi kirishdan `totpCode` majburiy.

**Qachon / qanday:** QR skanerlangach ilovadagi 6 raqam. 401 `AUTH_TOTP_INVALID` — «Kod noto‘g‘ri, ilovadagi joriy kodni kiriting». Muvaffaqiyatda `totpEnabled: true` — keyingi kirishda kod so‘raladi. Daqiqasiga 5 urinish.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformAdminDto`](schemas.md#platformadmindto) |
| Chegara | 5 ta / daqiqa (IP bo‘yicha), oshsa — 429 |

**So‘rov tanasi** — [`TotpCodeDto`](schemas.md#totpcodedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `code` | `string` | ✔ | Autentifikator ilovasidagi joriy 6 raqam — misol `123456` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_TOTP_INVALID` |
| `422` | `INVALID_STATUS_TRANSITION` — holat bunga yo‘l qo‘ymaydi (yoqilgan/yoqilmagan) |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-auth-totp-disable"></a>

### `POST /platform/auth/totp/disable` — Ikki bosqichli kirishni o‘chirish

> Ham ilovadagi kod bilan — o‘g‘irlangan sessiya himoyani olib tashlay olmaydi. Qurilma yo‘qolgan bo‘lsa — boshqa egasi `POST /platform/admins/:id/totp/reset`.

**Qachon / qanday:** Profil → «O‘chirish» → kod so‘raladi (parol emas). Qurilma yo‘q — boshqa egasi `POST /platform/admins/:id/totp/reset`.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformAdminDto`](schemas.md#platformadmindto) |
| Chegara | 5 ta / daqiqa (IP bo‘yicha), oshsa — 429 |

**So‘rov tanasi** — [`TotpCodeDto`](schemas.md#totpcodedto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `code` | `string` | ✔ | Autentifikator ilovasidagi joriy 6 raqam — misol `123456` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_TOTP_INVALID` |
| `422` | `INVALID_STATUS_TRANSITION` — holat bunga yo‘l qo‘ymaydi (yoqilgan/yoqilmagan) |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-auth-telegram-link"></a>

### `POST /platform/auth/telegram-link` — Telegram botga ulanish havolasi

> Mijozlar kabi shaxsiy havola: ochib Start bosilsa shu hisobga bog‘lanadi va egasi xabarlari (yangi do‘kon, onlayn to‘lov, o‘chirish so‘rovi) shu chatga keladi. Bir martalik, 7 kun.

**Qachon / qanday:** Profil → «Telegram» → «Ulash»: `link` ni QR qilib va «Telegramda ochish» tugmasi bilan ko‘rsating; egasi Start bosgach `GET /platform/auth/me` → `telegramLinked: true` (sahifani qayta so‘rang yoki tugma «Tekshirish»). 422 `RECIPIENT_UNREACHABLE` (`reason: no_channel`) — serverda bot sozlanmagan: tugmani yashiring.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `201` → [`TelegramLinkDto`](schemas.md#telegramlinkdto) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `422` | `RECIPIENT_UNREACHABLE` (`reason: no_channel`) — bot sozlanmagan |

[↑ Bo‘lim boshiga](#platform)

---

<a id="delete-platform-auth-telegram-link"></a>

### `DELETE /platform/auth/telegram-link` — Telegram ulanishini olib tashlash

> Xabarlar to‘xtaydi; qayta ulash — yangi havola.

**Qachon / qanday:** Profil → «Telegram» → «Uzish». 204; xabarlar to‘xtaydi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `204` — Ulanish olib tashlandi (bo‘lmasa ham 204) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-tenants"></a>

### `GET /platform/tenants` — Do‘konlar ro‘yxati

> Nom bo‘yicha qidiruv, holat/tarif filtri, muddati tugayotganlar; har qatorda ishlatilgan resurslar, administrator aloqasi, so‘nggi faollik.

**Qachon / qanday:** Do‘konlar jadvali: `q` — nom bo‘yicha, `status`, `plan`, `expiresWithinDays=7` — «tez orada tugaydi» filtri, `sort` (`-createdAt` sukut, `name`, `planExpiresAt`). Har qator: `usage`, `admin` (aloqa), `activity` (so‘nggi chek).

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `q` | query | `string` |  | Matn qidiruvi — maks. uzunlik `100` |
| `sort` | query | `id` \| `-id` \| `name` \| `-name` \| `createdAt` \| `-createdAt` \| `planExpiresAt` \| `-planExpiresAt` |  | sukut `"-createdAt"` |
| `status` | query | `active` \| `suspended` \| `blocked` \| `deleting` |  |  |
| `plan` | query | `free` \| `basic` \| `pro` |  |  |
| `expiresWithinDays` | query | `number` |  | Pullik tarifi shuncha kun ichida tugaydiganlar (muddati o‘tganlar ham kiradi); `0` — faqat o‘tganlar — min `0`, max `365` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-tenants"></a>

### `POST /platform/tenants` — Do‘kon ochish

> Ro‘yxatdan o‘tish bilan bir xil: do‘kon, sozlama, sukut ombor, tizim rollari va egasi (administrator) hisobi. Pullik boshlang‘ich tarif — `bonus` hisob-faktura (summa 0).

**Qachon / qanday:** «Do‘kon ochish» formasi — ro‘yxatdan o‘tish maydonlari + boshlang‘ich tarif (`plan`, `months`; pullik bo‘lsa `months` shart). Parolni egasi do‘kon egasiga o‘zi yetkazadi — API uni qaytarmaydi. Email do‘kon ichida noyob (boshqa do‘konda takror bo‘lishi mumkin).

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `201` → [`PlatformTenantDto`](schemas.md#platformtenantdto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CreateTenantDto`](schemas.md#createtenantdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `storeName` | `string` | ✔ | maks. uzunlik `120`, misol `Ali Qurilish Mollari` |
| `ownerName` | `string` | ✔ | maks. uzunlik `120`, misol `Ali Valiyev` |
| `phone` | `string` | ✔ | misol `+998901234567` |
| `email` | `string` | ✔ | misol `ali@dokon.uz` |
| `password` | `string` | ✔ | Kamida 8 belgi; ommabop parollar rad etiladi — misol `Qurilish2026!` |
| `plan` | `free` \| `basic` \| `pro` |  | Boshlang‘ich tarif; pullik bo‘lsa `months` shart (bonus sifatida yoziladi) — sukut `"free"` |
| `months` | `number` |  | Pullik tarif muddati (oy) — pullik tarifda SHART — min `1`, max `12` |
| `notes` | `string` |  | Egasi izohi — maks. uzunlik `500` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-tenants-id"></a>

### `GET /platform/tenants/:id` — Do‘kon kartasi

**Qachon / qanday:** Do‘kon kartasi: sarlavha, holat (`blockedReason` bilan), tarif va muddati, ko‘rsatkichlar, administrator aloqasi, izoh.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformTenantDto`](schemas.md#platformtenantdto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="patch-platform-tenants-id"></a>

### `PATCH /platform/tenants/:id` — Nom va egasi izohi

**Qachon / qanday:** Nom va egasi izohi; `notes: ""` — izoh o‘chadi. `If-Match` YO‘Q.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformTenantDto`](schemas.md#platformtenantdto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdateTenantDto`](schemas.md#updatetenantdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `120` |
| `notes` | `string` \| `null` |  | Bo‘sh satr — izoh o‘chadi — maks. uzunlik `500` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-tenants-id-block"></a>

### `POST /platform/tenants/:id/block` — Do‘konni bloklash

> Do‘kon faqat o‘qiydi (423 `TENANT_READ_ONLY`, `meta.status: blocked`), kirish ishlaydi. To‘lov blokni OCHMAYDI, do‘kon o‘zi olib tashlay olmaydi. Sabab — do‘kon administratoriga ko‘rinadi.

**Qachon / qanday:** Tasdiq oynasi + sabab (majburiy, do‘kon administratori ko‘radi). Do‘kondagi ochiq ilovalar `tenant.status` hodisasi bilan bannerni darhol ko‘rsatadi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformTenantDto`](schemas.md#platformtenantdto) |
| Realtime | `tenant.status` (do‘konga) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`BlockTenantDto`](schemas.md#blocktenantdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `reason` | `string` | ✔ | Sabab — do‘kon administratori `GET /tenants/current` da ko‘radi — maks. uzunlik `500` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-tenants-id-unblock"></a>

### `POST /platform/tenants/:id/unblock` — Blokdan chiqarish

> Tarif muddati o‘tgan bo‘lsa — `suspended`, aks holda `active`.

**Qachon / qanday:** Blok bo‘lmasa — 422 `INVALID_STATUS_TRANSITION`.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformTenantDto`](schemas.md#platformtenantdto) |
| Realtime | `tenant.status` (do‘konga) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `422` | `INVALID_STATUS_TRANSITION` — holat bunga yo‘l qo‘ymaydi |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-tenants-id-plan"></a>

### `POST /platform/tenants/:id/plan` — Tarif berish / qo‘lda to‘lov

> Pullik tarif — `paid` hisob-faktura (`provider`: `cash`, `transfer`, `bonus`) va tarif Payme/Click to‘lovi bilan bir xil qoidada uzayadi (o‘sha tarif — joriy muddat oxiridan, boshqa tarif — hozirdan; `suspended` ochiladi, `blocked` ochilmaydi). `free` — tarif darhol bepul, muddat o‘chadi.

**Qachon / qanday:** «Tarif / to‘lov» oynasi: tarif, oy, usul (`cash` naqd, `transfer` o‘tkazma, `bonus` bepul), summa (sukut — narx × oy; UI `PLAN_MONTHLY_PRICE` dan hisoblab ko‘rsatsin, egasi o‘zgartira oladi), izoh (kvitansiya). `free` — faqat tarif, qolgani yuborilmaydi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformTenantDto`](schemas.md#platformtenantdto) |
| Realtime | `tenant.status` (do‘konga) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`GrantPlanDto`](schemas.md#grantplandto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `plan` | `free` \| `basic` \| `pro` | ✔ |  |
| `months` | `number` |  | Pullik tarifda SHART — min `1`, max `12` |
| `provider` | `cash` \| `transfer` \| `bonus` |  | Pullik tarifda SHART: `cash` naqd, `transfer` o‘tkazma, `bonus` — bepul muddat (summa 0) |
| `amount` | `number` |  | Olingan summa (so‘m). Berilmasa — tarif narxi × oy; `bonus` — 0 |
| `note` | `string` |  | Kvitansiya raqami, kelishuv … — maks. uzunlik `500` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-tenants-id-delete"></a>

### `POST /platform/tenants/:id/delete` — Do‘konni o‘chirish (30 kun muhlat)

> Faqat egasi (operator — 403). Muhlatda faqat o‘qish; keyin ma’lumot va fayllar to‘liq o‘chadi. Muhlat ichida `restore` qaytaradi.

**Qachon / qanday:** Tasdiq oynasi («30 kundan keyin butunlay o‘chadi»). Muhlatdagi do‘kon — 422.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md). Faqat `owner` roli — `operator` uchun 403 `PERMISSION_DENIED` |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformTenantDto`](schemas.md#platformtenantdto) |
| Realtime | `tenant.status` (do‘konga) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `422` | `INVALID_STATUS_TRANSITION` — holat bunga yo‘l qo‘ymaydi |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-tenants-id-restore"></a>

### `POST /platform/tenants/:id/restore` — O‘chirishni bekor qilish

> Faqat egasi (operator — 403). Qaytadigan holat: blok bo‘lsa `blocked`, tarif muddati o‘tgan bo‘lsa `suspended`, aks holda `active`.

**Qachon / qanday:** Muhlat ichida qaytarish; muhlatda bo‘lmasa — 422.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md). Faqat `owner` roli — `operator` uchun 403 `PERMISSION_DENIED` |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformTenantDto`](schemas.md#platformtenantdto) |
| Realtime | `tenant.status` (do‘konga) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `422` | `INVALID_STATUS_TRANSITION` — holat bunga yo‘l qo‘ymaydi |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-tenants-id-users"></a>

### `GET /platform/tenants/:id/users` — Do‘kon kirish hisoblari

> Qo‘llab-quvvatlash: kim kira oladi, oxirgi kirish; parolni tiklash uchun `userId`.

**Qachon / qanday:** Do‘kon kartasidagi «Hisoblar» jadvali (parolni tiklash tugmasi shu yerda).

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformTenantUserDto`](schemas.md#platformtenantuserdto)[] |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-tenants-id-users-userid-reset-password"></a>

### `POST /platform/tenants/:id/users/:userId/reset-password` — Do‘kon hisobiga yangi parol

> Foydalanuvchining barcha sessiyalari yopiladi; do‘kon jurnalida «Platforma» yozuvi qoladi.

**Qachon / qanday:** Yangi parol oynasi (kamida 8 belgi, ommabop parol — 400). 204 — tana yo‘q. Parolni egasi do‘kon xodimiga o‘zi yetkazadi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `204` — Parol o‘zgartirildi |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |
| `userId` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`ResetUserPasswordDto`](schemas.md#resetuserpassworddto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `password` | `string` | ✔ | Yangi parol (kamida 8 belgi); foydalanuvchining barcha sessiyalari yopiladi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `404` | `NOT_FOUND` — do‘kon yoki hisob |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-tenants-id-invoices"></a>

### `GET /platform/tenants/:id/invoices` — Do‘kon hisob-fakturalari

> Onlayn (Payme/Click) va qo‘lda yozilgan to‘lovlar — bitta ro‘yxat.

**Qachon / qanday:** Do‘kon kartasidagi «To‘lovlar» jadvali — onlayn va qo‘lda yozilganlar birga.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `tenantId` | query | `string` (uuid) |  | Bitta do‘kon |
| `state` | query | `created` \| `pending` \| `paid` \| `cancelled` |  |  |
| `provider` | query | `payme` \| `click` \| `cash` \| `transfer` \| `bonus` |  |  |
| `dateFrom` | query | `string` |  | Yaratilgan sana, Toshkent kuni (shu kundan) — misol `2026-10-01` |
| `dateTo` | query | `string` |  | Shu kungacha (kiradi) — misol `2026-10-31` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-requests"></a>

### `GET /platform/requests` — Do‘kon murojaatlari

> Yopilmaganlar birinchi, keyin so‘nggi xabar bo‘yicha. `status=open` — javob kutayotganlar (menyu belgisi — `GET /platform/stats` → `openRequests`); `tenantId` — do‘kon kartasi.

**Qachon / qanday:** «Murojaatlar» sahifasi: yopilmaganlar birinchi; `status=open` — javob kutayotganlar, `type`, `tenantId` (do‘kon kartasidagi bo‘lim). Qatorda do‘kon (holati bilan), kim yozgan, telefon, birinchi xabar qisqacha, xabarlar soni.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `tenantId` | query | `string` (uuid) |  | Bitta do‘kon murojaatlari (do‘kon kartasi) |
| `status` | query | `open` \| `answered` \| `closed` |  | `open` — javob kutayotganlar (sukut: hammasi, yopilmaganlar birinchi) |
| `type` | query | `unblock` \| `billing` \| `other` |  |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-requests-id"></a>

### `GET /platform/requests/:id` — Murojaat va xabarlari

**Qachon / qanday:** Murojaat oynasi: barcha xabarlar (`author`: `store` / `platform`), javob va yopish tugmalari.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformRequestDetailDto`](schemas.md#platformrequestdetaildto) |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-requests-id-reply"></a>

### `POST /platform/requests/:id/reply` — Javob yozish

> Holat `answered`; do‘kon administratori javobni bannerda va murojaat oynasida ko‘radi (`tenant.request` hodisasi). Blokni olish — alohida `POST /platform/tenants/:id/unblock`.

**Qachon / qanday:** Javob matni (1–1000 belgi) → `answered`; do‘kon administratori bannerda ko‘radi. Blokdan chiqarish — alohida tugma (`POST /platform/tenants/:id/unblock`). Yopilganiga — 422.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformRequestDetailDto`](schemas.md#platformrequestdetaildto) |
| Realtime | `tenant.request` (do‘konga) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`ReplyRequestDto`](schemas.md#replyrequestdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `message` | `string` | ✔ | maks. uzunlik `1000`, misol `To‘lov keldi, blokni olib tashladik` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `404` | `NOT_FOUND` |
| `422` | `INVALID_STATUS_TRANSITION` — murojaat allaqachon yopilgan |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-requests-id-close"></a>

### `POST /platform/requests/:id/close` — Murojaatni yopish

> Ixtiyoriy yakuniy javob bilan. Yopilganiga do‘kon yozolmaydi — kerak bo‘lsa yangisini ochadi.

**Qachon / qanday:** «Yopish» (ixtiyoriy yakuniy javob bilan) → `closed`; do‘kon unga yozolmaydi, yangisini ochadi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformRequestDetailDto`](schemas.md#platformrequestdetaildto) |
| Realtime | `tenant.request` (do‘konga) (COMMIT’dan keyin, do‘konning barcha ulanishlariga) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`CloseRequestDto`](schemas.md#closerequestdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `message` | `string` |  | Yakuniy javob (ixtiyoriy) — do‘kon ko‘radi — maks. uzunlik `1000` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `404` | `NOT_FOUND` |
| `422` | `INVALID_STATUS_TRANSITION` — murojaat allaqachon yopilgan |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-admins"></a>

### `GET /platform/admins` — Egasi hisoblari ro‘yxati

> Egasi va operatorlar: rol, faollik, ikki bosqichli kirish va Telegram holati, oxirgi kirish.

**Qachon / qanday:** «Hisoblar» sahifasi (faqat egasi): jadval — nom, email, rol, faol, TOTP, Telegram, oxirgi kirish.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md). Faqat `owner` roli — `operator` uchun 403 `PERMISSION_DENIED` |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformAdminDto`](schemas.md#platformadmindto)[] |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-admins"></a>

### `POST /platform/admins` — Hisob ochish

> Operator yoki yana bir egasi. Parolni siz aytasiz; u keyin ikki bosqichli kirishni o‘zi yoqadi.

**Qachon / qanday:** «Hisob ochish» oynasi: email, nom, parol (kamida 8 belgi), rol. 409 `ALREADY_EXISTS` — email band. Parolni operatorga egasi o‘zi aytadi; operator keyin TOTP’ni o‘zi yoqadi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md). Faqat `owner` roli — `operator` uchun 403 `PERMISSION_DENIED` |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `201` → [`PlatformAdminDto`](schemas.md#platformadmindto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`CreatePlatformAdminDto`](schemas.md#createplatformadmindto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `email` | `string` | ✔ | misol `operator@workspaces.uz` |
| `name` | `string` | ✔ | maks. uzunlik `120`, misol `Dilnoza` |
| `password` | `string` | ✔ | Kamida 8 belgi; ommabop parollar rad etiladi. Operatorga birinchi kirishda aytiladi |
| `role` | `owner` \| `operator` | ✔ | `operator` — do‘konni o‘chira olmaydi, hisob va sozlamani boshqarmaydi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `409` | `ALREADY_EXISTS` — bu email bilan hisob bor |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="patch-platform-admins-id"></a>

### `PATCH /platform/admins/:id` — Nom, rol, faollik

> `isActive: false` — hisob kira olmaydi, sessiyalari yopiladi. O‘z rolini o‘zgartirish yoki o‘zini faolsizlantirish — 422.

**Qachon / qanday:** Qator tahriri: nom, rol, faollik (faolsiz — kira olmaydi, sessiyalari yopiladi). O‘z qatorida rol va faollik maydonlarini o‘chiq ko‘rsating (422 `SELF_ROLE_CHANGE` / `SELF_DELETE`).

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md). Faqat `owner` roli — `operator` uchun 403 `PERMISSION_DENIED` |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformAdminDto`](schemas.md#platformadmindto) |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`UpdatePlatformAdminDto`](schemas.md#updateplatformadmindto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `120` |
| `role` | `owner` \| `operator` |  | O‘z rolini o‘zgartirib bo‘lmaydi (422 `SELF_ROLE_CHANGE`) |
| `isActive` | `boolean` |  | `false` — kira olmaydi, sessiyalari yopiladi. O‘zini faolsizlantirib bo‘lmaydi (422 `SELF_DELETE`) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `404` | `NOT_FOUND` |
| `422` | `SELF_ROLE_CHANGE` \| `SELF_DELETE` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-admins-id-reset-password"></a>

### `POST /platform/admins/:id/reset-password` — Hisobga yangi parol

> Barcha sessiyalari yopiladi. O‘z hisobingiz uchun ham ishlaydi (joriy sessiya ham yopiladi — qayta kiring).

**Qachon / qanday:** «Parolni tiklash» oynasi (yangi parol). 204; hisobning barcha sessiyalari yopiladi — o‘ziniki bo‘lsa qayta kiradi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md). Faqat `owner` roli — `operator` uchun 403 `PERMISSION_DENIED` |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `204` — Parol o‘zgartirildi |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**So‘rov tanasi** — [`ResetUserPasswordDto`](schemas.md#resetuserpassworddto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `password` | `string` | ✔ | Yangi parol (kamida 8 belgi); foydalanuvchining barcha sessiyalari yopiladi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `404` | `NOT_FOUND` |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="post-platform-admins-id-totp-reset"></a>

### `POST /platform/admins/:id/totp/reset` — Ikki bosqichli kirishni olib tashlash

> Qurilma yo‘qolganda: hisob yana faqat parol bilan kiradi va qayta sozlaydi.

**Qachon / qanday:** «TOTP’ni olib tashlash» (qurilma yo‘qolganda), tasdiq oynasi bilan. 204; 422 — yoqilmagan.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md). Faqat `owner` roli — `operator` uchun 403 `PERMISSION_DENIED` |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `204` — Olib tashlandi |
| Audit jurnali | ha |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `id` | yo‘l | `string` | ✔ |  |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |
| `422` | `INVALID_STATUS_TRANSITION` — yoqilmagan |

Umumiy: 400 `VALIDATION_FAILED`; 404 `NOT_FOUND`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-stats"></a>

### `GET /platform/stats` — Boshqaruv paneli

> Do‘konlar holat va tarif bo‘yicha, shu oyda ochilganlar, 7 kunda tugaydiganlar, muddati o‘tganlar; oylik tushum (12 oy).

**Qachon / qanday:** Bosh sahifa kartalari (holat/tarif bo‘yicha do‘konlar, tugayotganlar), 12 oylik tushum grafigi, `openRequests` — menyudagi «Murojaatlar» belgisi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformStatsDto`](schemas.md#platformstatsdto) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-invoices"></a>

### `GET /platform/invoices` — Barcha do‘konlar hisob-fakturalari

> Holat, provayder (onlayn yoki qo‘lda), sana oralig‘i va do‘kon bo‘yicha filtr; eng yangisi birinchi.

**Qachon / qanday:** «To‘lovlar» sahifasi: `state`, `provider`, `dateFrom`/`dateTo` (Toshkent kuni), `tenantId`; eng yangisi birinchi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `tenantId` | query | `string` (uuid) |  | Bitta do‘kon |
| `state` | query | `created` \| `pending` \| `paid` \| `cancelled` |  |  |
| `provider` | query | `payme` \| `click` \| `cash` \| `transfer` \| `bonus` |  |  |
| `dateFrom` | query | `string` |  | Yaratilgan sana, Toshkent kuni (shu kundan) — misol `2026-10-01` |
| `dateTo` | query | `string` |  | Shu kungacha (kiradi) — misol `2026-10-31` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-audit"></a>

### `GET /platform/audit` — Egasi amallari jurnali

> Kim, qachon, qaysi do‘konga nima qildi (blok, tarif, parol, ochish, o‘chirish); faqat qo‘shiladi.

**Qachon / qanday:** «Jurnal» sahifasi: `group` (`tenant`, `user`, `platform`), `tenantId`; `diff` — amal tafsiloti (sabab, tarif, summa).

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → `application/json` |

**Parametrlar**

| Nomi | Joyi | Tip | Majburiy | Izoh |
|---|---|---|:-:|---|
| `page` | query | `number` |  | min `1`, sukut `1` |
| `pageSize` | query | `number` |  | min `1`, max `200`, sukut `20` |
| `tenantId` | query | `string` (uuid) |  | Bitta do‘kon tarixi |
| `group` | query | `string` |  | Amal guruhi: `tenant` (`tenant.block`, `tenant.plan` …), `user`, `platform` — misol `tenant` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="get-platform-settings"></a>

### `GET /platform/settings` — Platforma sozlamasi

> Ro‘yxatdan o‘tish ochiq yoki yopiq; kim va qachon o‘zgartirgan.

**Qachon / qanday:** «Sozlamalar» sahifasi: ro‘yxatdan o‘tish ochiq/yopiq, egasining aloqasi (`support` — do‘kon ilovasida bannerda ko‘rinadi), kim va qachon o‘zgartirgan.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md) |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformSettingsDto`](schemas.md#platformsettingsdto) |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

[↑ Bo‘lim boshiga](#platform)

---

<a id="patch-platform-settings"></a>

### `PATCH /platform/settings` — Sozlamani o‘zgartirish

> Faqat egasi (operator — 403). `registrationMode: closed` — `POST /tenants/register` darhol 403 `REGISTRATION_CLOSED`, do‘konni faqat panel ochadi. Qayta ishga tushirish shart emas.

**Qachon / qanday:** Faqat egasi, faqat yuborilgan maydonlar. `registrationMode: closed` — do‘kon ilovasida «Do‘kon ochish» yo‘qoladi va `POST /tenants/register` 403 beradi; do‘konni faqat panel ochadi. `support { phone, telegram, hours }` — `""` o‘chiradi. Darhol kuchga kiradi.

| | |
|---|---|
| Huquq | platforma egasi tokeni (`POST /platform/auth/login`); do‘kon tokeni yoki tokensiz — 401 `AUTH_INVALID_CREDENTIALS`. Do‘kon ilovasi chaqirmaydi — [egasi paneli qo‘llanmasi](owner-panel.md). Faqat `owner` roli — `operator` uchun 403 `PERMISSION_DENIED` |
| Sarlavhalar | `Authorization: Bearer <egasi accessToken>` |
| Javob | `200` → [`PlatformSettingsDto`](schemas.md#platformsettingsdto) |
| Audit jurnali | ha |

**So‘rov tanasi** — [`UpdatePlatformSettingsDto`](schemas.md#updateplatformsettingsdto)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `registrationMode` | `open` \| `closed` |  |  |
| `support` | [`UpdatePlatformSupportDto`](schemas.md#updateplatformsupportdto) |  | Aloqa: faqat yuborilgan maydonlar o‘zgaradi |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `401` | `AUTH_INVALID_CREDENTIALS` — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni |

Umumiy: 400 `VALIDATION_FAILED`.

[↑ Bo‘lim boshiga](#platform)

---

<a id="health"></a>

## Sog‘liq tekshiruvi

Infratuzilma uchun (yuk balanslagich, monitoring). Frontend odatda chaqirmaydi.

| Amal | Yo‘l | Nima uchun | Huquq |
|---|---|---|---|
| `GET` | [`/health/live`](#get-health-live) 🔓 | Jarayon tirikmi | ochiq |
| `GET` | [`/health/ready`](#get-health-ready) 🔓 | Trafik qabul qilishga tayyormi | ochiq |

<a id="get-health-live"></a>

### `GET /health/live` — Jarayon tirikmi

> Hech qanday bog‘liqlikni tekshirmaydi. Orkestrator shu bo‘yicha konteynerni qayta ishga tushiradi — baza tushganda qayta ishga tushirish yordam bermaydi, shuning uchun u bu yerda tekshirilmaydi.

**Qachon / qanday:** Jarayon tirikmi (bog‘liqliklarsiz).

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Javob | `200` → `{"status": "ok", "uptimeSec": 42}` |

[↑ Bo‘lim boshiga](#health)

---

<a id="get-health-ready"></a>

### `GET /health/ready` — Trafik qabul qilishga tayyormi

> Baza va obyekt saqlagich tekshiriladi. Yuk balanslagich shu bo‘yicha trafik yuboradi.

**Qachon / qanday:** Baza va obyekt saqlagich tayyormi — 503 bo‘lsa trafik yuborilmaydi.

| | |
|---|---|
| Huquq | ochiq — token shart emas |
| Javob | `200` → `{"status": "ok", "uptimeSec": 42, "checks": [{"name": "database", "ok": true, "ms": 3}]}` |

**Xatolar**

| Status | Kod — qachon |
|---|---|
| `503` | Bog‘liqliklardan biri javob bermayapti |

[↑ Bo‘lim boshiga](#health)

---
