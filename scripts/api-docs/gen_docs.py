"""docs/api/endpoints.md va docs/api/schemas.md generatori (`npm run docs:api`).

Manba: apps/api/openapi.json (summary, description, DTO, xato kodlari) +
controllerlar (`routes.py`: huquq, idempotentlik, If-Match, audit, ...).
Qo'lda yozilgan qism — GROUPS (bo'lim kirish matni) va NOTES (endpoint
bo'yicha "qachon/qanday ishlatiladi"): API xulqi o'zgarsa, shu yerda ham.
README.md qo'lda yoziladi — bu skript unga tegmaydi.

Avval openapi.json yangilanadi: `npm run build -w @crm/api && npm run openapi -w @crm/api`.
"""
import json
import re
from collections import defaultdict
from pathlib import Path

import routes as route_meta

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs' / 'api'

spec = json.load(open(ROOT / 'apps' / 'api' / 'openapi.json', encoding='utf-8'))
S = spec['components']['schemas']
routes = route_meta.collect(ROOT / 'apps' / 'api')

PREFIX = '/api/v1'


def norm(path: str) -> str:
    return re.sub(r'\{(\w+)\}', r':\1', path)


def short(path: str) -> str:
    return path[len(PREFIX):] if path.startswith(PREFIX) else path


ROUTE = {}
for r in routes:
    p = r['path']
    if p.startswith(f'{PREFIX}/health'):
        p = p[len(PREFIX):]
    ROUTE[(r['method'], p)] = r

# ───────────────────────────── Rollar matritsasi (packages/shared/src/permissions.ts)
ALL = ['view', 'create', 'edit', 'delete']
VIEW = ['view']
NO_DELETE = ['view', 'create', 'edit']
MATRIX = {
    'manager': {'products': ALL, 'sales': ALL, 'suppliers': ALL, 'customers': ALL, 'employees': NO_DELETE,
                'settings': ALL, 'expenses': ALL, 'finance': ALL, 'deliveries': ALL, 'quotes': ALL},
    'sotuvchi': {'products': VIEW, 'sales': NO_DELETE, 'customers': ALL, 'suppliers': VIEW, 'finance': NO_DELETE,
                 'deliveries': NO_DELETE, 'quotes': NO_DELETE},
    'omborchi': {'products': ALL, 'suppliers': ALL, 'sales': VIEW, 'customers': VIEW, 'deliveries': VIEW},
}


def roles_with(resource: str, action: str) -> list[str]:
    return ['admin'] + [role for role, m in MATRIX.items() if action in m.get(resource, [])]


ADMIN_ONLY = 'faqat `admin` (servisda tekshiriladi; boshqa rol — 403 `PERMISSION_DENIED`)'
ANY_USER = 'har qanday kirgan foydalanuvchi'
FILE_PERM = ('fayl turiga qarab (servisda): `product_image`, `import` → `products`; `avatar` → `employees`; '
             '`document` → `sales`; `export` → `finance`; `tenant_backup` → `settings`. '
             'Yuklash/tasdiqlash — `create`, o‘qish — `view`, o‘chirish — `delete`')
EXPORT_PERM = ('ro‘yxatga qarab `view` (servisda): `products`, `stock-movements` → `products`; `clients` → `customers`; '
               '`sales` → `sales`; `expenses` → `expenses`; `audit` → `users` (amalda faqat admin)')


def permission_text(method: str, path: str, route: dict | None) -> str:
    if route and route.get('public'):
        return 'ochiq — token shart emas'
    perm = route and route.get('perm')
    if perm:
        resource, action = perm.split(':')
        return f'`{resource}:{action}` — {", ".join(roles_with(resource, action))}'
    p = short(path)
    if p.startswith(('/tenants/current', '/billing/invoices', '/backup', '/migration')):
        return ADMIN_ONLY
    if p.startswith('/files'):
        return FILE_PERM
    if p.startswith('/exports/jobs'):
        return 'faqat eksportni so‘ragan foydalanuvchi (boshqasiga — 404)'
    if p.startswith('/exports'):
        return EXPORT_PERM
    return ANY_USER


# ───────────────────────────── Realtime: qaysi amal qaysi hodisani yuboradi
EVENTS = {
    ('POST', '/sales'): '`sale.created`',
    ('POST', '/sales/:id/return'): '`sale.created` (qaytarish hujjati)',
    ('POST', '/sales/:id/cancel'): '`sale.cancelled`',
    ('POST', '/quotes/:id/convert'): '`sale.created`',
    ('POST', '/stock/intake'): '`stock.changed`',
    ('POST', '/stock/writeoff'): '`stock.changed`',
    ('POST', '/stock/adjust'): '`stock.changed` (farq bo‘lsa)',
    ('POST', '/stock/transfer'): '`stock.changed` — har ombor uchun alohida (2 ta)',
    ('POST', '/cash/shifts/open'): '`shift.opened`',
    ('POST', '/cash/shifts/close'): '`shift.closed`',
    ('POST', '/debts/payments'): '`debt.paid`',
    ('POST', '/deliveries/:id/status'): '`delivery.status`',
    ('POST', '/purchase-orders/:id/receive'): '`po.received`',
}

