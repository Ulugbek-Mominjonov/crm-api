"""Ma'lumotlar bazasi hujjati uchun QO'LDA yoziladigan qism: guruhlar va har jadval vazifasi.

Tuzilma (ustunlar, turlar, bog'lanishlar) bazadan o'qiladi — bu yerda faqat "nima uchun".
Yangi jadval qo'shilsa: `GROUPS` ga va `TABLES` ga yozing, aks holda generator xato beradi.
"""

# (kalit, sarlavha, kirish matni, jadvallar)
GROUPS = [
    ('tenant', "Do'kon va kirish", (
        "Har bir do'kon (SaaS mijozi) — `tenants` dagi bitta qator. Boshqa barcha jadvallarda `tenant_id` "
        "bor va shu do'konga tegishli. Xodim — shaxs, foydalanuvchi — uning kirish hisobi."),
     ['tenants', 'tenant_state', 'settings', 'employees', 'users', 'roles', 'refresh_tokens', 'doc_counters',
      'idempotency_keys', 'audit_log', 'tenant_requests', 'tenant_request_messages']),
    ('catalog', 'Katalog va ombor', (
        "Mahsulotlar, kategoriyalar va omborlar. Qoldiq ombor bo'yicha `product_stocks` da, har bir "
        "o'zgarish — `stock_movements` jurnalida (faqat qo'shiladi)."),
     ['categories', 'products', 'warehouses', 'product_stocks', 'stock_movements']),
    ('sales', 'Savdo, kassa va mijozlar', (
        "Chek (sotuv va qaytarish), uning qatorlari, nasiya to'lovlari, kassa smenalari, takliflar, "
        "yetkazib berish va fiskal cheklar."),
     ['clients', 'sales', 'sale_items', 'debt_payments', 'cash_shifts', 'cash_movements', 'quotes',
      'quote_items', 'deliveries', 'fiscal_receipts']),
    ('purchase', "Xarid va ta'minotchilar", (
        "Ta'minotchidan kirim buyurtmasi, qabul qilish va to'lov."),
     ['suppliers', 'purchase_orders', 'po_items', 'supplier_payments']),
    ('expenses', 'Xarajatlar', "Bir martalik va takrorlanuvchi (shablon) xarajatlar.",
     ['expenses', 'expense_templates']),
    ('comms', 'Xabarlar, fayllar va eksport', (
        "SMS yuborish navbati, S3 (R2) dagi fayllar metama'lumoti va fonda tayyorlanadigan eksportlar."),
     ['messages', 'message_recipients', 'files', 'exports']),
    ('billing', 'Obuna (billing)', "Tarif to'lovlari (Payme, Click) va egasi qo'lda yozgan to'lovlar.", ['billing_invoices']),
    ('platform', 'Platforma egasi paneli', (
        "Do'konlar ustidan nazorat (T-135): egasi hisobi do'kon hisoblaridan alohida, uning sessiyalari va "
        "amallari jurnali global (RLS'siz). Tenantlararo o'qish — faqat `platform_*` SECURITY DEFINER funksiyalar orqali. "
        "Operatorlar, TOTP, egasining Telegram'i va platforma sozlamasi — T-137…T-139."),
     ['platform_admins', 'platform_refresh_tokens', 'platform_audit_log', 'platform_settings']),
    ('reports', 'Hisobot yordamchilari', (
        "Hisobotlar tez ishlashi uchun materiallashgan ko'rinishlar va ularning yangilanish holati "
        "(ko'rinishlar — pastdagi alohida bo'limda)."),
     ['report_refresh_state']),
    ('service', 'Xizmat jadvali', "Migratsiya vositasi (Prisma) jadvali.", ['_prisma_migrations']),
]

