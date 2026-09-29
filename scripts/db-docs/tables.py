"""Ma'lumotlar bazasi hujjati uchun QO'LDA yoziladigan qism: guruhlar va har jadval vazifasi.

Tuzilma (ustunlar, turlar, bog'lanishlar) bazadan o'qiladi — bu yerda faqat "nima uchun".
Yangi jadval qo'shilsa: `GROUPS` ga va `TABLES` ga yozing, aks holda generator xato beradi.
"""

# (kalit, sarlavha, kirish matni, jadvallar)
GROUPS = [
    ('tenant', "Do'kon va kirish", (
        "Har bir do'kon (SaaS mijozi) — `tenants` dagi bitta qator. Boshqa barcha jadvallarda `tenant_id` "
        "bor va shu do'konga tegishli. Xodim — shaxs, foydalanuvchi — uning kirish hisobi."),
     ['tenants', 'tenant_state', 'settings', 'employees', 'users', 'refresh_tokens', 'doc_counters',
      'idempotency_keys', 'audit_log']),
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
    ('billing', 'Obuna (billing)', "Tarif to'lovlari (Payme, Click).", ['billing_invoices']),
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
        "`deleting` — o'chirish so'ralgan, 30 kun muhlat) va o'chirish rejasi. RLS yo'q: login va ro'yxatdan "
        "o'tishda do'kon hali ma'lum emas."),
    'tenant_state': (
        "Do'konning tez o'zgaradigan joriy holati — bitta qator: kassadagi naqd (`cash_balance`), ochiq smena, "
        "joriy ombor, S3'da band hajm, hisobotning \"eskirgan\" belgisi. Sozlamalardan ataylab ajratilgan: "
        "sozlama keshlanadi, holat esa har sotuvda o'zgaradi."),
    'settings': (
        "Do'kon sozlamalari — bitta qator: nom, valyuta, QQS, ulgurji savdo (va sotuvchiga ulgurji), sodiqlik "
        "ballari, maksimal chegirma, chekdagi telefon, manzil va pastki matn, boshlang'ich sozlash tugaganmi."),
    'employees': (
        "Xodim — shaxs haqidagi yagona manba: ism, lavozim, telefon, maosh, holat. Kirish hisobi bo'lmasligi "
        "ham mumkin (masalan haydovchi). Hujjatlarda sotuvchi, mas'ul va haydovchi sifatida ishtirok etadi."),
    'users': (
        "Tizimga kirish hisobi — doim bitta xodimga tegishli (ism va lavozim `employees` da). Email (do'kon "
        "ichida noyob), argon2id parol xeshi, rol (`admin`, `manager`, `sotuvchi`, `omborchi`), faollik."),
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
        "ballari, nasiya limiti va to'lov muddati."),
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
        "SMS xabar (kampaniya): kimga (bitta mijoz, guruh, qarzdorlar, hamma), matn yoki shablon, qabul "
        "qiluvchilar soni, umumiy holat."),
    'message_recipients': (
        "Xabarning har bir qabul qiluvchisi — yuborish navbati: telefon, shaxsiylashtirilgan matn, holat, "
        "urinishlar, provayder ID'si, xato."),
    'files': (
        "S3 (R2) dagi fayllar metama'lumoti: tur (mahsulot rasmi, hujjat, eksport, import, zaxira …), kalit, "
        "hajm, SHA-256 (takror yuklashni aniqlash), holat (`pending` — yuklanmoqda, `ready`, `quarantined`), "
        "rasm variantlari. Faylning o'zi S3'da."),
    'exports': (
        "Fonda tayyorlanadigan katta eksportlar (CSV/JSON): kim so'radi, qaysi ro'yxat, filtrlar, holat, "
        "qatorlar soni, natija fayli. Faqat so'rovchining o'zi ko'radi."),
    'billing_invoices': (
        "Obuna hisob-fakturalari (tarif × oy): holat va to'lov provayderi (Payme, Click) tranzaksiyasi. Tarif "
        "faqat `paid` bo'lganda uzayadi."),
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