# ───────────────────────────── Bo'limlar tartibi va kirish matni
GROUPS = [
    ('auth', 'Autentifikatsiya va ro‘yxatdan o‘tish', [r'^/auth', r'^/tenants/register'],
     'Kirish, tokenni yangilash, chiqish, joriy foydalanuvchi, parol va yangi do‘kon ochish. '
     'To‘liq oqim (token qayerda saqlanadi, 401 da nima qilinadi, bir nechta tab) — '
     '[README → Autentifikatsiya](README.md#auth).'),
    ('account', 'Do‘kon hisobi: tarif, holat, o‘chirish', [r'^/tenants/current'],
     'Sozlamalar → «Tarif va hisob» sahifasi. Faqat administrator. Holatlar va cheklovlar — '
     '[README → Do‘kon holati va tarif](README.md#tenant).'),
    ('billing', 'Obuna to‘lovi (Payme, Click)', [r'^/billing'],
     'Tarifni to‘lash: hisob-faktura yaratiladi, foydalanuvchi Payme/Click sahifasida to‘laydi, provayder '
     'serverimizga webhook yuboradi va tarif uzayadi. Frontend faqat `POST/GET /billing/invoices` ni chaqiradi.'),
    ('settings', 'Do‘kon sozlamalari', [r'^/settings'],
     'Bitta obyekt (do‘kon nomi, QQS, chegirma chegarasi, ulgurji/bonus rejimi, chek matnlari). '
     'Ilova ochilganda bir marta o‘qiladi — POS hisobi shunga tayanadi.'),
    ('warehouses', 'Omborlar', [r'^/warehouses'],
     'Omborlar ro‘yxati va kartalari. O‘chirish yo‘q — arxivlash. Sukut (`isDefault`) ombor arxivlanmaydi. '
     'Tarif ombor sonini cheklaydi (402).'),
    ('categories', 'Mahsulot kategoriyalari', [r'^/categories'],
     'Katalog filtri va mahsulot formasidagi tanlov. `sortOrder` — ko‘rsatish tartibi.'),
    ('products', 'Mahsulotlar', [r'^/products'],
     'Katalog, mahsulot kartasi, POS qidiruvi, CSV import, ommaviy narx. Qoldiq mahsulot formasida '
     'O‘ZGARTIRILMAYDI — faqat ombor amallari (`/stock/*`), kirim buyurtmasi, sotuv orqali. '
     'Birliklar va narxlar qoidasi — [README → Mahsulot va birliklar](README.md#units).'),
    ('stock', 'Ombor amallari', [r'^/stock'],
     'Kirim, hisobdan chiqarish, inventarizatsiya, omborlar orasida ko‘chirish, harakatlar jurnali, buyurtma taklifi. '
     'Barcha yozuvchi amallar idempotent (`Idempotency-Key` majburiy), miqdor — mahsulotning ASOSIY birligida.'),
    ('clients', 'Mijozlar', [r'^/clients'],
     'Mijozlar sahifasi, mijoz kartasi, POS’da mijoz tanlash (bonus, nasiya). Telefon saqlashda '
     'normallashtiriladi (faqat raqamlar va boshidagi `+`).'),
    ('suppliers', 'Ta’minotchilar', [r'^/suppliers'],
     'Ta’minotchilar ro‘yxati va kartasi (buyurtmalar, qarzimiz, to‘lovlar). Kreditorlik faqat KELGAN tovar bo‘yicha. '
     'Sotuvchi rolida pul maydonlari (`debt`, `totalPurchased`, buyurtma summalari, to‘lov `amount`) javobda YO‘Q — '
     '[README → Yashirin maydonlar](README.md#hidden).'),
    ('employees', 'Xodimlar', [r'^/employees'],
     'Xodim — shaxs (ism, lavozim, telefon, maosh, holat). Tizimga kirish hisobi alohida (`/users`) va '
     'xodimga bog‘lanadi: ism/lavozim foydalanuvchida takrorlanmaydi.'),
    ('users', 'Foydalanuvchilar (kirish hisoblari)', [r'^/users'],
     'Faqat administrator (`users:*`). Email + parol + rol, mavjud xodimga bog‘lanadi. '
     'Tarif foydalanuvchi sonini cheklaydi (402).'),
    ('sales', 'Sotuvlar (chek, qaytarish, bekor qilish)', [r'^/sales'],
     'POS va cheklar jurnali. Chek BITTA so‘rov bilan yoziladi, summalarni server qayta hisoblaydi. '
     'Qoidalar (QQS, chegirma, bonus, yaxlitlash, nasiya, qaytim) — [README → Kassa (POS)](README.md#pos).'),
    ('cash', 'Kassa: smena va naqd harakatlar', [r'^/cash'],
     'Smena ochish/yopish, joriy kassa balansi, naqd kirim/chiqim, X/Z hisobot. Sotuv, qaytarish, naqd '
     'to‘lovlar faqat OCHIQ smenada (aks holda 423 `SHIFT_REQUIRED`).'),
    ('debts', 'Qarzlar (nasiya)', [r'^/debts'],
     'Qarzdorlar (mijoz yoki chek bo‘yicha), eskirish (30/60/60+), qarz to‘lovlari. Qarz — nasiya chekning '
     '`outstanding` qiymati, bazada hisoblanadi.'),
    ('quotes', 'Takliflar (smeta)', [r'^/quotes'],
     'Mijozga narx taklifi: qoldiq band qilinmaydi, kassaga ta’sir yo‘q. Qabul qilinsa — sotuvga aylantiriladi (bir marta).'),
    ('purchase-orders', 'Kirim buyurtmalari (ta’minotchidan xarid)', [r'^/purchase-orders'],
     'Buyurtma → qabul (to‘liq/qisman, kirim harakatlari va o‘rtacha tannarx) → ta’minotchiga to‘lov. '
     'Holatlar: `ordered` → `partial` → `received`; `cancelled` faqat hech narsa kelmagan buyurtmada. '
     'Sotuvchi rolida summalar (`total`, `receivedValue`, `paid`, `outstanding`, qator `cost`) javobda YO‘Q — '
     'bitta qatorli buyurtmada summa ÷ miqdor = tannarx.'),
    ('deliveries', 'Yetkazib berish', [r'^/deliveries'],
     'Yetkazishlar ro‘yxati, haydovchi ko‘rinishi (`/my`), marshrut varaqasi. Holat faqat oldinga: '
     '`pending` → `on_way` → `delivered`; faol holatdan `cancelled`.'),
    ('expenses', 'Xarajatlar va takrorlanuvchi shablonlar', [r'^/expenses', r'^/expense-templates'],
     'Xarajatlar jurnali va kartalari. Naqd xarajat kassadan chiqadi (ochiq smena shart). Shablonlar '
     '(ijara, oylik) har kuni 00:05 da avtomatik xarajatga aylanadi.'),
    ('messages', 'Xabarlar (SMS)', [r'^/messages'],
     'Mijozlarga SMS: qabul qiluvchilar serverda hisoblanadi, yuborish fonda. Kunlik chegara tarifga bog‘liq.'),
    ('reports', 'Hisobotlar', [r'^/dashboard', r'^/reports', r'^/analytics'],
     'Bosh sahifa (dashboard), foyda/zarar (P&L), analitika. Barcha raqamlar SERVERDA hisoblanadi — '
     'brauzerda yig‘indi qilinmaydi. Tannarx/foyda maydonlari rolga qarab yashiriladi.'),
    ('audit', 'Audit jurnali', [r'^/audit'],
     'Kim, qachon, nima qildi — faqat o‘qish. Faqat administrator (`users:view`).'),
    ('files', 'Fayllar (rasm, hujjat)', [r'^/files'],
     'Fayl serverdan O‘TMAYDI: server ruxsat beradi (presigned PUT), brauzer to‘g‘ridan-to‘g‘ri S3/MinIO ga '
     'yuklaydi, keyin server tasdiqlaydi. To‘liq oqim — [README → Fayl yuklash](README.md#files).'),
    ('exports', 'Eksport (CSV/JSON)', [r'^/exports'],
     '5000 qatorgacha — fayl darhol javobda; ko‘p bo‘lsa — fon ishi (202) va keyin yuklab olish havolasi.'),
    ('backup', 'Do‘kon zaxirasi', [r'^/backup'],
     'Butun do‘kon ma’lumoti bitta JSON (gzip) fayl — yuklab olish havolasi 1 soat amal qiladi. Faqat administrator.'),
    ('migration', 'Migratsiya (brauzerdagi eski ma’lumotni serverga ko‘chirish)', [r'^/migration'],
     'Eski (localStorage) versiyadan ko‘chirish sehrgari uchun: avval tekshirish (dry-run), keyin import. '
     'Faqat administrator. Sehrgar talablari — [README → Migratsiya](README.md#migration).'),
    ('health', 'Sog‘liq tekshiruvi', [r'^/health'],
     'Infratuzilma uchun (yuk balanslagich, monitoring). Frontend odatda chaqirmaydi.'),
]


def group_of(path: str) -> str:
    p = short(path)
    for key, _title, patterns, _intro in GROUPS:
        if any(re.match(pat, p) for pat in patterns):
            return key
    raise SystemExit(f'Bo‘lim topilmadi: {path}')