TABLES = {
    'tenants': (
        "Do'kon — tizimdagi eng yuqori birlik; boshqa jadvallardagi `tenant_id` shunga ishora qiladi. Tarif "
        "(`plan`, `plan_expires_at`), holat (`active`; `suspended` — muddati o'tgan: o'qish bor, yozish yo'q; "
        "`blocked` — platforma egasi to'xtatgan, to'lov ochmaydi; `deleting` — o'chirish so'ralgan, 30 kun muhlat) "
        "va o'chirish rejasi. Egasi bloki (`blocked_at`, `blocked_reason`) holatdan alohida saqlanadi — o'chirishdan "
        "qaytganda ham qoladi; `notes` — egasi izohi (do'kon ko'rmaydi). RLS yo'q: login va ro'yxatdan "
        "o'tishda do'kon hali ma'lum emas."),
    'tenant_state': (
        "Do'konning tez o'zgaradigan joriy holati — bitta qator: kassadagi naqd (`cash_balance`), ochiq smena, "
        "joriy ombor, S3'da band hajm, hisobotning \"eskirgan\" belgisi. Sozlamalardan ataylab ajratilgan: "
        "sozlama keshlanadi, holat esa har sotuvda o'zgaradi."),
    'settings': (
        "Do'kon sozlamalari — bitta qator: nom, valyuta, QQS, ulgurji savdo (va sotuvchiga ulgurji), sodiqlik "
        "ballari, maksimal chegirma, chekdagi telefon, manzil va pastki matn, boshlang'ich sozlash tugaganmi, "
        "brend (asosiy rang va logotip — `files` ga havola)."),
    'employees': (
        "Xodim — shaxs haqidagi yagona manba: ism, lavozim, telefon, maosh, holat. Kirish hisobi bo'lmasligi "
        "ham mumkin (masalan haydovchi). Hujjatlarda sotuvchi, mas'ul va haydovchi sifatida ishtirok etadi."),
    'users': (
        "Tizimga kirish hisobi — doim bitta xodimga tegishli (ism va lavozim `employees` da). Email (do'kon "
        "ichida noyob), argon2id parol xeshi, rol (`admin`, `manager`, `sotuvchi`, `omborchi`), faollik."),
    'roles': (
        "Do'kon rollari (T-134): 4 ta tizim roli (`key` — `admin`, `manager`, `sotuvchi`, `omborchi`; sukut ruxsatlari "
        "avvalgi matritsa bilan bir xil) va do'kon yaratgan rollar (`key` bo'sh). `permissions` — `bo'lim.amal` "
        "ro'yxati; `admin` ruxsatlari saqlanmaydi (doim hammasi). Nom do'kon ichida noyob (harf farqsiz)."),
    'refresh_tokens': (
        "Sessiyalar: refresh token'ning o'zi emas, SHA-256 xeshi; rotatsiya zanjiri (`parent_id`). Eski "
        "token qayta ishlatilsa — o'g'irlik belgisi, barcha sessiyalar yopiladi. RLS yo'q: refresh paytida "
        "do'kon foydalanuvchi orqali topiladi."),
    'doc_counters': (
        "Hujjat raqamlari hisoblagichi: har do'kon va prefiks (CHEK, QAYT, BUY, TKLF …) uchun oxirgi raqam. "
        "Bir vaqtdagi sotuvlarda ham raqam takrorlanmaydi (qator qulfi)."),
    'idempotency_keys': (
        "Takroriy so'rovdan himoya: `Idempotency-Key` bilan kelgan amalning javobi saqlanadi. Internet uzilib "
        "so'rov qayta yuborilsa, amal ikkinchi marta bajarilmaydi — o'sha javob qaytadi. Eskilari tunda "
        "tozalanadi."),
    'audit_log': (
        "Amallar jurnali: kim, qachon, nima qildi, o'zgarish farqi (`diff`). FAQAT qo'shiladi — UPDATE va "
        "DELETE trigger bilan taqiqlangan (faqat do'konni butunlay o'chirishda tozalanadi)."),
    'categories': "Mahsulot kategoriyalari (do'kon ichida nomi noyob), tartib raqami; yumshoq o'chiriladi.",
    'products': (
        "Mahsulot katalogi: nom, SKU (noyob), shtrix-kod, birlik va qo'shimcha birlik (1 qop = 50 kg), chakana "
        "va ulgurji narx, o'rtacha tannarx, minimal qoldiq, rasm. `stock` — barcha omborlardagi jami qoldiq: "
        "uni trigger yozadi, ilova kodi emas."),
    'warehouses': (
        "Omborlar (do'kon zali, sklad …). Bittasi sukut ombor — uni arxivlab bo'lmaydi; qolganlari "
        "arxivlanadi, o'chirilmaydi."),
    'product_stocks': (
        "Qoldiqning omborlar bo'yicha taqsimoti (mahsulot × ombor). O'zgarganda trigger "
        "`products.stock` ni qayta hisoblaydi."),
    'stock_movements': (
        "Ombor harakatlari jurnali: kirim, hisobdan chiqarish, inventarizatsiya, sotuv, qaytarish, ko'chirish. "
        "Har yozuvda ishorali miqdor va shu ombordagi keyingi qoldiq. FAQAT qo'shiladi (trigger) — qoldiq "
        "tarixi o'zgarmaydi. `ref_id` — bog'liq hujjat (sotuv, buyurtma)."),
    'clients': (
        "Mijozlar: jismoniy yoki yuridik, guruh (chakana, ulgurji, VIP), holat (lid, faol, nofaol), sodiqlik "
        "ballari, nasiya limiti va to'lov muddati. Telegram botga ulangan bo'lsa (`telegram_chat_id`, shaxsiy "
        "havola orqali) — xabar va chek Telegram'ga."),
    'sales': (
        "Chek — sotuv yoki qaytarish (`type`): raqam, mijoz, sotuvchi, ombor, smena, narx turi, summalar "
        "(oraliq, chegirma, QQS, yetkazish, jami), to'lov taqsimoti (naqd, karta, o'tkazma), keyin qarzdan "
        "to'langan, qaytim, bonus. `outstanding` — qolgan qarz, bazaning o'zi hisoblaydi (GENERATED). Holat: "
        "`completed`, `pending` (nasiya), `cancelled`. Qaytarish `related_sale_id` bilan asl chekka bog'lanadi. "
        "Chek o'chirilmaydi — bekor qilinadi."),
    'sale_items': (
        "Chek qatorlari: mahsulot, sotuv birligi va miqdori, asosiy birlikdagi miqdor (ombordan shu bo'yicha "
        "chiqadi), narx, tannarx va nom — sotuv paytidagi nusxa: mahsulot keyin o'zgarsa ham chek o'zgarmaydi. "
        "Qaytarish qatori `return_of_id` bilan asl qatorga ishora qiladi."),
    'debt_payments': (
        "Nasiya (qarz) to'lovlari: qaysi chek, mijoz, summa, usul (naqd yoki bank), smena. Chekdagi "
        "`debt_paid` — shu yozuvlar yig'indisi."),
    'cash_shifts': (
        "Kassa smenalari: ochilish qoldig'i, kirim va chiqim, yopilishda kutilgan va sanalgan summa, farq. "
        "Do'konda bir vaqtda bitta ochiq smena."),
    'cash_movements': "Kassaga sotuvdan tashqari naqd kirim yoki chiqim (maydalash, egasi olib ketdi …) — smenaga bog'liq.",
    'quotes': (
        "Takliflar (smeta): mijoz, mas'ul xodim, summalar, amal qilish muddati, holat. Sotuvga aylantirilganda "
        "`sale_id` bir marta to'ldiriladi."),
    'quote_items': "Taklif qatorlari — chek qatorlari bilan bir xil tuzilma (narx va tannarx nusxasi).",
    'deliveries': (
        "Yetkazib berish: chekka bog'langan yoki mustaqil; manzil, telefon, haydovchi (xodim), sana, holat, "
        "koordinata. Chekka bog'langan yetkazish narxi chekda (`sales.delivery_fee`), mustaqilniki — "
        "`standalone_fee`."),
    'fiscal_receipts': (
        "Fiskal chek navbati — har sotuvga bittadan: OFD'ga yuborish holati, urinishlar, fiskal raqam va QR. "
        "Chek bilan bir tranzaksiyada navbatga qo'yiladi, OFD'ga keyin yuboriladi — sotuv kutib qolmaydi."),
    'suppliers': "Ta'minotchilar: aloqa ma'lumotlari, INN, to'lov muddati.",
    'purchase_orders': (
        "Kirim buyurtmalari: raqam, ta'minotchi, ombor, jami, to'langan, qabul qilingan tovar qiymati, holat "
        "(`ordered`, `partial`, `received`, `cancelled`). `outstanding` — ta'minotchiga qarz, bazaning o'zi "
        "hisoblaydi (GENERATED)."),
    'po_items': (
        "Buyurtma qatorlari: mahsulot, buyurtma qilingan va haqiqatda qabul qilingan miqdor (buyurtmadan "
        "oshmaydi), tannarx."),
    'supplier_payments': "Ta'minotchiga to'lovlar — buyurtma bo'yicha; buyurtmaning `paid` maydoni shu yozuvlar yig'indisi.",
    'expenses': (
        "Xarajatlar: kategoriya (ijara, kommunal, maosh, transport, soliq, boshqa), summa, usul (kassadan naqd "
        "yoki bank), sana. Shablondan avtomatik yaratilgan bo'lishi mumkin (`template_id`)."),
    'expense_templates': (
        "Takrorlanuvchi xarajat shablonlari (oylik yoki haftalik, qaysi kuni). Tungi ish muddati kelganini "
        "yaratadi; `last_run_key` bir davrda ikki marta yaratilmasligini kafolatlaydi."),
    'messages': (
        "Xabar (kampaniya): kimga (bitta mijoz, guruh, qarzdorlar, hamma), matn yoki shablon, qabul "
        "qiluvchilar soni (shundan Telegram orqali), umumiy holat."),
    'message_recipients': (
        "Xabarning har bir qabul qiluvchisi — yuborish navbati: kanal (SMS yoki Telegram), telefon yoki chat, "
        "shaxsiylashtirilgan matn, holat, urinishlar, provayder ID'si, xato."),
    'files': (
        "S3 (R2) dagi fayllar metama'lumoti: tur (mahsulot rasmi, do'kon logotipi, hujjat, eksport, import, zaxira …), kalit, "
        "hajm, SHA-256 (takror yuklashni aniqlash), holat (`pending` — yuklanmoqda, `ready`, `quarantined`), "
        "rasm variantlari. Faylning o'zi S3'da."),
    'exports': (
        "Fonda tayyorlanadigan katta eksportlar (CSV/JSON): kim so'radi, qaysi ro'yxat, filtrlar, holat, "
        "qatorlar soni, natija fayli. Faqat so'rovchining o'zi ko'radi."),
    'billing_invoices': (
        "Obuna hisob-fakturalari (tarif × oy): holat va to'lov provayderi (Payme, Click) tranzaksiyasi; egasi qo'lda "
        "yozgan to'lov ham shu yerda (`provider` — `cash`, `transfer`, `bonus`; `platform_admin_id`, `note`, summa 0 "
        "bo'lishi mumkin). Tarif faqat `paid` bo'lganda uzayadi."),
    'platform_admins': (
        "Platforma egasi hisoblari: email, parol xeshi (argon2id), faollik, rol (`owner` — hammasi; `operator` — do'konni "
        "o'chira olmaydi, hisob va sozlamani boshqarmaydi). Birinchisi `PLATFORM_OWNER_EMAIL` bilan ishga tushishda "
        "yaratiladi. Ikki bosqichli kirish: `totp_secret` (base32), `totp_enabled_at` (bo'sh — sozlash tasdiqlanmagan), "
        "`totp_last_step` (oxirgi ishlatilgan 30 s qadam — kod bir martalik). Telegram: `telegram_chat_id` (xabarlar shu "
        "chatga), havola xeshi va muddati (mijozlar kabi shaxsiy havola). Tenantga bog'lanmaydi — tokeni do'kon yo'llarida o'tmaydi."),
    'platform_settings': (
        "Platforma sozlamasi — BITTA qator (`id = 1`, CHECK): `registration_mode` — `open` (har kim do'kon ochadi) yoki "
        "`closed` (`POST /tenants/register` 403, do'konni faqat egasi paneli ochadi); egasining aloqasi (`support_phone`, "
        "`support_telegram`, `support_hours` — do'kon ilovasida bannerda va murojaat oynasida, T-140); kim va qachon o'zgartirgan. "
        "Env emas — egasi panelidan qayta ishga tushirishsiz o'zgaradi."),
    'tenant_requests': (
        "Do'konning platforma egasiga murojaati (T-140): bloklangan do'kon administratori tizim ichidan yozadi, egasi "
        "panelidan javob beradi. `type` — `unblock` (blokdan chiqarish), `billing` (to'lov), `other`; `status` — `open` "
        "(do'kon yozdi, egasi javobini kutadi), `answered` (egasi javob berdi), `closed` (yopilgan). Bir do'konda bir vaqtda "
        "bitta yopilmagan murojaat (qisman noyob indeks `status <> 'closed'`). Egasi tenantlararo ro'yxatni "
        "`platform_requests()` orqali o'qiydi, javobni do'kon tranzaksiyasida yozadi."),
    'tenant_request_messages': (
        "Murojaat xabarlari (ikkala tomon): `author` — `store` (do'kon administratori) yoki `platform` (egasi/operator), "
        "`author_name` — yozilgan paytdagi ism (hisob o'chsa ham qoladi). Do'kon 24 soatda 5 ta xabar yozadi (chegara "
        "`author = 'store'` bo'yicha indeks bilan sanaladi)."),
    'platform_refresh_tokens': (
        "Egasi sessiyalari: `refresh_tokens` bilan bir xil qoida (xesh, rotatsiya zanjiri, bekor qilinganini qayta "
        "ishlatish — barcha sessiyalar yopiladi), lekin o'z jadvalida — do'kon sessiyalari bilan aralashmaydi."),
    'platform_audit_log': (
        "Egasi amallari jurnali (faqat qo'shiladi): kim (`admin_id`, bootstrap'da bo'sh), nima (`action`: "
        "`tenant.block`, `tenant.plan`, `user.resetPassword` …), qaysi do'kon (`target_tenant_id` — FK emas: do'kon "
        "to'liq o'chirilgach ham tarix qoladi), tafsilot (`diff`)."),
    'report_refresh_state': (
        "Hisobot ko'rinishlari oxirgi marta qachon yangilangani (bitta qator). Hisobot shu kundan oldingisini "
        "materiallashgan ko'rinishdan, qolganini jonli ko'rinishdan oladi."),
    '_prisma_migrations': "Prisma migratsiyalar tarixi: qaysi migratsiya qachon qo'llangani. Qo'lda o'zgartirilmaydi.",
}