# ───────────────────────────── Endpoint bo'yicha qo'lda yozilgan izohlar
NOTES = {
    # auth
    ('POST', '/auth/login'):
        'Kirish sahifasi. `accessToken` ni faqat XOTIRADA saqlang (localStorage/sessionStorage emas), '
        '`expiresIn` — soniya (900). `refresh_token` httpOnly cookie’sini brauzer o‘zi saqlaydi — so‘rov '
        '`credentials: "include"` bilan yuborilsin. 409 `AUTH_TENANT_REQUIRED` (bir xil email VA parol bir nechta do‘konda mos kelsa): `errors[].meta` da '
        '`{tenantId, tenantName}` ro‘yxati — do‘kon tanlatib, xuddi shu email/parol + `tenantId` bilan qayta yuboring. '
        '423 `AUTH_ACCOUNT_LOCKED` — xodim ishdan bo‘shatilgan. To‘xtatilgan/o‘chirilayotgan do‘konga kirish MUMKIN: '
        '`user.tenant.status` (`suspended`/`deleting`) bo‘yicha faqat-o‘qish bannerini ko‘rsating. '
        'Daqiqasiga 10 urinish (IP bo‘yicha), oshsa — 429.',
    ('POST', '/auth/refresh'):
        'Tanasi yo‘q — faqat cookie. Qachon: (1) ilova ochilganda/sahifa yangilanganda (xotirada token yo‘q); '
        '(2) himoyalangan so‘rov 401 qaytarganda — keyin asl so‘rov bir marta qayta yuboriladi. '
        'Bir vaqtda FAQAT BITTA refresh (bir nechta tab bo‘lsa ham — `navigator.locks`): rotatsiya sabab '
        'ikkinchi parallel so‘rov eski cookie bilan boradi → `AUTH_TOKEN_REUSE` → foydalanuvchining BARCHA '
        'sessiyalari yopiladi. Xatolar: `AUTH_INVALID_REFRESH` — cookie yo‘q/noma’lum/muddati o‘tgan; bekor qilingan HAR QANDAY '
        'cookie (logout-all, parol o‘zgarishi, admin tiklashi, parallel refresh) — `AUTH_TOKEN_REUSE`; 423 — xodim bo‘shatilgan. '
        'Hammasida — «Sessiya tugadi», login sahifasi. Javobdagi `user.tenant.status` — do‘kon holati (banner uchun).',
    ('POST', '/auth/logout'):
        '«Chiqish» tugmasi: cookie’dagi sessiya bekor qilinadi, cookie o‘chiriladi. Xotiradagi tokenni, '
        'so‘rovlar keshini tozalang va socket’ni uzing. Token yubormasa ham bo‘ladi.',
    ('POST', '/auth/logout-all'):
        'Profil → «Barcha qurilmalardan chiqish». Qaytgan `revoked` — yopilgan sessiyalar soni. Boshqa '
        'qurilmalardagi access token muddati tugaguncha (≤ 15 daqiqa) ishlashi mumkin. Shu qurilmada darhol login sahifasiga o‘ting.',
    ('GET', '/auth/me'):
        'Joriy foydalanuvchi (ism, lavozim, rol, do‘kon). Login/refresh javobida ham xuddi shu `user` bor — '
        'ilova ochilganda alohida chaqirish shart emas. Huquqlar `role` dan hisoblanadi (README → Rollar).',
    ('POST', '/auth/change-password'):
        'Profil → «Parolni o‘zgartirish». Muvaffaqiyatda shu qurilma ham qo‘shilgan BARCHA sessiyalar yopiladi '
        'va cookie o‘chiriladi → foydalanuvchini login sahifasiga yuboring. Joriy parol xato — 401, kuchsiz yangi parol — 400.',
    ('POST', '/tenants/register'):
        'Ro‘yxatdan o‘tish sahifasi. Javob login bilan bir xil — foydalanuvchi darhol kirgan (admin). Keyin '
        '`GET /settings` → `onboarded: false` bo‘lsa dastlabki sozlash sehrgarini ko‘rsating, oxirida '
        '`PATCH /settings {"onboarded": true}`. IP bo‘yicha soatiga 5 ta. Bir email bilan bir nechta do‘kon ochish '
        'mumkin (email do‘kon ichida noyob). Login’da do‘kon tanlash (`AUTH_TENANT_REQUIRED`) faqat email VA parol bir nechta '
        'do‘konda mos kelsa chiqadi; parollar farqli bo‘lsa — mos kelgan do‘konga kiradi.',
    # account
    ('GET', '/tenants/current'):
        '«Tarif va hisob» sahifasi: `plan`, `status`, `planExpiresAt`, `deletionScheduledAt`, `limits` va '
        '`usage` — «3 / 10 foydalanuvchi», «1,2 GB / 2 GB» kabi. Banner uchun holat hamma rolga login/refresh javobida ham '
        'bor (`user.tenant.status`) — README → Do‘kon holati.',
    ('POST', '/tenants/current/delete'):
        '«Xavfli zona». Parol bilan tasdiq; javobda yangilangan hisob (`status: deleting`, `deletionScheduledAt`). '
        '30 kun — faqat o‘qish, keyin hamma narsa o‘chadi. Oldin zaxira olishni taklif qiling (`GET /backup/export`).',
    ('POST', '/tenants/current/restore'):
        'O‘chirish muhlatidagi do‘konni qaytarish (banner tugmasi). Tarif muddati o‘tib ketgan bo‘lsa holat '
        '`suspended` ga qaytadi (to‘lov kerak), aks holda `active`. Muhlatda bo‘lmasa — 422 `INVALID_STATUS_TRANSITION`.',
    # billing
    ('POST', '/billing/invoices'):
        '«To‘lash»: `plan` (`basic` | `pro`) va `months` (1–12). Summa serverda: oylik narx × oy '
        '(`basic` 99 000, `pro` 249 000 so‘m). Javobdagi `payme`/`click` havolasini yangi oynada oching; '
        '`null` — serverda shu provayder sozlanmagan (tugmani yashiring). Tarif to‘lov TASDIQLANGACH o‘zgaradi: '
        'foydalanuvchi qaytgach `GET /billing/invoices` (`state: paid`) va `GET /tenants/current` ni qayta so‘rang. '
        'To‘xtatilgan (`suspended`) do‘konda ham ishlaydi.',
    ('GET', '/billing/invoices'):
        'To‘lovlar tarixi (oxirgi 50). `state`: `created` → `pending` (provayder boshladi) → `paid` yoki `cancelled`.',
    ('POST', '/billing/payme'): 'Frontend CHAQIRMAYDI — Payme serveri uchun (JSON-RPC, Basic auth).',
    ('POST', '/billing/click/prepare'): 'Frontend CHAQIRMAYDI — Click serveri uchun (form-urlencoded, MD5 imzo).',
    ('POST', '/billing/click/complete'): 'Frontend CHAQIRMAYDI — Click serveri uchun.',
    # settings
    ('GET', '/settings'):
        'Ilova ochilganda bir marta (hamma rol) va `PATCH` dan keyin. POS: `taxEnabled`/`taxRate`, '
        '`maxDiscountPct`, `wholesaleEnabled` (ulgurji narx tugmasi), `sellerWholesaleEnabled` (sotuvchiga ham ulgurji — '
        'o‘chiq bo‘lsa sotuvchida tugmani yashiring: narx unga kelmaydi, so‘rasa 403), `loyaltyEnabled`/`loyaltyRate` (bonus). '
        'Chek: `storeName`, `receiptPhone`, `receiptAddress`, `receiptFooter`, `currency`.',
    ('PATCH', '/settings'):
        'Sozlamalar sahifasi va dastlabki sozlash sehrgari. Faqat o‘zgargan maydonlarni yuboring. '
        'Foizlar butun son 0–100. Server keshi darhol yangilanadi. `sellerWholesaleEnabled` o‘zgarsa — sotuvchilar '
        'katalogni qayta so‘rasin (`wholesalePrice` paydo bo‘ladi/yo‘qoladi).',
    # warehouses
    ('GET', '/warehouses'):
        'Omborlar sahifasi va har qanday «ombor tanlash» ro‘yxati (POS, kirim, ko‘chirish, buyurtma). '
        'Tanlov uchun `archived=false`. Sukut tartib — yaratilish (sukut ombor birinchi).',
    ('GET', '/warehouses/stock'):
        'Omborlar sahifasidagi kartalar: har omborda qoldig‘i bor tovar turlari soni va tannarxdagi qiymati '
        '(`stockValue` sotuvchiga chiqmaydi).',
    ('POST', '/warehouses'): 'Yangi ombor. Tarif chegarasi to‘lsa — 402 `PLAN_LIMIT_EXCEEDED` («Tarifni oshiring» taklifi).',
    ('PATCH', '/warehouses/:id'): 'Nom/manzil. `If-Match: <updatedAt>` yuboring (README → Optimistik qulf).',
    ('POST', '/warehouses/:id/archive'):
        'Omborni arxivlash (o‘chirish o‘rniga). Javobdagi `stockWarning` bo‘lsa — «omborda N xil tovar qoldi» '
        'ogohlantirishi. Arxiv omborga kirim/ko‘chirish/sotuv yo‘q (422 `WAREHOUSE_ARCHIVED`), undan chiqim mumkin.',
    ('POST', '/warehouses/:id/restore'): 'Arxivdan qaytarish; tarif chegarasiga kiradi (402).',
    # categories
    ('GET', '/categories'): 'Katalog filtri, mahsulot formasi. Har kategoriyada mahsulotlar soni. Sukut tartib — `sortOrder`.',
    ('DELETE', '/categories/:id'):
        'Yumshoq o‘chirish; mahsulot bor bo‘lsa — 409 `CATEGORY_IN_USE`. Toast’dagi «Qaytarish» → `POST /categories/:id/restore`.',
    ('PATCH', '/categories/:id'): 'Nom yoki tartib. `If-Match` qo‘llanadi.',
    # products
    ('GET', '/products'):
        'Katalog jadvali (server sahifalash/saralash), POS qidiruvi va mahsulot tanlash oynalari. `q` — nom/SKU '
        'bo‘yicha qism + shtrix-kod bo‘yicha aniq moslik (skaner shu bilan ishlaydi). `lowStock=true` — kam qolganlar (`stock ≤ minStock`). '
        '`warehouseId` — faqat shu omborda qoldig‘i BOR (> 0) mahsulotlar, `warehouseStock` — o‘sha ombor qoldig‘i '
        '(inventarizatsiya varag‘i uchun filtrsiz ro‘yxat + `stocks[warehouseId] ?? 0`). Har qatorda `stock` (jami) va `stocks` '
        '(`{warehouseId: qty}`). Sotuvchida `cost`, `wholesalePrice` YO‘Q.',
    ('GET', '/products/summary'): 'Katalog tepasidagi kartalar: faol turlar, kam qolganlar, ombor qiymati (sotuvchiga qiymat chiqmaydi).',
    ('GET', '/products/:id'): 'Mahsulot kartasi / tahrir formasi (ombor qoldiqlari bilan).',
    ('GET', '/products/:id/stats'): 'Mahsulot kartasidagi raqamlar: sof sotilgan miqdor (asosiy birlikda) va oxirgi sotuv sanasi.',
    ('POST', '/products'):
        'Yangi mahsulot. Qoldiq bu yerda BERILMAYDI — keyin `POST /stock/intake`. Rasm: avval fayl yuklang '
        '(`/files/presign` → PUT → `/files/:id/confirm`, `kind: product_image`), keyin `imageFileId`. '
        'Qo‘shimcha birlik: `altUnit` + `altFactor` birga, ma’nosi «1 `altUnit` = `altFactor` ta asosiy birlik»: asosiy `kg` + '
        'qo‘shimcha `qop` → `altFactor: 50` (1 qop = 50 kg); asosiy `qop` + qo‘shimcha `kg` → `altFactor: 0.02`.',
    ('PATCH', '/products/:id'):
        'Tahrir. `If-Match: <updatedAt>` yuboring. `imageFileId: null` — rasmni olib tashlash. Qoldiqni o‘zgartirib bo‘lmaydi.',
    ('DELETE', '/products/:id'): 'Yumshoq o‘chirish; toast’dagi «Qaytarish» → `POST /products/:id/restore`. Sotishni to‘xtatish uchun `archived: true` ham bor.',
    ('POST', '/products/import'):
        'CSV import oynasi: fayl brauzerda o‘qiladi va qatorlar JSON bilan yuboriladi (≤ 5000). `mode: upsert` — '
        'SKU bo‘yicha mavjudini yangilaydi. Javobdagi `errors` (`{ row, code, detail }` — qator raqami, kod, sabab) jadvalda ko‘rsatilsin — '
        'to‘g‘ri qatorlar baribir saqlanadi. Qoldiq importda yo‘q.',
    ('POST', '/products/bulk-price'):
        'Katalogda belgilangan mahsulotlar → «Narxni o‘zgartirish»: `percent` (−100…1000 %), `fixed` (± so‘m) yoki `set` '
        '(aniq narx); `target` — `price` yoki `wholesalePrice`. Eski/yangi narx auditga yoziladi.',
    # stock
    ('POST', '/stock/intake'):
        'Kirim oynasi. `qty` — ASOSIY birlikda. `unitCost` berilsa o‘rtacha tannarx qayta hisoblanadi. '
        'Har yangi amal uchun yangi `Idempotency-Key`; tarmoq xatosida XUDDI SHU kalit bilan qayta yuboring. '
        'Javobda yangilangan qoldiq (`product.stock`, `stocks`).',
    ('POST', '/stock/writeoff'): 'Hisobdan chiqarish (sinish, yo‘qotish). Sabab majburiy. Qoldiqdan ko‘p — 422 `STOCK_INSUFFICIENT` (`meta.available`).',
    ('POST', '/stock/adjust'):
        'Inventarizatsiya: `items[]` — mahsulot va SANALGAN miqdor; farqni server hisoblaydi (farq 0 — harakat yozilmaydi). '
        'Javob: `{ adjusted: [{ productId, movementId, delta, balanceAfter }], unchanged }`.',
    ('POST', '/stock/transfer'): 'Omborlar orasida ko‘chirish. Bir xil ombor — 422 `WAREHOUSE_SAME`. Javob: `{ outMovementId, inMovementId, product }`.',
    ('GET', '/stock/movements'):
        'Ombor harakatlari jurnali (kursorli: «Ko‘proq» yoki cheksiz aylantirish). Mahsulot kartasidagi tarix — `productId`.',
    ('GET', '/stock/reorder-suggestions'):
        '«Buyurtma berish kerak» ro‘yxati — kam qolgan tovarlar ta’minotchi bo‘yicha, taklif miqdori bilan. '
        'Bundan kirim buyurtmasi (`POST /purchase-orders`) tuzish mumkin.',
    # clients
    ('GET', '/clients'):
        'Mijozlar sahifasi va POS’da mijoz tanlash (`q` — nom, kompaniya, telefon). `phone` — aniq moslik '
        '(skaner/telefon bilan tez topish). Qatorda `bonusPoints`, `salesCount`.',
    ('GET', '/clients/:id/stats'):
        'Mijoz kartasi va POS’da mijoz tanlanganda: jami xarid, joriy qarz, muddati o‘tgan qarz, oxirgi xarid. '
        '`overdue > 0` bo‘lsa POS nasiyani ruxsat etmaydi — oldindan ogohlantiring.',
    ('PATCH', '/clients/:id'): 'Tahrir. `If-Match` qo‘llanadi. Bonus ballari bu yerda o‘zgarmaydi (faqat sotuv/qaytarish).',
    ('DELETE', '/clients/:id'): 'Yumshoq o‘chirish. To‘lanmagan nasiya bor — 409 `CLIENT_HAS_DEBT` (`meta.debt`).',
    # suppliers
    ('GET', '/suppliers'):
        'Ta’minotchilar sahifasi; `withDebt=true` — qarzimiz bor ta’minotchilar. Qatorda qarz (sotuvchida yo‘q) va mahsulotlar soni.',
    ('GET', '/suppliers/summary'): 'Sahifa kartalari: jami qarzimiz (sotuvchida yo‘q) va qarzdor bo‘lgan ta’minotchilar soni.',
    ('GET', '/suppliers/:id'):
        'Ta’minotchi kartasi: buyurtmalar tarixi, qarzimiz (faqat kelgan tovar), oxirgi to‘lovlar — bitta so‘rovda. '
        'Sotuvchida summalar yo‘q (buyurtma raqami/holati/sanasi va to‘lov usuli qoladi).',
    ('DELETE', '/suppliers/:id'): 'Ochiq (`ordered`/`partial`) buyurtmasi bor — 409 `SUPPLIER_HAS_OPEN_ORDERS`.',
    ('PATCH', '/suppliers/:id'): 'Tahrir. `If-Match` qo‘llanadi. STIR — aniq 9 raqam.',
    # employees
    ('PATCH', '/employees/:id'):
        'Tahrir. `If-Match` qo‘llanadi. `status: fired` — bo‘shatish (u endi tizimga kira olmaydi); oxirgi adminni bo‘shatib bo‘lmaydi (422 `LAST_ADMIN`).',
    ('DELETE', '/employees/:id'): 'Kirish hisobi bor xodim o‘chmaydi — 409 `EMPLOYEE_HAS_USER` (avval `DELETE /users/:id`).',
    # users
    ('GET', '/users'):
        'Foydalanuvchilar sahifasi (admin). Ism va lavozim xodim yozuvidan. `lastLoginAt` bor. '
        '`deleted=true` — «O‘chirilganlar» (faqat o‘chirilgan hisoblar, `deletedAt` bilan) → «Tiklash» tugmasi.',
    ('POST', '/users'):
        'Kirish hisobi: mavjud `employeeId` (hisobi yo‘q xodim), email, parol, rol. Xodimda allaqachon hisob bor — '
        '409 `EMPLOYEE_HAS_USER` — `errors[0].meta: { userId, deleted }`; `deleted: true` bo‘lsa yangisi o‘rniga «Tiklash» '
        'taklif qiling (`POST /users/{userId}/restore`); '
        'email band — 409 `ALREADY_EXISTS`; tarif to‘lgan — 402.',
    ('PATCH', '/users/:id'):
        'Rol, email, faollik, parolni tiklash (admin). Parol yoki `isActive: false` — shu foydalanuvchining barcha '
        'sessiyalari yopiladi. Rol o‘zgarishi uning joriy access tokeniga ≤ 15 daqiqada yetib boradi. '
        'O‘z rolini/o‘zini o‘chirish — 422; oxirgi admin — 422 `LAST_ADMIN`.',
    ('DELETE', '/users/:id'): 'Yumshoq o‘chirish (xodim qoladi). O‘zini — 422 `SELF_DELETE`, oxirgi admin — 422 `LAST_ADMIN`.',
    # sales
    ('POST', '/sales'):
        'POS «To‘lash» (F9). Savat brauzerda turadi, chek BITTA so‘rov bilan yoziladi. `total` — ekranda ko‘rsatilgan '
        'jami: yuboring, farq bo‘lsa 422 `TOTAL_MISMATCH` (`meta.client/server`) — chek yozilmaydi, pul noto‘g‘ri olinmaydi. '
        '`paid.cash` — mijoz BERGAN naqd (qaytim server hisoblaydi → `change`). To‘lanmagan qismi — nasiya '
        '(`customerId` shart). Smena yopiq — 423 `SHIFT_REQUIRED` → smena ochish oynasi. Muvaffaqiyatda chek: '
        '`GET /sales/:id/receipt`. Offline navbatga tushsa — XUDDI SHU `Idempotency-Key` bilan qayta yuboriladi. '
        '`priceTier: "wholesale"` — sotuvchiga faqat `sellerWholesaleEnabled` bilan (aks holda 403 `PERMISSION_DENIED`).',
    ('GET', '/sales'):
        'Cheklar jurnali (kursorli, yangisi birinchi). `payment=debt` — qarzi qolgan cheklar; `q` — chek raqami yoki mijoz nomi; '
        '`relatedSaleId` — shu chek bo‘yicha qaytarish hujjatlari (chek kartasidagi «Qaytarishlar»). '
        'Qatorlarsiz — tafsilot `GET /sales/:id` da.',
    ('GET', '/sales/:id'):
        'Chek tafsiloti: qatorlar (`items[].id` — qaytarishda `saleItemId`; `items[].returnedQty` — shu qatordan qaytarilgani, '
        'yana qaytarish mumkin: `qty − returnedQty`), to‘lov, qarz, yetkazish holati.',
    ('GET', '/sales/:id/receipt'):
        'Chop etish uchun: do‘kon rekvizitlari + chek + mijoz/sotuvchi nomi + fiskal ma’lumot. `fiscal: null` — OFD o‘chiq; '
        '`fiscal.status: pending|sent` — hali fiskal raqam yo‘q (`sale.fiscalized` hodisasidan keyin QR bilan qayta chop etish mumkin). '
        '`format=pdf` — tayyor 80 mm termal chek (PDF, fiskal QR bilan): token bilan `fetch` → `blob` → '
        '`URL.createObjectURL` → yangi oynada ochish/chop etish yoki yuklab olish (`Content-Disposition: inline; filename="CHEK-….pdf"`). '
        '`<a href>` token yubora olmaydi — to‘g‘ridan-to‘g‘ri havola ishlamaydi.',
    ('POST', '/sales/:id/return'):
        'Qaytarish oynasi: asl chek qatorlari (`saleItemId`) va miqdor (asl qator birligida, ko‘pi bilan `qty − returnedQty` — '
        '`GET /sales/:id`) + sabab. Qaytariladigan summani '
        'brauzerda HISOBLAMANG: javobdagi hujjat — `total` (jami), `paid.cash` (kassadan qaytariladigan naqd), `debtPaid` '
        '(nasiya chekda qarzdan yopilgan qism). Ochiq smena shart.',
    ('POST', '/sales/:id/cancel'):
        'Chekni bekor qilish (`sales:delete` — admin, manager). Qaytarish yoki qarz to‘lovi bor chek — 409 `SALE_NOT_CANCELLABLE` '
        '(`meta.reason`). Naqd qaytarilsa ochiq smena kerak. Chekni o‘chirish yo‘q — faqat bekor qilish.',
    # cash
    ('GET', '/cash/shifts/current'):
        'POS va Kassa sahifasi ochilganda: `shift` (`null` — smena yopiq → «Smena ochish») va `cashBalance` (yashikdagi kutilgan naqd). '
        '`shift.*`, `sale.*`, `debt.paid` hodisalarida qayta so‘rang.',
    ('GET', '/cash/shifts'): 'Smenalar tarixi (`cashierName` bilan), sana/holat filtri.',
    ('POST', '/cash/shifts/open'): 'Smena ochish: yashikdagi SANALGAN naqd (`openingBalance`). Ochiq smena bor — 409 `SHIFT_ALREADY_OPEN`.',
    ('POST', '/cash/shifts/close'):
        'Smena yopish: sanalgan naqd (`countedBalance`), ixtiyoriy kupyuralar (`{"100000": 3, ...}` — yig‘indisi teng bo‘lsin). '
        'Javobda kutilgan/sanalgan/farq. So‘ng Z-hisobot: `GET /cash/shifts/:id/report`.',
    ('GET', '/cash/shifts/:id/report'): 'X-hisobot (ochiq smena) yoki Z-hisobot (yopilgan): sotuv, qaytarish, naqd kirim/chiqim, xarajat, qarz va ta’minotchi to‘lovlari.',
    ('POST', '/cash/movements'): 'Naqd kirim/chiqim (inkassatsiya, maydalash). Sabab majburiy; faqat ochiq smenada.',
    ('GET', '/cash/movements'): 'Smena ichidagi naqd harakatlar; `shiftId` berilmasa — joriy smena.',
    # debts
    ('GET', '/debts'):
        'Qarzlar sahifasi. `view=customers` (sukut) — mijoz bo‘yicha yig‘ma (`CustomerDebtDto`), `view=receipts` — chek bo‘yicha '
        '(`DebtReceiptDto`). `aging` — `d30` (0–30 kun), `d60` (31–60), `d60plus`; `overdue=true` — muddati o‘tganlar. '
        'Javobdagi `summary` (jami qarz, muddati o‘tgan, qarzdorlar soni, eng eski sana) — sahifa kartalari uchun: `customerId` ga bog‘liq, '
        'qolgan filtrlarga (`view`, `aging`, `overdue`, `q`) bog‘liq emas.',
    ('GET', '/debts/payments'): 'Qarz to‘lovlari tarixi; `saleId` yoki `customerId` bo‘yicha.',
    ('POST', '/debts/payments'):
        'Qarz to‘lovi ANIQ chek bo‘yicha (`saleId`). Mijozning bir nechta nasiya cheki bo‘lsa — foydalanuvchi chekni tanlaydi '
        '(yoki frontend eng eskisidan boshlab ketma-ket bir nechta so‘rov yuboradi, har biriga ALOHIDA kalit). '
        'Qarzdan ko‘p — 422 `PAYMENT_EXCEEDS_DEBT`. `cash` — kassaga (ochiq smena shart), `bank` — kassaga ta’sirsiz.',
    # quotes
    ('GET', '/quotes'): 'Takliflar ro‘yxati; `expired=true` — amal muddati o‘tgan ochiq takliflar.',
    ('GET', '/quotes/summary'): 'Takliflar kartalari: jami, qabul qilingan, javob kutilayotgan summa.',
    ('POST', '/quotes'):
        'Taklif (smeta). Summalar sotuv qoidasida hisoblanadi; qoldiq band QILINMAYDI. `priceTier` berilmasa: `wholesaleEnabled` bo‘lsa — '
        '`retail` bo‘lmagan har qanday guruh (`wholesale`, `vip`) ulgurji, aks holda chakana. Aniq berilgan `priceTier` '
        '`wholesaleEnabled=false` da ham qo‘llanadi (sotuvdan farqli).',
    ('PATCH', '/quotes/:id'):
        'Tahrir va holat (`draft` → `sent` → `accepted`/`rejected`). `items` berilsa — to‘liq almashtiriladi. Aylantirilgan taklif o‘zgarmaydi (409).',
    ('POST', '/quotes/:id/convert'):
        'Qabul qilingan taklifni sotuvga aylantirish: `method` — `cash|card|transfer` (to‘liq to‘lov) yoki `debt` (nasiya, mijoz shart). '
        'Ochiq smena shart; qoldiq yetmasa — 422 `QUOTE_STOCK_SHORT` (`errors[]` — qaysi tovar). Ombor — `warehouseId` (kassada '
        'tanlangani; berilmasa — joriy, amalda sukut ombor), arxiv — 422 `WAREHOUSE_ARCHIVED`. '
        'Server holatni tekshirmaydi — aylantirilmagan HAR QANDAY taklif (`draft`, `rejected`, muddati o‘tgan ham) aylantiriladi; '
        'tugmani faqat `accepted` da ko‘rsatish — frontend qoidasi. Javob — yaratilgan chek.',
    # purchase orders
    ('GET', '/purchase-orders'):
        'Xaridlar sahifasi. Har buyurtmada `outstanding` — faqat KELGAN tovar uchun qarzimiz. Sotuvchida summalar yo‘q '
        '(ustunlarni yashiring).',
    ('GET', '/purchase-orders/summary'):
        'Xaridlar kartalari: kreditorlik, kutilayotgan buyurtmalar, oy xaridi, qabul qilingan summa. Sotuvchida faqat `openOrders`.',
    ('POST', '/purchase-orders'):
        'Buyurtma: ta’minotchi, qatorlar (`productId`, `qty` — asosiy birlikda, `cost` — birlik narx), ixtiyoriy qabul ombori va to‘lov muddati. Raqam `BUY-NNNN`.',
    ('PATCH', '/purchase-orders/:id'): 'Faqat `ordered` holatida (hech narsa kelmagan). `items` berilsa — to‘liq almashtiriladi.',
    ('POST', '/purchase-orders/:id/receive'):
        'Tovar keldi: `items[]` — `poItemId` va kelgan miqdor (qisman bo‘lishi mumkin); `items` berilmasa — qolgani HAMMASI. '
        'Buyurtmadan ko‘p — 422 `PO_OVER_RECEIVE`. Har qator — kirim harakati va o‘rtacha tannarx.',
    ('POST', '/purchase-orders/:id/pay'):
        'Ta’minotchiga to‘lov (`finance:create` — omborchida yo‘q). Kelgan tovar qarzidan oshmaydi (422 `PAYMENT_EXCEEDS_DEBT`) — oldindan to‘lov yo‘q. '
        '`cash` — kassadan (ochiq smena shart). Sotuvchi rolida xatoda qarz miqdori aytilmaydi (`meta: { requested }`).',
    ('POST', '/purchase-orders/:id/cancel'): 'Faqat `ordered` (hech narsa kelmagan) buyurtma bekor qilinadi; qisman kelgan — 409 `PO_ALREADY_RECEIVED`.',
    ('DELETE', '/purchase-orders/:id'): 'Faqat `ordered` yoki `cancelled` va to‘lanmagan buyurtma (aks holda 409 `PO_ALREADY_RECEIVED`); toast’dagi «Qaytarish» → `.../restore`.',
    # deliveries
    ('GET', '/deliveries'): 'Yetkazishlar sahifasi; `overdue=true` — rejalashtirilgan sanasi o‘tgan faollari.',
    ('GET', '/deliveries/summary'): 'Kartalar: holatlar bo‘yicha son, yetkazilganlar narxi, haydovchilar yuki.',
    ('GET', '/deliveries/my'): 'Haydovchi ko‘rinishi: faqat O‘ZIGA (token’dagi xodim) biriktirilgan faol yetkazishlar. Alohida haydovchi roli yo‘q.',
    ('GET', '/deliveries/route'): 'Marshrut varaqasi: haydovchining kungi yetkazishlari va olinadigan pul (`date`, `driverId`).',
    ('POST', '/deliveries'):
        'Qo‘lda yetkazish. Chekka bog‘liq (`saleId`) — narx chekdan; cheksiz (alohida xizmat) — `fee`. '
        'Odatda yetkazish POS’da chek bilan birga yaratiladi (`POST /sales` → `delivery`).',
    ('PATCH', '/deliveries/:id'): 'Faqat faol holatda. `driverId: null` — haydovchini olib tashlash, `lat/lng: null` — joylashuvni tozalash.',
    ('POST', '/deliveries/:id/status'):
        'Holat: `pending` → `on_way` → `delivered`; faol holatdan → `cancelled`. `deliveries:edit` bor rollar (admin, manager, sotuvchi) '
        'HAR QANDAY yetkazish holatini o‘zgartiradi; `edit` siz rol (omborchi) — faqat O‘ZIGA biriktirilganini (aks holda 403). '
        'Orqaga — 422 `INVALID_STATUS_TRANSITION`.',
    # expenses
    ('GET', '/expenses'): 'Xarajatlar jurnali. `withDeleted=true` — o‘chirilganlari ham (tiklash uchun).',
    ('GET', '/expenses/summary'): 'Kartalar: bugun, oy, jami (filtrsiz) + kategoriya taqsimoti (ro‘yxat filtrlari bilan).',
    ('POST', '/expenses'): 'Xarajat. `method: cash` — kassadan chiqadi (ochiq smena shart, aks holda 423), `bank` — kassaga ta’sirsiz.',
    ('PATCH', '/expenses/:id'): 'Tahrir: eski kassa ta’siri qaytariladi, yangisi joriy smenaga qo‘llanadi. Ochiq smena faqat naqd ta’sir o‘zgarsa (summa yoki usul) kerak.',
    ('DELETE', '/expenses/:id'): 'O‘chirish: naqd xarajat puli kassaga qaytadi. «Qaytarish» → `POST /expenses/:id/restore`.',
    ('GET', '/expense-templates'): 'Takrorlanuvchi xarajat shablonlari (ijara, oylik).',
    ('POST', '/expense-templates'): 'Shablon: `period` (`monthly` — `dayOfPeriod` 1–28, `weekly` — 1–7, dushanba = 1).',
    ('POST', '/expense-templates/run-due'): '«Hozir ishga tushirish» tugmasi — muddati kelgan shablonlar xarajatga aylanadi (davrga bir marta). Cron o‘zi ham har kuni 00:05 da ishlaydi.',
    # messages
    ('POST', '/messages/preview'): 'Yuborishdan OLDIN: tanlangan auditoriyada nechta qabul qiluvchi borligi (yubormaydi).',
    ('POST', '/messages'):
        'SMS yuborish: `target` (`customer` + `customerId`, `group` + `group`, `debtors`, `all`) va matn (≤ 600). O‘zgaruvchilar: '
        '`{name}`, `{phone}`, `{debt}`, `{bonus}`, `{store}` — har qabul qiluvchiga serverda almashtiriladi. Yuborish fonda. '
        'Kunlik chegara — tarif `smsPerDay` va server `SMS_DAILY_LIMIT` (sukut 1000) ning kichigi; oshsa 429 `MESSAGE_LIMIT_EXCEEDED` (`meta.limit/used/requested`).',
    ('GET', '/messages'): 'Xabarlar jurnali: har xabarda qabul qiluvchilar soni va yuborish holati statistikasi.',
    # reports
    ('GET', '/dashboard'):
        'Bosh sahifa (moliya huquqi): bugun/kecha, debitor/kreditor, kam qolganlar, trend (`days` = 7 | 30 | 90), top mahsulot/qarzdor, '
        'oxirgi cheklar. Sotuvchida `profit` va `payables` (ta’minotchilarga qarz) yo‘q.',
    ('GET', '/reports/pnl'):
        'Hisobotlar sahifasi: `from`/`to` (YYYY-MM-DD, ≤ 3 yil) — oldingi teng davr bilan solishtirish, trend (kun/oy), to‘lov turlari, '
        'xarajat kategoriyalari, top mahsulot, sotuvchilar va sotilmayotgan tovar (`limit` — shu uchala ro‘yxat uzunligi, sukut 20). Jami (`current/previous`) '
        'qaytarishlar ayirilgan; `trend` va top ro‘yxatlar — yalpi sotuv (qaytarishsiz), `trend` faqat sotuv bo‘lgan kunlar.',
    ('GET', '/analytics'):
        'Analitika sahifasi: ABC tahlil (80/95 %) — sotilgan BARCHA mahsulot (jadvalni brauzerda sahifalang), kategoriya va to‘lov '
        'taqsimoti, kunlik trend — yalpi sotuv (qaytarishsiz). Faqat `from`/`to` — `limit` yuborilsa 400.',
    # audit
    ('GET', '/audit'):
        'Audit jurnali sahifasi (kursorli). `group` — amal guruhi (`sale` → `sale.create`, `sale.cancel`, ...), `entityId` — bitta yozuv tarixi '
        '(masalan chek yoki mahsulot kartasida «Tarix» bo‘limi), `userId` — kim qilgan.',
    # files
    ('POST', '/files/presign'):
        '1-qadam: brauzerda faylning SHA-256 (hex) hisoblanadi, `kind`, `mime`, `size` bilan yuboriladi. `reused: true` — bu tarkib '
        'allaqachon bor: `file.id` ni darhol ishlating (yuklash kerak emas). Aks holda `upload.url` ga `PUT` (aynan `upload.headers` bilan, '
        '10 daqiqa ichida), keyin 2-qadam.',
    ('POST', '/files/:id/confirm'):
        '2-qadam (PUT dan keyin): server hajm, MIME (sehrli baytlar) va xeshni tekshiradi → `status: ready`. Shundan keyin `id` ni '
        'mahsulotga (`imageFileId`) bog‘lang. PUT hali bo‘lmagan — 409 `FILE_NOT_UPLOADED`; tarkib mos emas — 422 `FILE_REJECTED`.',
    ('GET', '/files/urls'):
        'Ro‘yxatdagi rasmlar uchun BITTA so‘rov: `ids` (vergul bilan, ≤ 100) → `{id: url}` (10 daqiqa). `<img src>` token yubora olmaydi — '
        'shuning uchun imzolangan havola. `variant` sukut `128` (ro‘yxat), kartada `512`. Havola `expiresAt` dan oldin yangilansin.',
    ('GET', '/files/:id/raw'):
        'Bitta faylni ochish: 302 → imzolangan havola. Diqqat: bu yo‘l `Authorization` talab qiladi, shuning uchun `<img src>` da '
        'ishlamaydi — rasm uchun `GET /files/urls` dan foydalaning; bu yo‘l fetch/yuklab olish uchun.',
    ('GET', '/files/usage'): '«Tarif va hisob» sahifasida saqlash hajmi: band, chegara va tur bo‘yicha.',
    ('DELETE', '/files/:id'): 'Faylni o‘chirish; mahsulotlardagi havola uziladi. S3’dan 30 kundan keyin tozalanadi.',
    # exports
    ('GET', '/exports/:resource'):
        '«Eksport» tugmasi: `products`, `clients`, `sales`, `stock-movements`, `expenses`, `audit`; `format` — `csv` (Excel uchun BOM bilan) '
        'yoki `json`; sanali ro‘yxatlarda `dateFrom`/`dateTo`. 200 — fayl (blob; nom `Content-Disposition` da). 202 — fon ishi: '
        '`GET /exports/jobs/{id}` ni `status: ready` bo‘lguncha so‘rang (masalan 2–3 s da bir), keyin javobdagi `url` ni '
        '`window.location.href` bilan oching (token va CORS kerak emas).',
    ('GET', '/exports/jobs/:id'): 'Fon eksporti holati: `queued` → `running` → `ready` (yoki `failed`, sababi `error` da). '
        '`ready` da `url` — imzolangan havola (`expiresAt` gacha, ~10 daqiqa; eskirsa shu so‘rovni takrorlang) → `window.location.href = url`.',
    ('GET', '/exports/jobs/:id/download'):
        'Muqobil yo‘l: 302 → imzolangan havola (fayl 7 kun saqlanadi). `Authorization` talab qiladi, `fetch` bilan faqat API '
        'frontend bilan bir manbada bo‘lsa ishlaydi — odatda `GET /exports/jobs/:id` dagi `url` qulayroq.',
    # backup
    ('GET', '/backup/export'):
        'Sozlamalar → «Zaxira olish»: javobdagi `url` ni ochib yuklab oling (`expiresAt` gacha, 1 soat). To‘xtatilgan/o‘chirilayotgan do‘konda ham ishlaydi. '
        'Tiklash (boshqa, bo‘sh do‘konga): faylni ochib (gunzip) `{ source: "localStorage", version, exportedAt, data: <butun fayl>, settings, users }` '
        'ko‘rinishida `POST /migration/import` ga (README 10.18).',
    # migration
    ('POST', '/migration/validate'):
        'Sehrgarning «Tekshirish» qadami: hech narsa yozmaydi. `counts` (nusxada), `accepted` (yoziladi), `existing` (serverda allaqachon bor — '
        'takroriy import ogohlantirishi), `issues` (`error` — o‘tkazib yuboriladi, `warning` — tuzatiladi).',
    ('POST', '/migration/import'):
        'Sehrgarning «Yuborish» qadami (tana ≤ 25 MB, 5 daqiqagacha). Qayta yuborish ikkilantirmaydi. Javobdagi `users[]` — vaqtinchalik parollar '
        'FAQAT shu javobda: foydalanuvchiga ko‘rsating va saqlab olishni so‘rang.',
    # oddiy CRUD (bitta yozuv, yaratish, tiklash)
    ('GET', '/warehouses/:id'): 'Bitta ombor — tahrir formasi (`updatedAt` → `If-Match`).',
    ('POST', '/categories'): 'Yangi kategoriya (katalog yoki mahsulot formasidagi «+»). `sortOrder` berilmasa — ro‘yxat oxiriga. Nom band — 409 `ALREADY_EXISTS`.',
    ('GET', '/categories/:id'): 'Bitta kategoriya — tahrir formasi.',
    ('POST', '/categories/:id/restore'): 'O‘chirishni qaytarish (toast’dagi «Qaytarish», undo).',
    ('POST', '/products/:id/restore'): 'O‘chirishni qaytarish; shtrix-kod shu orada boshqa mahsulotga berilgan bo‘lsa — 409 `ALREADY_EXISTS`.',
    ('POST', '/clients'):
        'Yangi mijoz (Mijozlar sahifasi yoki POS’dagi «+ Mijoz»). Sukut: `type=individual`, `status=lead`, `group=retail`. '
        '`creditLimit` `null`/0 — nasiya cheklanmagan; `paymentTermDays` — nasiya chekning to‘lov muddati (kun).',
    ('GET', '/clients/:id'): 'Mijoz kartasi / tahrir formasi. Raqamlar (qarz, xarid) — `GET /clients/:id/stats`.',
    ('POST', '/clients/:id/restore'): 'O‘chirishni qaytarish (undo).',
    ('POST', '/suppliers'): 'Yangi ta’minotchi. `paymentTermDays` — kirim buyurtmasida `dueDate` berilmasa shundan hisoblanadi.',
    ('POST', '/suppliers/:id/restore'): 'O‘chirishni qaytarish (undo).',
    ('GET', '/employees'):
        'Xodimlar sahifasi va xodim tanlash ro‘yxatlari (haydovchi, sotuvchi; `status=active`). Faqat admin/manager '
        '(`employees:view`) — sotuvchi va omborchida bu ro‘yxat yo‘q (403), ularga xodim tanlash maydonini ko‘rsatmang.',
    ('POST', '/employees'): 'Yangi xodim (kirish hisobisiz). Tizimga kirishi kerak bo‘lsa — keyin `POST /users` bilan hisob ochiladi.',
    ('GET', '/employees/:id'): 'Xodim kartasi / tahrir formasi (`userId` — kirish hisobi bormi).',
    ('POST', '/employees/:id/restore'): 'O‘chirishni qaytarish (undo).',
    ('GET', '/users/:id'): 'Foydalanuvchi tahrir formasi.',
    ('POST', '/users/:id/restore'):
        'O‘chirilgan hisobni qaytarish (ro‘yxat — `GET /users?deleted=true`, yoki toast’dagi undo). Parol, rol va email '
        'o‘zgarmaydi; faol hisob tarif chegarasiga kiradi (402). Xodimi o‘chirilgan — 422 `REFERENCE_NOT_FOUND` '
        '(avval `POST /employees/:id/restore`).',
    ('GET', '/quotes/:id'): 'Taklif (qatorlari bilan) — ko‘rish, chop etish, tahrir.',
    ('DELETE', '/quotes/:id'): 'Yumshoq o‘chirish; sotuvga aylantirilgan taklif o‘chmaydi (409). «Qaytarish» → `POST /quotes/:id/restore`.',
    ('POST', '/quotes/:id/restore'): 'O‘chirishni qaytarish (undo).',
    ('GET', '/expenses/:id'): 'Bitta xarajat — tahrir formasi.',
    ('POST', '/expenses/:id/restore'): 'O‘chirilgan xarajatni qaytarish: naqd bo‘lsa yana kassadan chiqadi.',
    ('PATCH', '/expense-templates/:id'): 'Shablonni tahrirlash yoki vaqtincha to‘xtatish (`active: false`).',
    ('DELETE', '/expense-templates/:id'): 'Shablonni o‘chirish; undan oldin yaratilgan xarajatlar qoladi.',
    ('GET', '/purchase-orders/:id'): 'Buyurtma kartasi: qatorlar (`items[].id` — qabulda `poItemId`, `receivedQty` — kelgani), to‘langan va qarz.',
    ('POST', '/purchase-orders/:id/restore'): 'O‘chirishni qaytarish (undo).',
    ('GET', '/deliveries/:id'): 'Bitta yetkazish — karta / tahrir formasi.',
    ('DELETE', '/deliveries/:id'): 'Yumshoq o‘chirish; «Qaytarish» → `POST /deliveries/:id/restore`.',
    ('POST', '/deliveries/:id/restore'): 'O‘chirishni qaytarish (undo).',
    ('GET', '/files/:id'): 'Fayl metama’lumoti: holat (`pending|ready|quarantined`), tayyor variantlar (`128`, `512`).',
    # health
    ('GET', '/health/live'): 'Jarayon tirikmi (bog‘liqliklarsiz).',
    ('GET', '/health/ready'): 'Baza va obyekt saqlagich tayyormi — 503 bo‘lsa trafik yuborilmaydi.',
}