VIEWS = {
    'client_balances': (
        "Mijozlar qarzi: ochiq cheklar bo'yicha qolgan qarz yig'indisi. Jonli (materiallashtirilmagan) — qarz "
        "tez o'zgaradi; RLS qo'llanadi (`security_invoker`)."),
    'daily_sales_live': (
        "Kunlik savdo agregati (tushum, tannarx, qaytarish …) — yagona ta'rif. Bugungi kun va tekshiruvlar "
        "uchun jonli."),
    'daily_product_sales_live': "Kunlik mahsulot savdosi (top mahsulotlar, ABC tahlil, sotilmayotgan tovar) — jonli.",
    'daily_sales_summary': "`daily_sales_live` ning har kecha yangilanadigan nusxasi — o'tgan kunlar hisoboti tez chiqadi.",
    'daily_product_sales': "`daily_product_sales_live` ning har kecha yangilanadigan nusxasi.",
    'tenant_daily_sales': (
        "Materiallashgan ko'rinishga RLS qo'llab bo'lmaydi — ilova `daily_sales_summary` ni faqat shu ko'rinish "
        "orqali o'qiydi: u joriy do'kon bilan filtrlaydi (`security_barrier`)."),
    'tenant_daily_products': "`daily_product_sales` uchun xuddi shunday — joriy do'kon bilan filtrlaydi.",
}