# ───────────────────────────── Yordamchilar


def ref_name(p: dict) -> str:
    return p['$ref'].split('/')[-1]


def esc(text: str) -> str:
    return text.replace('\n', ' ').replace('|', '\\|').strip()


def link(name: str, in_schemas: bool) -> str:
    target = f'#{name.lower()}' if in_schemas else f'schemas.md#{name.lower()}'
    return f'[`{name}`]({target})'


def typ(p: dict, in_schemas: bool) -> str:
    if '$ref' in p:
        t = link(ref_name(p), in_schemas)
    elif 'allOf' in p:
        t = ' & '.join(typ(x, in_schemas) for x in p['allOf'])
    elif 'oneOf' in p:
        t = ' \\| '.join(typ(x, in_schemas) for x in p['oneOf'])
    elif p.get('type') == 'array':
        inner = typ(p.get('items', {}), in_schemas)
        t = f'{inner}[]' if ' ' not in inner else f'({inner})[]'
    elif 'enum' in p:
        t = ' \\| '.join(f'`{v}`' for v in p['enum'])
    elif p.get('type') == 'object':
        ap = p.get('additionalProperties')
        if isinstance(ap, dict) and ap:
            t = f'`Record<string, {ap.get("type", "any")}>`'
        else:
            t = '`object`'
    else:
        base = p.get('type', 'any')
        fmt = p.get('format')
        t = f'`{base}`' + (f' ({fmt})' if fmt else '')
    if p.get('nullable'):
        t += ' \\| `null`'
    return t


def constraints(p: dict) -> str:
    parts = []
    for key, label in [('minimum', 'min'), ('maximum', 'max'), ('minLength', 'min uzunlik'),
                       ('maxLength', 'maks. uzunlik'), ('minItems', 'min'), ('maxItems', 'ko‘pi bilan'),
                       ('pattern', 'shablon')]:
        if key in p:
            parts.append(f'{label} `{p[key]}`')
    if 'default' in p:
        parts.append(f'sukut `{json.dumps(p["default"], ensure_ascii=False)}`')
    if 'example' in p and not isinstance(p['example'], (dict, list)):
        parts.append(f'misol `{p["example"]}`')
    return ', '.join(parts)


def prop_desc(p: dict) -> str:
    desc = esc(p.get('description', ''))
    extra = constraints(p)
    return ' — '.join(x for x in [desc, extra] if x)


def fields_table(schema_name: str, in_schemas: bool, request: bool) -> list[str]:
    s = S[schema_name]
    props = s.get('properties', {})
    if not props:
        return ['_Maydonlar erkin (`object`)._']
    req = set(s.get('required', []))
    head = 'Majburiy' if request else 'Doim bor'
    lines = [f'| Maydon | Tip | {head} | Izoh |', '|---|---|:-:|---|']
    for name, p in props.items():
        lines.append(f'| `{name}` | {typ(p, in_schemas)} | {"✔" if name in req else ""} | {prop_desc(p)} |')
    return lines