# Enum qiymatlarining ma'nosi (faqat nomidan tushunarli bo'lmaganlari)
ENUM_LABELS = {
    'MovementType': {
        'intake': 'kirim', 'writeoff': 'hisobdan chiqarish', 'adjustment': 'inventarizatsiya', 'sale': 'sotuv',
        'return': 'qaytarish', 'transfer_out': "boshqa omborga ko'chirish (chiqim)",
        'transfer_in': "boshqa ombordan ko'chirish (kirim)",
    },
    'SaleStatus': {'completed': "to'langan", 'pending': 'nasiya (qarz bor)', 'cancelled': 'bekor qilingan'},
    'POStatus': {'ordered': 'buyurtma berildi', 'partial': 'qisman qabul qilindi', 'received': 'qabul qilindi',
                 'cancelled': 'bekor qilindi'},
    'QuoteStatus': {'draft': 'qoralama', 'sent': 'yuborildi', 'accepted': 'qabul qilindi',
                    'rejected': 'rad etildi', 'converted': 'sotuvga aylantirildi'},
    'DeliveryStatus': {'pending': 'kutilmoqda', 'on_way': "yo'lda", 'delivered': 'yetkazildi',
                       'cancelled': 'bekor qilindi'},
    'FiscalStatus': {'pending': 'navbatda', 'sent': 'yuborildi', 'confirmed': 'tasdiqlandi', 'failed': 'rad etildi'},
    'InvoiceState': {'created': 'yaratildi', 'pending': "to'lov kutilmoqda", 'paid': "to'landi",
                     'cancelled': 'bekor qilindi'},
    'FileStatus': {'pending': 'yuklanmoqda', 'ready': 'tayyor', 'quarantined': 'karantin (tekshiruvdan o\'tmadi)'},
    'ClientStatus': {'lead': "potensial mijoz", 'active': 'faol', 'inactive': 'nofaol'},
    'EmployeeStatus': {'active': 'ishlayapti', 'on_leave': "ta'tilda", 'fired': "bo'shatilgan"},
    'PayMethod': {'cash': 'naqd', 'bank': "bank (karta, o'tkazma)"},
    'CashDirection': {'in': 'kirim', 'out': 'chiqim'},
    'PriceTier': {'retail': 'chakana', 'wholesale': 'ulgurji'},
    'CustomerGroup': {'retail': 'chakana', 'wholesale': 'ulgurji', 'vip': 'VIP'},
    'ExportStatus': {'queued': 'navbatda', 'running': 'tayyorlanmoqda', 'ready': 'tayyor', 'failed': 'xato'},
}