def op_anchor(method: str, path: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', f'{method} {short(path)}'.lower()).strip('-')
    return slug


# ───────────────────────────── Operatsiyalar ro'yxati
ops = []
for path, methods in spec['paths'].items():
    for method, op in methods.items():
        m = method.upper()
        key = (m, short(norm(path)))
        route = ROUTE.get((m, norm(path)))
        ops.append({'method': m, 'path': path, 'key': key, 'op': op, 'route': route, 'group': group_of(path)})

group_order = {g[0]: i for i, g in enumerate(GROUPS)}
by_group = defaultdict(list)
for o in ops:
    by_group[o['group']].append(o)

# Sxemalar qayerda ishlatiladi (so'rov/javob)
used_in = defaultdict(list)
for o in ops:
    op = o['op']
    for ct, c in op.get('requestBody', {}).get('content', {}).items():
        if '$ref' in c.get('schema', {}):
            used_in[ref_name(c['schema'])].append((o, 'so‘rov'))
    for status, resp in op.get('responses', {}).items():
        for ct, c in resp.get('content', {}).items():
            sch = c.get('schema', {})
            if '$ref' in sch:
                used_in[ref_name(sch)].append((o, f'javob {status}'))
            elif sch.get('type') == 'array' and '$ref' in sch.get('items', {}):
                used_in[ref_name(sch['items'])].append((o, f'javob {status} (massiv)'))


def code_ticks(text: str) -> str:
    """`STOCK_INSUFFICIENT` kabi xato kodlari — kod ko'rinishida (qo'shtirnoq ichidagilarga tegilmaydi)."""
    parts = text.split('`')
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r'\b([A-Z][A-Z0-9]*_[A-Z0-9_]*\*?)', r'`\1`', parts[i])
    return '`'.join(parts)


def default_error(status: str) -> str:
    return {'400': '`VALIDATION_FAILED`', '404': '`NOT_FOUND`', '403': '`PERMISSION_DENIED`'}.get(status, '')


def render_op(o: dict) -> list[str]:
    m, path, op, route = o['method'], o['path'], o['op'], o['route'] or {}
    shown = short(norm(path))
    out = [f'<a id="{op_anchor(m, path)}"></a>', '', f'### `{m} {shown}` — {esc(op.get("summary", ""))}', '']
    note = NOTES.get(o['key'])
    if op.get('description'):
        out += [f'> {esc(op["description"])}', '']
    if note:
        out += [f'**Qachon / qanday:** {note}', '']

    rows = [('Huquq', permission_text(m, norm(path), route))]
    headers = []
    for prm in op.get('parameters', []):
        if prm['in'] == 'header':
            headers.append(f'`{prm["name"]}` ({"majburiy" if prm.get("required") else "ixtiyoriy"})')
    if not route.get('public') and not short(path).startswith('/health'):
        headers.insert(0, '`Authorization: Bearer <accessToken>`')
    if short(path) in ('/auth/refresh', '/auth/logout'):
        headers.append('cookie `refresh_token` (brauzer o‘zi yuboradi: `credentials: "include"`)')
    if headers:
        rows.append(('Sarlavhalar', ', '.join(headers)))
    success = []
    for status, resp in op.get('responses', {}).items():
        if not status.startswith(('2', '3')):
            continue
        content = resp.get('content', {})
        desc = esc(resp.get('description', ''))
        if not content:
            success.append(f'`{status}`' + (f' — {desc}' if desc else (' — tana yo‘q' if status == '204' else '')))
            continue
        bodies = []
        for ct, c in content.items():
            sch = c.get('schema', {})
            if '$ref' in sch or sch.get('type') == 'array':
                bodies.append(typ(sch, False))
            elif sch.get('example') is not None:
                bodies.append(f'`{json.dumps(sch["example"], ensure_ascii=False)}`')
            else:
                bodies.append(f'`{ct}`')
        success.append(f'`{status}` → ' + ' yoki '.join(dict.fromkeys(bodies)) + (f' — {desc}' if desc else ''))
    if success:
        rows.append(('Javob', '; '.join(dict.fromkeys(success))))
    if o['key'] in EVENTS:
        rows.append(('Realtime', f'{EVENTS[o["key"]]} (COMMIT’dan keyin, do‘konning barcha ulanishlariga)'))
    if route.get('audit'):
        acts = [a for a in route['audit'] if a != '(serviceda)']
        rows.append(('Audit jurnali', 'ha' + (f' — {", ".join(f"`{a}`" for a in acts)}' if acts else '')))
    if route.get('throttle'):
        lim = re.search(r'ttl: ([\d_]+), limit: (\d+)', route['throttle'])
        if lim:
            ttl = int(lim.group(1).replace('_', '')) // 1000
            per = 'daqiqa' if ttl == 60 else ('soat' if ttl == 3600 else f'{ttl} s')
            rows.append(('Chegara', f'{lim.group(2)} ta / {per} (IP bo‘yicha), oshsa — 429'))
    if m in ('POST', 'PATCH', 'PUT', 'DELETE') and not route.get('public'):
        if route.get('readonly_ok'):
            rows.append(('Faqat-o‘qish do‘kon', 'ruxsat (to‘xtatilgan / o‘chirilayotgan do‘konda ham ishlaydi)'))
    out += ['| | |', '|---|---|'] + [f'| {k} | {v} |' for k, v in rows] + ['']

    params = [prm for prm in op.get('parameters', []) if prm['in'] in ('path', 'query')]
    if params:
        out += ['**Parametrlar**', '', '| Nomi | Joyi | Tip | Majburiy | Izoh |', '|---|---|---|:-:|---|']
        for prm in params:
            sch = prm.get('schema', {})
            desc = ' — '.join(x for x in [esc(prm.get('description', '')), constraints(sch)] if x)
            where = 'yo‘l' if prm['in'] == 'path' else 'query'
            out.append(f'| `{prm["name"]}` | {where} | {typ(sch, False)} | {"✔" if prm.get("required") else ""} | {desc} |')
        out.append('')

    for ct, c in op.get('requestBody', {}).get('content', {}).items():
        sch = c.get('schema', {})
        if '$ref' in sch:
            name = ref_name(sch)
            label = '' if ct == 'application/json' else f' (`{ct}`)'
            out += [f'**So‘rov tanasi** — {link(name, False)}{label}', ''] + fields_table(name, False, True) + ['']

    errors = []
    for status, resp in op.get('responses', {}).items():
        if status.startswith(('4', '5')):
            desc = code_ticks(esc(resp.get('description', ''))) or default_error(status)
            errors.append(f'| `{status}` | {desc} |')
    common = []
    has_input = bool(params) or 'requestBody' in op
    if has_input and not any(e.startswith('| `400`') for e in errors):
        common.append('400 `VALIDATION_FAILED`')
    if route.get('perm') and not any(e.startswith('| `403`') for e in errors):
        common.append('403 `PERMISSION_DENIED`')
    if ':id' in norm(path) and not any(e.startswith('| `404`') for e in errors):
        common.append('404 `NOT_FOUND`')
    if route.get('ifmatch'):
        common.append('409 `VERSION_CONFLICT` (`If-Match` eskirgan — javobda `current`)')
    if route.get('idem'):
        common.append('409 `IDEMPOTENCY_MISMATCH` (kalit boshqa tana bilan ishlatilgan)')
    if route.get('plan') and not any(e.startswith('| `402`') for e in errors):
        common.append('402 `PLAN_LIMIT_EXCEEDED`')
    if m in ('POST', 'PATCH', 'PUT', 'DELETE') and not route.get('public') and not route.get('readonly_ok'):
        common.append('423 `TENANT_READ_ONLY` (do‘kon to‘xtatilgan/o‘chirilmoqda)')
    if errors or common:
        out += ['**Xatolar**', '']
        if errors:
            out += ['| Status | Kod — qachon |', '|---|---|'] + errors + ['']
        if common:
            out += [f'Umumiy: {"; ".join(common)}.', '']
    out += ['[↑ Bo‘lim boshiga](#' + o['group'] + ')', '', '---', '']
    return out