# Umumiy ustunlar izohi — schema.prisma da `///` izoh bo'lmaganda (ustun nomi bo'yicha)
COLUMNS = {
    'id': 'Yozuv identifikatori (UUID v7)',
    'created_at': 'Yaratilgan vaqt',
    'updated_at': "Oxirgi o'zgarish vaqti — versiya (`If-Match`)",
    'deleted_at': "Yumshoq o'chirilgan vaqt; bo'sh — faol",
    'cancelled_at': 'Bekor qilingan vaqt',
    'archived': "Arxivlangan — ro'yxatlarda yashiriladi, o'chirilmaydi",
    'number': "Hujjat raqami (CHEK-1001 …) — do'kon ichida noyob",
    'name': 'Nomi',
    'phone': 'Telefon',
    'email': 'Email',
    'address': 'Manzil',
    'note': 'Izoh',
    'notes': 'Izoh',
    'date': 'Hujjat sanasi',
    'due_date': "To'lov muddati",
    'status': 'Holat (qiymatlari — Enumlar bo\'limida)',
    'type': 'Turi',
    'user_id': "Amalni bajargan foydalanuvchi (FK'siz — tarix buzilmasin)",
    'amount': "Summa (so'm)",
    'method': "To'lov usuli: naqd yoki bank",
    'subtotal': "Chegirma va QQS'gacha summa",
    'discount': "Chegirma (so'm)",
    'tax_rate': 'QQS foizi',
    'tax': "QQS summasi (so'm)",
    'total': "Jami summa (so'm)",
    'qty': 'Miqdor',
    'price': "Narx (so'm)",
    'cost': "Tannarx (so'm)",
    'line_no': 'Qator tartib raqami',
    'sort_order': "Ro'yxatdagi tartib",
    'paid_card': "Karta bilan to'langan",
    'paid_transfer': "O'tkazma bilan to'langan",
    'change': 'Qaytim',
    'bonus_earned': 'Berilgan sodiqlik ballari',
    'price_tier': 'Narx turi: chakana yoki ulgurji',
    'unit': "O'lchov birligi",
    'shift_id': 'Kassa smenasi',
    'warehouse_id': 'Ombor',
    'customer_id': 'Mijoz',
    'seller_id': "Sotuvchi / mas'ul xodim",
    'supplier_id': "Ta'minotchi",
    'product_id': 'Mahsulot',
    'sale_id': 'Chek',
    'attempts': "Yuborish urinishlari soni",
    'next_attempt_at': 'Keyingi urinish vaqti',
    'opened_at': 'Ochilgan vaqt',
    'closed_at': 'Yopilgan vaqt',
    'plan': 'Tarif',
    'months': 'Necha oyga',
    'valid_until': 'Amal qilish muddati',
    'received_date': 'Qabul qilingan sana',
    'scheduled_date': 'Yetkazish sanasi',
    'delivered_at': 'Yetkazilgan vaqt',
    'expires_at': 'Amal qilish muddati',
    'revoked_at': 'Bekor qilingan (chiqilgan) vaqt',
    'last_login_at': 'Oxirgi kirish vaqti',
    'is_active': 'Faol (kira oladi)',
    'salary': "Maosh (so'm)",
    'position': 'Lavozim',
    'hired_at': 'Ishga olingan sana',
    'tin': 'INN (soliq raqami)',
    'contact_person': "Mas'ul shaxs",
    'source': 'Qayerdan kelgan (reklama, tanish …)',
    'company': 'Kompaniya nomi',
    'group': 'Mijoz guruhi: chakana, ulgurji, VIP',
    'barcode': 'Shtrix-kod',
    'sku': "Artikul — do'kon ichida noyob",
    'wholesale_price': "Ulgurji narx (so'm)",
    'min_stock': "Minimal qoldiq — kamayganda ogohlantirish",
    'category_id': 'Kategoriya',
    'direction': 'Kirim yoki chiqim',
    'reason': 'Sabab',
    'period': 'Takrorlanish: oylik yoki haftalik',
    'active': 'Faol',
    'category': 'Xarajat turi',
    'order_id': 'Kirim buyurtmasi',
    'po_id': 'Kirim buyurtmasi',
    'quote_id': 'Taklif',
    'message_id': 'Xabar',
    'client_id': "Mijoz (FK'siz)",
    'driver_id': 'Haydovchi (xodim)',
    'lat': 'Kenglik (xarita)',
    'lng': 'Uzunlik (xarita)',
    'error': 'Xato matni',
    'sent_at': 'Yuborilgan vaqt',
    'provider_id': 'Provayderdagi xabar ID',
    'text': 'Matn',
    'template': 'Shablon',
    'recipients': 'Qabul qiluvchilar soni',
    'recipient_label': "Qabul qiluvchi (ko'rinadigan nom)",
    'target': 'Kimga: bitta mijoz, guruh, qarzdorlar, hamma',
    'action': "Amal (masalan `sale.create`)",
    'request_id': 'Murojaat',
    'min_margin_pct': "Minimal marja, %: minimal narx = tannarx × (1 + shu/100); undan past sotish faqat `sales.belowCost` bilan",
    'author': "Kim yozdi: `store` — do'kon administratori, `platform` — egasi yoki operator",
    'author_name': "Yozilgan paytdagi ism",
    'body': 'Xabar matni',
    'last_message_at': "So'nggi xabar vaqti (ikkala tomondan)",
    'support_phone': "Egasining telefoni (ko'rsatish uchun)",
    'support_telegram': "Egasining Telegram foydalanuvchi nomi (`@`siz)",
    'support_hours': 'Egasining ish vaqti (erkin matn)',
    'detail': 'Tafsilot',
    'entity_type': "Qaysi obyekt turi",
    'entity_id': "Qaysi obyekt",
    'ip': 'IP manzil',
    'user_agent': 'Brauzer / qurilma',
    'bucket': 'S3 bucket',
    'mime': 'Fayl turi (MIME)',
    'size_bytes': 'Hajm (bayt)',
    'original_name': 'Asl fayl nomi',
    'uploaded_by_id': 'Yuklagan foydalanuvchi',
    'resource': "Qaysi ro'yxat (products, sales …)",
    'format': 'CSV yoki JSON',
    'row_count': 'Qatorlar soni',
    'file_id': 'Natija fayli',
    'finished_at': 'Tugagan vaqt',
    'state': 'Holat',
    'provider': "To'lov provayderi (payme, click)",
    'provider_tx_id': 'Provayder tranzaksiya ID',
    'provider_time': 'Provayder vaqti (ms)',
    'created_by_id': 'Yaratgan foydalanuvchi',
    'paid_at': "To'langan vaqt",
    'cancel_reason': 'Bekor qilish sababi (provayder kodi)',
    'last_error': 'Oxirgi xato',
    'fiscalized_at': 'Fiskallashtirilgan vaqt',
    'kind': 'Fayl turi',
    'prefix': 'Hujjat prefiksi (CHEK, QAYT, BUY …)',
    'last_no': 'Oxirgi berilgan raqam',
    'key': 'Kalit',
    'endpoint': "Qaysi so'rov (metod + yo'l)",
    'response': 'Saqlangan javob',
    'store_name': "Do'kon nomi (chekda)",
    'currency': 'Valyuta',
    'tax_enabled': 'QQS yoqilgan',
    'wholesale_enabled': 'Ulgurji savdo yoqilgan',
    'loyalty_enabled': 'Sodiqlik ballari yoqilgan',
    'loyalty_rate': 'Sotuvdan necha foiz ball beriladi',
    'max_discount_pct': 'Ruxsat etilgan maksimal chegirma (%)',
    'receipt_phone': 'Chekdagi telefon',
    'receipt_address': 'Chekdagi manzil',
    'receipt_footer': 'Chek pastidagi matn',
    'onboarded': "Boshlang'ich sozlash tugagan",
    'role': 'Rol: admin, manager, sotuvchi, omborchi',
    'employee_id': 'Xodim (kirish hisobi egasi)',
    'active_shift_id': 'Hozir ochiq smena',
    'active_warehouse_id': 'Joriy (sukut) ombor',
    'refreshed_at': 'Hisobot oxirgi yangilangan vaqt',
    'expected_balance': "Yopilishda kutilgan naqd",
    'counted_balance': 'Yopilishda sanalgan naqd',
    'difference': 'Farq (sanalgan − kutilgan)',
    'opening_balance': 'Ochilishdagi naqd',
    'cash_in': 'Smenadagi naqd kirim',
    'cash_out': 'Smenadagi naqd chiqim',
    'day_of_period': 'Davrning qaysi kuni',
    'template_id': 'Shablon',
    'image_file_id': 'Mahsulot rasmi (fayl)',
    'alt_factor': "Qo'shimcha birlik koeffitsiyenti",
    'received_qty': 'Qabul qilingan miqdor',
    'base_qty': 'Asosiy birlikdagi miqdor',
    'stock': 'Jami qoldiq',
    'is_default': 'Sukut ombor',
    'storage_used_bytes': 'S3 da band hajm',
    'payment_term_days': "To'lov muddati (kun)",
    'report_dirty_at': "Hisobot qachon eskirgan deb belgilangan",
    'unit_cost': "Kirimdagi birlik tannarxi (so'm)",
    'migration_name': 'Migratsiya nomi',
    'checksum': "Migratsiya fayli nazorat yig'indisi",
    'started_at': 'Boshlangan vaqt',
    'logs': 'Xato logi (muvaffaqiyatsiz bo\'lsa)',
    'rolled_back_at': 'Orqaga qaytarilgan vaqt',
    'applied_steps_count': 'Bajarilgan qadamlar soni',
}