# ───────────────────────────── endpoints.md
total = len(ops)
lines = [
    '# Endpointlar ma’lumotnomasi',
    '',
    '> **Generatsiya qilingan** — manba: `apps/api/openapi.json` (DTO, tavsif, xato kodlari) va controllerlar '
    '(huquq, idempotentlik, `If-Match`, audit). Tushuntirish va umumiy qoidalar — [README.md](README.md). '
    'Maydonlar tafsiloti — [schemas.md](schemas.md). Jonli versiya: Swagger UI `http://localhost:3000/api/docs`.',
    '',
    f'Jami **{total}** ta endpoint. Barcha yo‘llar `/api/v1` prefiksi bilan (bu yerda qisqartirilgan: '
    '`GET /products` = `GET /api/v1/products`); faqat `/health/*` prefiksiz.',
    '',
    '**Belgilar:** 🔓 — ochiq (token shart emas) · 🔁 — `Idempotency-Key` majburiy · 🔒 — `If-Match` (optimistik qulf) · '
    '💳 — tarif chegarasi (402) · 📡 — realtime hodisa yuboradi',
    '',
    '## Mundarija',
    '',
]
for key, title, _p, _i in GROUPS:
    if by_group.get(key):
        lines.append(f'- [{title}](#{key}) — {len(by_group[key])} ta')
lines.append('')

for key, title, _patterns, intro in GROUPS:
    group_ops = by_group.get(key, [])
    if not group_ops:
        continue
    lines += [f'<a id="{key}"></a>', '', f'## {title}', '', intro, '',
              '| Amal | Yo‘l | Nima uchun | Huquq |', '|---|---|---|---|']
    for o in group_ops:
        r = o['route'] or {}
        marks = ''.join([
            ' 🔓' if r.get('public') else '',
            ' 🔁' if r.get('idem') else '',
            ' 🔒' if r.get('ifmatch') else '',
            ' 💳' if r.get('plan') else '',
            ' 📡' if o['key'] in EVENTS else '',
        ])
        perm = r.get('perm')
        perm_cell = f'`{perm}`' if perm else ('ochiq' if r.get('public') else 'servisda / hamma')
        lines.append(f'| `{o["method"]}` | [`{o["key"][1]}`](#{op_anchor(o["method"], o["path"])}){marks} | '
                     f'{esc(o["op"].get("summary", ""))} | {perm_cell} |')
    lines.append('')
    for o in group_ops:
        lines += render_op(o)

open(OUT / 'endpoints.md', 'w', encoding='utf-8').write('\n'.join(lines).rstrip() + '\n')

# ───────────────────────────── schemas.md
names = sorted(S, key=str.lower)
lines = [
    '# Sxemalar (DTO) ma’lumotnomasi',
    '',
    '> **Generatsiya qilingan** — manba: `apps/api/openapi.json`. Endpointlar — [endpoints.md](endpoints.md), '
    'qoidalar — [README.md](README.md). TypeScript tiplari shu fayldan `openapi-typescript` bilan olinadi '
    '(README → Tiplar).',
    '',
    '**Ustunlar:** so‘rov DTO’sida «Majburiy» ✔ — yuborilishi shart; javob DTO’sida «Doim bor» ✔ — har doim keladi. '
    'Javobda ✔ bo‘lmagan maydon — rolga qarab yashirilishi mumkin (masalan `cost`, `wholesalePrice`, `stockValue` '
    'sotuvchiga chiqmaydi) yoki ixtiyoriy. `| null` — qiymat `null` bo‘lishi mumkin (maydon baribir keladi).',
    '',
    '**Birliklar:** barcha pul maydonlari — butun so‘m (`number`, tiyinsiz); miqdorlar — 3 kasr xonagacha; '
    '`date-time` — ISO 8601 (UTC, `Z`); sana (`YYYY-MM-DD`) — Toshkent kuni.',
    '',
    '## Mundarija',
    '',
    ' · '.join(f'[{n}](#{n.lower()})' for n in names),
    '',
]
request_names = {n for n, uses in used_in.items() if any(kind == 'so‘rov' for _o, kind in uses)}
for n in names:
    s = S[n]
    lines += [f'### {n}', '']
    if s.get('description'):
        lines += [esc(s['description']), '']
    uses = used_in.get(n, [])
    if uses:
        refs = [f'[`{o["method"]} {o["key"][1]}`](endpoints.md#{op_anchor(o["method"], o["path"])}) ({kind})'
                for o, kind in uses]
        lines += ['Ishlatiladi: ' + ', '.join(refs), '']
    lines += fields_table(n, True, n in request_names) + ['', '[↑ Mundarija](#mundarija)', '']

open(OUT / 'schemas.md', 'w', encoding='utf-8').write('\n'.join(lines).rstrip() + '\n')
print('endpoints:', total, 'schemas:', len(names))
missing_notes = [o['key'] for o in ops if o['key'] not in NOTES]
print('izohsiz:', len(missing_notes))
for k in missing_notes:
    print('  ', k)
