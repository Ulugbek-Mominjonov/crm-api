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

Frontend (`/home/ulugbek/personal/front/crm-qurilish`) — **alohida frontend dasturchi** bajaradi
(E13, T-112, T-113, T-119); bu repodan frontendga o'zgartirish kiritilmaydi. Unga qo'llanma —
[`docs/api/`](./docs/api/README.md): README qo'lda yozilgan, `endpoints.md`/`schemas.md` —
`apps/api/openapi.json` dan generatsiya. Backend DTO o'zgarsa: `npm run build -w @crm/api &&
npm run openapi -w @crm/api` va `docs/api` ni yangilash.

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
| C6 | T-041: oxirgi admin — **422** `LAST_ADMIN`, rejadagi 409 emas | API shartnomasi (04 §4.1) va xato katalogi 422 ni belgilaydi; ishchi PLAN nusxasi tuzatildi (12 §12.9 #7: avval hujjat) |
| C7 | T-038: import **qoldiqsiz** — `stock` maydoni qator xatosi beradi | Qoldiq faqat ombor amallari orqali (T-037 mezoni, I1/I11). Boshlang'ich qoldiq — import'dan keyin `POST /stock/intake` (yoki E14 migratsiya importi) |
| C8 | T-045 yetmagan qoldiq — **422** `STOCK_INSUFFICIENT` (rejada 409); T-047 bir xil ombor — **422** `WAREHOUSE_SAME` (rejada 400) | Xato katalogi (04 §4.1) ikkalasini 422 deb belgilaydi: biznes qoidasi, so'rov shakli emas. PLAN nusxasi tuzatildi (C6 kabi) |
| C9 | T-044…T-047 testlari bitta `stock-operations.e2e-spec.ts` da | Umumiy fixture (2 ombor, rollar); PLAN'dagi `stock-intake`/`stock-writeoff`/… nomlari o'rniga `test:e2e -- stock-operations`. T-058 ham `quotes.e2e-spec.ts` ichida |
| C10 | T-052: mijoz yuborgan `total` farq qilsa — **422** `TOTAL_MISMATCH` | TZ ziddiyatli: core 04 §4.5 "xato emas, faqat log", PLAN T-052 va 12-standards "422". Kassada ekrandagidan boshqa summa olinmasligi uchun 422 tanlandi; farq baribir loglanadi. `total` ixtiyoriy — yuborilmasa solishtirilmaydi |
| C11 | I22 #3 ("audit yiqilsa ham sotuv o'tadi") bajarilmaydi | Audit so'rov tranzaksiyasida (Q25): Postgres'da tranzaksiya ichidagi xatoni yutib bo'lmaydi — COMMIT jimgina ROLLBACK bo'lardi. TZ matni ham: "moliyaviy amal ichidagi audit … yiqilsa hammasi qaytariladi" |
| C12 | T-053: yetmagan qoldiq — **422** `STOCK_INSUFFICIENT` (rejada 409 `INSUFFICIENT_STOCK`) | Xato katalogi (C8 bilan bir xil); PLAN nusxasi tuzatildi |
| C13 | T-056: `GET /sales/:id/receipt?format=pdf` → **501** `FEATURE_DISABLED` | PDF — `puppeteer-core` + Chromium (09 §9.13); bepul instansiyada `PDF_ENABLED=false`. JSON chek to'liq |
| C14 | T-060: smena yopiq — **423** `SHIFT_REQUIRED` (rejada 409); T-066: limit — **422** `CREDIT_LIMIT_EXCEEDED` (rejada 409) | Xato katalogi va 04-api §5 (C8 kabi); PLAN nusxasi tuzatildi |
| C15 | `GET /cash/shifts/current` → `{ shift, cashBalance }` (TZ: "smena yoki null") | Bo'sh (`null`) javob tanasi mijozda noqulay; POS kassa balansini ham ko'rsatadi |
| C16 | T-063: tungi cron naqd shablon xarajatini smena YOPIQ bo'lsa kassaga ta'sirsiz yozadi | I9 (balans faqat ochiq smenada) va frontend qoidasi; qo'lda naqd xarajat esa smenasiz 423 |
| C17 | Takroriy tarkib — **200** `{ reused: true, upload: null }` (09 §9.9: "207 Reused") | 207 — WebDAV Multi-Status, bitta resurs uchun noto'g'ri ma'no; mijoz `reused` bayrog'idan biladi |
| C18 | T-086/T-087/T-091/T-092 testlari **e2e** (`test:e2e -- s3-service\|files-schema\|image-variants\|files-gc`), PLAN'dagi `npm test -w apps/api -- …` o'rniga | Haqiqiy MinIO va baza kerak (Q6). Sof qoidalar (`matchesMagic`, tarif) — unit `file-rules.spec.ts` |
| C19 | Rasm variantlari navbati — bazada (`variants IS NULL`, qisman indeks) + interval ishchi; BullMQ E12 (T-096) da uyg'otuvchi bo'ladi | Redis'siz ham ishlaydi (09 §9.8 "navbat yo'q — faqat orig" dan yaxshiroq), jarayon o'lsa ish yo'qolmaydi |
| C20 | `POST /files` (≤ 2 MB bir qadamda, 09 §9.12) qilinmadi | PLAN'da vazifa yo'q; presign oqimi hamma turni qamraydi. Server yaratadigan fayllar (eksport, migratsiya rasmlari) — `FilesService.putDirect` |
| C21 | T-098: versiya mos kelmasa **409** `VERSION_CONFLICT` + `current` (rejada 412) | TZ 04 §4.4 va xato katalogi 409 ni belgilaydi (C6/C8 kabi); PLAN nusxasi tuzatildi |
| C22 | T-094: token faqat `auth.token` (qo'l siqish) orqali; 04 §9 dagi `?token=` qabul qilinmaydi | URL proksi (Caddy) loglariga tushadi; frontend (06 §6.7) aynan `auth: { token }` ishlatadi |
| C23 | T-096: unit (`vitest run job-queue`) + Redis bilan e2e (`queue-bullmq`, `queue-wiring`) | PLAN'dagi `npm test -- queue` — unit qismi; haqiqiy Redis kerak bo'lgani — e2e (Q6) |
| C24 | T-084: eksport ro'yxatlari — products, clients, sales, stock-movements, expenses; sarlavhalar o'zbekcha | Frontenddagi asosiy CSV eksportlari; yangisi registrga bitta yozuv (`export-resources.ts`). Sarlavha tili — E13 (i18n) |
| C25 | Kichik eksport "oqim" o'rniga butun bufer (≤ 5000 qator, ~1 MB) | So'rov tranzaksiyasi (RLS) javobdan oldin yopiladi — tranzaksiyadan tashqaridagi oqim RLS'siz qolardi |
| C26 | T-128: `GET /backup/export` zaxiraning o'zini emas, **havolani** qaytaradi (`{ fileId, filename, sizeBytes, url, expiresAt }`) | PLAN: "fayl S3'da, havola 1 soat". Katta zaxira javobda xotira va so'rov vaqtini chegarasiz qilardi; yuklab olish S3'dan to'g'ridan-to'g'ri |
| C27 | `POST /backup/import` (`mode: replace`, 04 §8) qilinmadi; tiklash — bo'sh do'konga `POST /migration/import` (zaxira shakli mos, test bilan) | PLAN'da vazifa yo'q; butun do'konni almashtirish — alohida xavfli amal (tasdiq + oldindan zaxira), keyingi bosqich |
| C28 | Zaxira kaliti `t/{tenant}/backups/{fileId}/orig.gz` (09 §9.4: `{yyyy-mm-dd}-{fileId}.json.gz`) | `putDirect` ning yagona kalit sxemasi (eksport ham shunday); sana — yuklab olinadigan nomda (`crm-zaxira-YYYY-MM-DD.json.gz`) |
| C29 | T-129: `sent` — "OFD ga yuborilmoqda" (ijara), 08 §8.9 dagi "tasdiq kutilmoqda" emas | Umumiy HTTP shartnoma sinxron: javobda fiskal raqam. Ishchi o'lsa `sent` qator ijara tugagach qayta olinadi |
| C30 | Fiskallanadi: sotuv va qaytarish; chekni **bekor qilish** — yo'q | 08 §8.9 faqat chek yaratishni ko'rsatadi; fiskallangan chekni bekor qilish (qaytarish cheki) provayder shartnomasiga bog'liq — provayder tanlangach |
| C31 | OFD — umumiy shartnoma (`POST OFD_ENDPOINT`, Bearer, `Idempotency-Key`, javob `{ fiscalId, qrPayload }`) | Provayder (virtual kassa / OFD operatori, MXIK kodlari) hali tanlanmagan: moslash — faqat `HttpFiscalProvider`, navbat/qayta urinish/chek o'zgarmaydi |
| C32 | E13 (T-099…T-107), T-112, T-113 frontend qismi **qaytarildi** (2026-09-24) — vazifalar yana ochiq | Foydalanuvchi: frontendni frontend dasturchi qiladi. Mening implementatsiyam patch sifatida saqlangan: `/home/ulugbek/personal/front/crm-qurilish-e13-integration.patch` (148 fayl, HEAD ga `git apply` bilan qo'llanadi). Undagi yondashuvlar tavsiya sifatida `docs/api/README.md` §9, §12, §13 da |
| C33 | Audit eksporti — server CSV (`GET /exports/audit`, faqat admin) | Jurnal cheksiz o'sadi — brauzerda yig'ilmaydi |
| C34 | E13 davomida topilgan maydon sizishi tuzatildi: `netProfit`, `deadValue` va sotilmayotgan tovar qiymati (`items[].value` → `stockValue`) sotuvchiga chiqmaydi | `netProfit + expenses = grossProfit`, `value / stock = cost` — yashirin maydonlar tiklanardi (03 §3.6) |

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
| T-029 | `test:e2e -- every-route` | ✅ 3 test; har yo'l tasniflangan |
| T-030 | `vitest run src/common/security` | ✅ 10 test; sotuvchi tannarxni ko'rmaydi |
| T-032 | `test:e2e -- audit-rate` | ✅ 4 test; jurnal + login 10/daq |
| T-033 | `vitest run crud-base` | ✅ 20 test; ro'yxat/sahifa/kursor, saralash, 404/409/422 xaritasi, yumshoq o'chirish + undo |
| T-034 | `test:e2e -- settings` | ✅ 8 test; faqat `settings.edit`, 0–100, kesh (1→0 so'rov), bekor qilish |
| T-035 | `test:e2e -- warehouses` | ✅ 11 test; sukut ombor qulf, qoldiq ogohlantirishi, nom noyob |
| T-036 | `test:e2e -- categories` | ✅ 8 test; nom o'zgarishi = 1 `UPDATE` (D4), ishlatilayotgani 409 |
| T-037 | `test:e2e -- products` + `query-budget` | ✅ 15 + 1 test; qidiruv/filtrlar, SKU/shtrix-kod noyob, `stock` PATCH'da rad, ro'yxat ≤ 2 so'rov |
| T-038 | `test:e2e -- products-import` | ✅ 15 test; 1000 qator = 1 INSERT, xato qatorlar hisoboti, 5000 chegara, narx diff audit'da |
| T-039 | `test:e2e -- clients` | ✅ 8 test; qarzli mijoz 409, telefon qidiruvi — API so'rovi rejasida `clients_tenant_id_phone_idx` |
| T-040 | `test:e2e -- suppliers` | ✅ 6 test; STIR 9 raqam, ochiq buyurtma 409 |
| T-041 | `test:e2e -- users-employees` | ✅ 17 test; D1, LAST_ADMIN (parallel ham), SELF_*, sessiyalar yopiladi |
| T-031 | `test:e2e -- isolation` | ✅ 6 test; `:id` li BARCHA yo'llar marshrutlardan yig'iladi, A→B = 404, B o'zgarmaydi |
| T-042 | `test:e2e -- lock-order` | ✅ 4 test; id tartibida qulf (teskari so'rovda deadlock yo'q), ikkinchi yozuvchi KUTADI (`pg_locks`), tranzaksiyasiz qulf — xato |
| T-043 | `test:e2e -- stock-invariants` | ✅ 9 test; I1, I2 (parallel chiqim — faqat bittasi o'tadi, DB CHECK), I11 (`averageCost` shared'da, 7 test), kasr aniqligi, `balanceAfter` aynan o'sha omborniki, so'rovlar soni qatorlarga bog'liq emas |
| T-044…047 | `test:e2e -- stock-operations` | ✅ 18 test; kirim/chiqim/inventarizatsiya/ko'chirish, arxiv ombor qoidasi, begona havola 422, huquqlar, audit diff |
| T-048 | `test:e2e -- movements-pagination` | ✅ 4 test; 100 000 yozuv, chuqur kursor bilan ham p95 < 200 ms, sahifalar orasida takror/yo'qolish yo'q |
| T-049 | `test -w packages/shared -- reorder` + `stock-operations` | ✅ 5 + 1 test; formula shared'da, ta'minotchi bo'yicha guruhlanadi |
| T-050 | `test:e2e -- idempotency` | ✅ 9 test; replay (`Idempotent-Replay: true`), boshqa tana 409, parallel dublikat → 1 amal, yiqilgan amal kalitni band qilmaydi, 24 soatlik tozalash |
| T-051 | `test:e2e -- doc-number-concurrency` | ✅ 5 test; parallel 100 → takror va bo'shliq yo'q (1001…1100), ROLLBACK raqamni "yemaydi", prefiks/tenant mustaqil |
| T-052 | `vitest run sale-totals` | ✅ 15 test; shared `saleTotals`/`refundTotals`/`lineTotal`, I23 birlik, chegirma chegarasi, qaytim faqat naqddan, qaytarish ulushlari yig'indisi aniq |
| T-053 | `test:e2e -- sales-create,query-budget` | ✅ 18 + 1 test; I3 (parallel — faqat bittasi), I5, I8 (423), I12, I13, I15, I16 (limit, muddat), I17, I23, TOTAL_MISMATCH, idempotent; **8 so'rov** (idempotentlik bilan), 3 va 30 qator bir xil |
| T-054 | `test:e2e -- sales-return` | ✅ 9 test; I6 (asl foiz, mutanosib), I7, jami qaytarish chekdan oshmaydi, nasiya chekda avval qarz yopiladi, asl omborga |
| T-055 | `test:e2e -- sales-cancel` | ✅ 7 test; I24, kassa qaytadi, I17 (ball manfiy emas), I13, ikki marta 409, qaytarishi bor chek — 409, qaytarishni bekor qilish qarzni qayta ochadi |
| T-056 | `test:e2e -- sales-list` | ✅ 6 test; filtrlar, qarz SQL'da (generated ustun), kursor, byudjet ≤ 2 (1 so'rov), chek rekvizitlari |
| T-057, T-058 | `test:e2e -- quotes` | ✅ 11 test; CRUD, holat, muddat, qayta narxlash; I20: to'lov usuli, nasiya, QUOTE_STOCK_SHORT, parallel ikki aylantirish → bittasi, QQS taklifdagi foiz |
| T-059, T-060 | `test:e2e -- shifts` | ✅ 9 test; I8 (parallel ochish → bittasi, baza indeksi), I10 (ochish/yopish, farq), kupyuralar, I9 (smenasiz 423), kirim/chiqim jurnali |
| T-061 | `test:e2e -- shift-report` | ✅ 2 test; smenadagi 11 xil amal — **1 so'rov**, nasiya tushumda, hisobiy qoldiq = kassa = ochilish + kirim − chiqim |
| T-062, T-063 | `test:e2e -- expenses-cash-effect` | ✅ 12 test; naqd/bank ta'siri (I9), tahrir/o'chirish/tiklash kassada to'g'ri; I21: davrga bir marta, parallel → 1, haftalik ISO, Toshkent 00:05 |
| T-064, T-065 | `test:e2e -- debt-payment` | ✅ 9 test; I14 (ortiqcha, parallel → 1), completed, naqd/bank; `client_balances` (RLS ostida), eskirish, muddati o'tgan, ≤ 2 so'rov |
| T-066 | `vitest run credit-check` | ✅ 4 test; `CreditService` + shared `evaluateCredit`, aniq raqamlar |
| T-067 | `test:e2e -- loyalty` | ✅ 4 test; I17: foiz sozlamadan, nasiyada ham, balansdan ko'p emas, bekor qilishda qaytadi, manfiy emas |
| T-068 | `test:e2e -- purchase-orders` | ✅ 5 test; `BUY-NNNN`, muddat ta'minotchi shartidan, tahrir/bekor faqat `ordered`, o'chirish qoidasi, begona havola 422, huquqlar |
| T-069 | `test:e2e -- po-receive` | ✅ 5 test; I19 (ortiqcha 422, qisman → partial → received), kirim harakati (izoh, ta'minotchi, narx), I11, kasr miqdor, arxiv ombor |
| T-070…T-073 | `test:e2e -- supplier-payment` + `test -w packages/shared -- payables` | ✅ 6 + 7 test; I18 (qarz faqat kelgan tovar), naqd — kassadan va Z-hisobotda, bank ta'sirsiz; karta **1 so'rov**; audit summa bilan |
| T-074 | `test:e2e -- deliveries` | ✅ 4 test; narx chekdan (D3), holat faqat oldinga (teskari/sakrash 422), haydovchi — xodim (begona 422), filtrlar |
| T-075 | `test:e2e -- deliveries-driver-scope` | ✅ 3 test; `/deliveries/my` faqat o'ziniki, tahrir huquqisiz — faqat o'z yetkazishi, marshrut **1 so'rov** |
| T-076 | `test:e2e -- messages` | ✅ 3 test; qabul qiluvchilar serverda (mijoz/guruh/qarzdor/hammasi), shablon har biriga, jurnal statistikasi |
| T-077 | `vitest run sms-provider` + `test:e2e -- messages-rate-limit` | ✅ 4 + 5 test; eskiz/playmobile so'rov shakli, 5xx/429 — qayta, 4xx — yo'q; navbat: qayta urinish, 3 urinishdan keyin failed, tenantlar aralashmaydi |
| T-078 | `test:e2e -- messages-rate-limit` | ✅ kunlik chegara 429 (Toshkent kuni), so'rov darhol qaytadi — yuborish fonda |
| T-079 | `test:e2e -- mv-matches-live` | ✅ 2 test; materiallashgan = jonli (qatorma-qator), I4 (nasiya ichida, bekor tashqarida), ilova roli MV'ni to'g'ridan-to'g'ri o'qiy olmaydi |
| T-080 | `test:e2e -- mv-refresh-lock` | ✅ 2 test; qulf band — o'tkazib yuboradi, bo'shagach — yangilaydi va vaqtni yozadi |
| T-081 | `test:e2e -- reports` (Dashboard) | ✅ 2 test; **1 so'rov**; kecha — ko'rinishdan, bugun jonli; I4: dashboard = P&L; sotuvchi foyda ko'rmaydi |
| T-082 | `test:e2e -- reports` (pnl-matches-frontend) | ✅ 3 test; shared `revenueOf`/`cogsOf` bilan AYNAN teng, oldingi davr, to'lov turlari, top, sotuvchilar, sotilmayotgan tovar; ≤ 2 so'rov |
| T-083 | `test:e2e -- reports` (ABC) | ✅ 1 test; 70/85/95/100 → A/B/B/C (oyna funksiyasi), **1 so'rov** |
| T-085 | `test:e2e -- reports` (kesh) | ✅ 1 test; tugallangan davr — 0 so'rov, sotuvdan keyin qayta hisob, bugun keshlanmaydi |
| T-086 | `test:e2e -- s3-service` | ✅ 4 test (MinIO); yo'q bucket — ilova ko'tarilmaydi; put/size/head/sha256/delete; presigned PUT: MIME va hajm IMZODA (boshqasi — S3 403), TTL 600; `attachment` nomi; zaxira bucket alohida |
| T-087 | `test:e2e -- files-schema` | ✅ 5 test; `(tenant, sha256, kind)` va kalit noyob, CHECK'lar; kompozit FK (begona fayl — rad); `SET NULL (image_file_id)` tenant_id'ga tegmaydi; band hajm ≥ 0 |
| T-088 | `test:e2e -- files-presign` | ✅ 9 test; kalit serverda (`t/{tenant}/products/{id}/orig.png`), TTL ≤ 10 daq; SVG/HTML — 400; hajm (tur + tarif) 413; kvota presign'dan OLDIN 413; takroriy tarkib `reused`; parallel presign — bitta qator; huquq tur bo'yicha |
| T-089 | `test:e2e -- files-confirm-magic-bytes` + `vitest run file-rules` | ✅ 7 + 8 test; rasm deb HTML — 422, obyekt o'chadi, karantin + audit saqlanadi; xesh mos emas 422; CSV deb SVG — rad; yuklanmagan 409; kvota qayta (atomik) 413; parallel tasdiqlash — hisoblagich bir marta |
| T-090 | `test:e2e -- files-read,isolation` | ✅ 8 test + izolyatsiya (`files` namunasi); 302 + `Cache-Control: private, max-age=540`; imzosiz havola 403 (bucket yopiq); variant yo'q — orig; `attachment` asl nom bilan; begona 404; pending/karantin/o'chirilgan 404; havola logda yo'q |
| T-091 | `test:e2e -- image-variants` | ✅ 4 test; 128/512 WebP (nisbat saqlanadi, kattalashtirilmaydi), `raw?variant=` variantga; buzilgan rasm yoki yo'q obyekt — `{}` (qayta urinilmaydi, orig); o'chirilgan/boshqa tur navbatga kirmaydi |
| T-092 | `test:e2e -- files-gc` | ✅ 6 test; pending > 24 soat — S3 + qator; yetim rasm (24 soat grace) — `deletedAt`; 30 kun — asl + variantlar + qator, hajm kamayadi; tirik mahsulot havolasi bor fayl HECH QACHON o'chmaydi; pending/karantin hajmga kirmaydi; hisoblagich solishtiruvi |
| T-093 | `test:e2e -- product-image` | ✅ 5 test; POST/PATCH `imageFileId`, yangisi eskisining o'rnida, `null` — olib tashlash; begona/pending/o'chirilgan/boshqa tur — 422; fayl o'chsa havola uziladi; mahsulot tiklansa rasmi ham |
| T-084 | `test:e2e -- exports` + `test -w packages/shared -- csv` | ✅ 6 + 4 test; ≤ 5000 qator — darhol fayl (BOM, o'zbekcha sarlavha, `attachment`), JSON — massiv; ko'p — 202, fon ishi → S3 (`export`) → faqat so'rovchiga havola (boshqasiga 404); sotuvchiga tannarxsiz; formula in'yeksiyasi; jurnal |
| T-094 | `test:e2e -- ws-auth` | ✅ 4 test; tokensiz / buzuq / soxta kalit / muddati o'tgan — ulanish ochilmaydi; xona — token tenanti; `auth.tenantId` va `join` e'tiborsiz; token muddati tugasa server uzadi |
| T-095 | `test:e2e -- events-after-commit` | ✅ 4 test; hodisa kelganda chek bazada bor; 422/423 va ROLLBACK — hodisasiz; faqat id'lar; smena → ombor → sotuv → qarz → qaytarish → bekor → yopish tartibi; boshqa tenant eshitmaydi |
| T-096 | `vitest run job-queue` + `test:e2e -- queue-bullmq,queue-wiring` | ✅ 6 + 2 + 2 test; jarayon ichida: ketma-ket, xato to'xtatmaydi, dedupe, to'xtashda tugatadi; BullMQ (Redis): 2 instansiya — har ish bir marta, kunlik kalit; rasm tasdig'i va xabar — ish COMMIT'dan keyin |
| T-097 | `test:e2e -- offline-replay` | ✅ 8 test; navbat qayta yuborilsa — o'sha javob (`Idempotent-Replay`), ikkilanmaydi; parallel — bitta chek; o'zgargan tana — 409; qoldiq/narx konflikti — 422 aniq sabab, tuzatilgach o'sha kalit; orqa sanali chek va kechagi chekni bekor qilish — hisobotda darhol |
| T-098 | `test:e2e -- optimistic-lock` | ✅ 6 test; mos versiya — saqlanadi; eskisi — 409 + `current`, o'zgarish yo'q; sarlavhasiz — tekshirilmaydi; begona/yo'q — 404; sotuv versiyaga tegmaydi, kirim tannarxi va ommaviy narx — tegadi; µs/ms aniqlik; foydalanuvchi va xodimni bo'shatish |
| T-108 | `test:e2e -- migration-import` | ✅ 5 test; tashqi kalitlar tartibida BITTA tranzaksiya; id — `uuidv5(tur:eski-id, tenant)`: havolalar xaritasiz, qayta yuborish ikkilanmaydi; omborlar bo'yicha qoldiq, sozlama, hisoblagich eng katta raqamdan (I12); foydalanuvchiga vaqtinchalik parol; v12 (omborsiz) nusxa; faqat admin |
| T-109 | `test:e2e -- migration-dryrun` | ✅ 4 test; hisobot (soni, o'tkaziladigan/tuzatiladigan) — bazaga hech narsa yozilmaydi; `existing` — takroriy importni ko'rsatadi; buzuq yozuv so'rovni yiqitmaydi |
| T-110 | `test:e2e -- migration-repair` | ✅ 4 test; osilgan havolalar (07 §7.4: mahsulotsiz chek — o'tkaziladi, yo'q mijoz — NULL), I1/I2/I8/I12, SKU va chek raqami to'qnashuvi — `-2` qo'shimchasi; serverdagi ochiq smena bilan to'qnashuv |
| T-111 | `test:e2e -- migration-images` | ✅ 2 test; data-URL rasm — sehrli bayt tekshiruvi → S3 (`putDirect`) → mahsulotga; yaroqsizi o'tkaziladi, import davom etadi; bir xil rasm — bitta fayl, qayta import — yangi fayl yo'q |
| T-117 | `SHOW shared_buffers; SELECT count(*) FROM pg_stat_statements` (PG 16 konteyner + `infra/postgres.conf`) | ✅ 12 GB ARM VM uchun (`shared_buffers=3GB`, `work_mem=16MB`, `max_connections=40`); `pg_stat_statements` + `auto_explain` (200 ms) yuklangan |
| T-123 | `test:e2e -- invariants` + `npm run job:invariants -w apps/api` | ✅ 3 test; 7 denormalizatsiya (qoldiq, `balance_after`, qarz to'lovi, ta'minotchiga to'lov, kassa, band hajm, hisoblagich) noldan qayta hisoblanadi; farq — `critical` (Sentry), tuzatilmaydi; CLI chiqish kodi 1/0 |
| T-124 | `test:e2e -- signup` | ✅ 3 test; `POST /auth/register` — do'kon + admin + sozlama + ombor bitta tranzaksiyada, sessiya darhol (token + refresh cookie); validatsiya 400 (hech narsa yaratilmaydi); bir IP dan 5/soat — 429 |
| T-125 | `test:e2e -- plan-limits` + `test -w packages/shared -- plans` | ✅ 6 + 4 test; tariflar `@crm/shared` da (`free/basic/pro`); foydalanuvchi, ombor (arxivdan qaytarish ham), kunlik SMS (tarif va provayder chegarasidan kichigi), hajm — 402 `PLAN_LIMIT_EXCEEDED` (`meta.limit/used`); oxirgi joyga parallel ikki so'rov — bittasi; qayta faollashtirish va tiklash ham tekshiriladi; migratsiya importi chegaradan oshirsa — 402, hech narsa yozilmaydi (takroriy import o'tadi) |
| T-126 | `test:e2e -- billing-webhook` | ✅ 7 test; Payme JSON-RPC (Basic kalit, tiyin, 12 soat muddat, GetStatement) va Click SHOP (md5 imzo, prepare → complete); tarif FAQAT tasdiqda, takroriy webhook — o'sha javob, bir marta uzayadi; bekor — tarif o'zgarmaydi |
| T-127 | `test:e2e -- tenant-suspend-delete` | ✅ 5 test; muddat + 3 kun → `suspended` (o'qish bor, yozish 423, to'lov ochiq); o'chirish parol bilan, 30 kun faqat o'qish, bekor qilish; `purge_tenant()` — hamma jadval (audit, ombor jurnali ham) + S3 prefiksi, qator qolsa XATO; B tegilmaydi; ilova roli append-only jadvalni o'chira olmaydi |
| T-128 | `test:e2e -- tenant-export` | ✅ 4 test; brauzer zaxirasi shakli (`CrmSnapshot` + `settings`, parolsiz `users`), gzip, `backup` bucket, havola 3600 s; boshqa do'kon ma'lumoti yo'q; A zaxirasi B ga import qilinsa 17 ro'yxat mazmuni aynan; 2345 mijoz — sahifalab to'liq; `deleting` holatda ham; 1 soatdan keyin fayl va band hajm tozalanadi |
| T-129 | `test:e2e -- ofd-degraded` + `vitest run fiscal-provider` | ✅ 7 + 4 test; OFD o'chiq — navbat bo'sh, chekda `fiscal: null`; yoqilgan — navbat chek bilan bir so'rovda, COMMIT'dan keyin fiskal raqam + QR + `sale.fiscalized`, qaytarish asl fiskal raqam bilan; OFD o'chiq yoki osilgan — sotuv 201 (kutmaydi), 1 → 2 → 4 … daq kechikish; 24 soat — bir marta ogohlantirish; 4xx — `failed`; do'kon o'chsa navbat ham |

## Keyingi qadamlar

**Bajarildi (backend): E0–E12, E14 ning backend qismi (T-108…T-111), E16; E15 dan T-117, T-123.**
Frontend integratsiyasi (E13, T-112, T-113) — frontend dasturchida (C32); backend unga tayyor va
hujjatlangan: [`docs/api/`](./docs/api/README.md). Qolgani — haqiqiy server talab qiladigan E15 vazifalari.

Oxirgi to'liq tekshiruv (2026-09-24): `npm run verify` (121 unit) va e2e — 79 fayl, **533 test** (3 tasi o'tkazildi: `s3-prod-smoke`, R2 kaliti kerak).

### Keyingi sessiyada

1. **E15** — haqiqiy serverda: T-114 (ARM64 yig'ish), T-115, T-116, T-118…T-122. Production `.env` da
   `TRUST_PROXY=1` (Q97) — `infra/.env.prod.example` da bor
2. **Ochiq savollar (qaror kerak)** — batafsil `docs/api/README.md` §14.1:
   - sotuvchi `suppliers:view` orqali kirim buyurtmalarini ko'radi — bitta qatorli buyurtmada `total` dan
     tannarx tiklanadi (PO ro'yxatini sotuvchidan yopish yoki summalarni yashirin maydonlarga qo'shish);
   - chek qatorida narxni qo'lda o'zgartirish (`price`) `maxDiscountPct` ga bo'ysunmaydi va har rolga ochiq;
     sotuvchi `wholesalePrice` ni ko'rmaydi, lekin ulgurji narxda sota oladi;
   - joriy omborni API orqali tanlab bo'lmaydi; PDF chek amalga oshirilmagan (`PDF_ENABLED=true` da ham JSON);
   - `SaleItemDto.returnedQty` yo'q; o'chirilgan foydalanuvchini ro'yxatdan topib tiklab bo'lmaydi
3. **Frontend** (E13, T-112, T-113, T-119) — frontend dasturchi; vazifalar va qabul mezonlari —
   `docs/api/README.md` §13. Oldingi implementatsiyam: `/home/ulugbek/personal/front/crm-qurilish-e13-integration.patch`

### E13 uchun backendga qo'shilganlar

| Endpoint / o'zgarish | Nima uchun |
|----------------------|-----------|
| `GET /audit` (kalitli, `users` ko'rinishi), `GET /exports/audit` | Audit jurnali sahifasi va eksport |
| `GET /files/urls?ids=` | Sahifadagi rasmlar havolasi — bitta so'rov (`<img>` token yubora olmaydi) |
| `GET /clients/:id/stats`, `ClientDto.salesCount` | Mijoz kartasi; kassada qarz/muddat ogohlantirishi |
| `GET /products/summary`, `/products/:id/stats`, `GET /warehouses/stock` | Katalog va ombor kartalari |
| `GET /suppliers/summary`, ro'yxatda qarz va mahsulot soni, `withDebt` | Ta'minotchilar sahifasi (so'rov byudjeti — 3) |
| `GET /cash/shifts?dateFrom&dateTo`, `ShiftDto.cashierName` | Smena tarixi; kassir ismi (`users` ro'yxati faqat admin uchun) |
| `DebtSummary.oldestDate` | "Eng eski qarz" kartasi — o'sha agregatda |
| `GET /purchase-orders/summary`, `?dateFrom&dateTo`, `POST …/:id/restore`, `PoItemDto.unit` | Xaridlar kartalari, filtr, undo, qabul oynasida birlik |
| `GET /expenses/summary` | Bugun/oy/jami (filtrsiz) + kategoriya taqsimoti (filtr bilan) |
| `GET /deliveries/summary`, `POST …/:id/restore`, tahrirda `null` (haydovchi, joylashuv, izoh) | Holatlar, yetkazilganlar narxi, haydovchi yuki; undo |
| `GET /quotes/summary`, `?dateFrom&dateTo&expired`, `POST …/:id/restore`, `QuoteDto.customer/seller` | Takliflar kartalari, filtrlar, undo; hujjatda mijoz/mas'ul — JOIN bilan |
| Swagger: union maydonlarga `type`, yashirin maydonlar ixtiyoriy, `DebtPageDto.items` — `oneOf` | `openapi-typescript` to'g'ri tiplar bersin |
| CORS `exposedHeaders: Content-Disposition` | Eksport fayl nomi brauzerda |

### E15 — tayyor artefaktlar va nimasi hali sinalmagan

| Vazifa | Bu mashinada tekshirildi | Serverda qoladi |
|--------|--------------------------|-----------------|
| T-114 Dockerfile | amd64 obraz yig'ildi; root'siz; `HEALTHCHECK` sog'lom; konteynerda `prisma migrate deploy`; Swagger production'da 404 | `--platform linux/arm64` (QEMU/buildx yo'q) |
| T-115 VM | `infra/vm-setup.sh` (ufw, iptables, swap, SSH kalit) yozildi | Oracle VM yo'q |
| T-116 compose + Caddy | `infra/docker-compose.prod.yml`, `Caddyfile` | compose plagini yo'q; TLS — domen kerak |
| T-118 R2 | `infra/r2-cors.json`, `r2-lifecycle.json`; `test:e2e -- s3-prod-smoke` (3 test, `S3_SMOKE_*` bo'lmasa o'tkaziladi) | R2 kalitlari yo'q |
| T-119 Pages | — (frontend repo) | Cloudflare hisobi |
| T-120 CI/CD | `ci.yml` (Postgres, Redis, MinIO, kalitlar, `crm_app`, OpenAPI drift), `deploy.yml` (ARM64 → migratsiya alohida qadam → yangi versiya) | GitHub Actions ishga tushirilmagan |
| T-121 zaxira | `infra/backup.sh` (`age` shifr, R2), `verify-backup.sh`; dump → tiklash mahalliy sinaldi | R2 va cron serverda |
| T-122 kuzatuv | Sentry (`SENTRY_DSN` bo'lsa), `alertCritical`, log rotatsiyasi compose'da | UptimeRobot, Sentry DSN |

### Production'da RLS — HAL QILINDI (E5 dan oldin)

Muammo: dev/test superuser `crm` bilan ulanardi (`BYPASSRLS`), production'da
`crm_app` bilan esa login va tranzaksiyadan tashqaridagi so'rovlar bo'sh
natija berardi. Yechim (Q24–Q27):

- Har AUTENTIFIKATSIYALANGAN so'rov — bitta tenant tranzaksiyasi
  (`TenantTransactionInterceptor`, `set_config('app.tenant_id')`);
  `prisma.scoped` shu tranzaksiyani qaytaradi, tranzaksiyasiz — XATO
- Login/refresh: tor `users_auth_lookup` siyosati (faqat SELECT, faqat
  `app.auth_email` / `app.auth_user_id` ga ANIQ mos qator), qolgani tenant
  tranzaksiyasida
- Testlarda ILOVA `crm_app` bilan ulanadi (`appDb`), fixture'lar — egasi
  (`testDb`, `DIRECT_DATABASE_URL`). 201 e2e test RLS ostida o'tadi

### Yangi xato kodlari (E4–E16)

| Kod | Status | Qachon |
|-----|--------|--------|
| `ALREADY_EXISTS` | 409 | Noyob qiymat band (ombor/kategoriya nomi, shtrix-kod, email) — `errors[].field` bilan |
| `REFERENCE_NOT_FOUND` | 422 | Tanadagi havola yo'q yoki BOSHQA tenantniki (kompozit FK) |
| `CATEGORY_IN_USE` | 409 | Kategoriyada o'chirilmagan mahsulot bor |
| `CLIENT_HAS_DEBT` | 409 | Mijozning to'lanmagan nasiyasi bor (`meta.debt`) |
| `SUPPLIER_HAS_OPEN_ORDERS` | 409 | `ordered`/`partial` buyurtma bor |
| `EMPLOYEE_HAS_USER` | 409 | Xodimning kirish hisobi bor / ikkinchi hisob yaratilmoqda |
| `SELF_ROLE_CHANGE` | 422 | O'z rolini o'zgartirish |
| `PAYLOAD_TOO_LARGE` | 413 | JSON tana 4 MB dan katta (avval 500 qaytardi) |
| `WAREHOUSE_ARCHIVED` | 422 | Arxivlangan omborga kirim/ko'chirish/sotuv (undan chiqim — mumkin) |
| `TOTAL_MISMATCH` | 422 | Mijoz ko'rsatgan jami server hisobidan farq qiladi (`meta.client/server`) |
| `PAYMENT_EXCEEDS_TOTAL` | 422 | Karta + o'tkazma chekdan ko'p (qaytim faqat naqddan) |
| `RETURN_EXCEEDS_SOLD` | 422 | Qaytarish sotilgandan ko'p (oldingi qaytarishlar bilan) |
| `SALE_NOT_RETURNABLE` | 422 | Qaytarish hujjatidan qaytarib bo'lmaydi |
| `SALE_NOT_CANCELLABLE` | 409 | Chekda qaytarish yoki qarz to'lovi bor (`meta.reason`) |
| `FEATURE_DISABLED` | 501 | Serverda o'chirilgan imkoniyat (PDF chek) |
| `PO_CANCELLED` | 409 | Bekor qilingan kirim buyurtmasini qabul/tahrir qilib bo'lmaydi |
| `INVALID_STATUS_TRANSITION` | 422 | Yetkazish holati faqat oldinga (`meta.from/to`) |
| `MESSAGE_LIMIT_EXCEEDED` | 429 | Kunlik SMS chegarasi (`meta.limit/used/requested`) |
| `STORAGE_QUOTA_EXCEEDED` | 413 | Tarif hajmi tugadi — presign va tasdiqlashda (`meta.used/limit`) |
| `FILE_REJECTED` | 422 | Tarkib e'lon qilingan MIME/xeshga mos emas — fayl karantinda (`meta.id`) |
| `FILE_NOT_UPLOADED` | 409 | Tasdiqlash PUT'dan oldin chaqirildi |
| `VERSION_CONFLICT` | 409 | `If-Match` versiyasi eskirgan — javobda `current` (joriy yozuv) |
| `PLAN_LIMIT_EXCEEDED` | 402 | Tarif chegarasi (foydalanuvchi, ombor, SMS) — `meta.limit/used`; hajm uchun `STORAGE_QUOTA_EXCEEDED` |
| `TENANT_READ_ONLY` | 423 | Do'kon `suspended` yoki `deleting` — yozish yopiq (`meta.status`); to'lov, o'chirishni bekor qilish, zaxira ochiq |

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
| Q12 | Prisma `relationJoins` (preview) yoqildi | Mahsulot + ombor qoldiqlari (`stocks`) BITTA SQL'da (LATERAL JOIN) — ro'yxat byudjeti 2. Ichki JSON'da Decimal/BigInt aniqligi sinab ko'rildi (`12345678901.125` saqlanadi) |
| Q13 | Testda ilova `appDb` (`crm_app`, RLS ostida), fixture'lar `testDb` (egasi, `DIRECT_DATABASE_URL`); query hodisalari yoqilgan | Q24 dan keyin: ilova production'dagi rol bilan sinaladi. So'rov byudjeti SQL darajasida sanaladi (BEGIN/COMMIT/`set_config` hisobga olinmaydi) |
| Q14 | `inTenantTransaction` `scoped` mijoz ustida, tipi `TenantTx` | Tranzaksiya ichida ham 2-qatlam (tenant filtri) ishlaydi — uch qatlam birga |
| Q15 | CRUD bazasi: abstrakt `CrudService`/`SoftDeleteCrudService`, controllerlar aniq | Servis naqshi bir marta yozildi; generik controller DTO validatsiyasi va Swagger tiplarini yo'qotardi |
| Q16 | Tanadagi havola xatosi — 422 `REFERENCE_NOT_FOUND`; o'chirishni to'suvchi bog'liqlik — 409 | 404 faqat yo'ldagi resurs uchun (03 §3.8); 409 — PLAN mezonlari; mavjud `LAST_ADMIN`/`SELF_*` 422 da qoldi (C6) |
| Q17 | Omborda o'chirish yo'q — `POST :id/archive`/`restore`; javobda `stockWarning` | Omborga harakatlar havola qiladi; qoldiq bo'lsa amal bajariladi, lekin ogohlantiriladi. Joriy ombor arxivlansa kassa sukut omborga o'tadi (frontend qoidasi) |
| Q18 | `GET /settings` — faqat autentifikatsiya; kesh jarayon ichida, TTL 60 s | Kassirga QQS/chegirma chegarasi kerak. Yozishda kesh O'CHIRILADI (qayta yozilmaydi — parallel tahrir poygasi). Ko'p instansiyada bekor qilish Redis bilan (T-096) |
| Q19 | Telefon saqlashda normallashtiriladi (raqamlar + boshidagi `+`) | Aniq qidiruv (`?phone=`) `(tenant_id, phone)` indeksini ishlatadi; `q` dagi raqamlar format farqisiz topiladi. Demo seed ham shu ko'rinishga keltirildi |
| Q20 | Ommaviy narx: faqat `price`/`wholesalePrice`, maks. 1000 id, audit'da har tovar uchun `before/after` | Tannarx kirimda hisoblanadi (I11). Bitta `WITH … FOR UPDATE … UPDATE … RETURNING` so'rovi |
| Q21 | Oxirgi admin himoyasi — tenant bo'yicha advisory qulf | `FOR UPDATE` READ COMMITTED'da `users`+`employees` o'zgarishini ushlamaydi. Test qulfni olib tashlaganda yiqilishi tekshirildi (mutatsiya) |
| Q22 | JSON tana chegarasi 4 MB; body-parser xatolari 400/413 | Express sukuti (100 KB) 5000 qatorli importni 500 bilan yiqitardi; buzuq JSON ham 500 edi |
| Q23 | Servis ichidagi audit (`@AuditedInService`) — tranzaksiyada, xato yutilmaydi | Import/ommaviy narx diff bilan yoziladi; interceptor takrorlamaydi. Interceptor endi `entityType`/`entityId` ham yozadi |
| Q24 | So'rov darajasidagi tenant tranzaksiyasi (interceptor), `prisma.scoped` = joriy tx | RLS `app.tenant_id` ni faqat tranzaksiyada ko'radi. Narxi: har so'rovga 3 xizmat buyrug'i, so'rov davomida 1 ulanish. Qo'shimcha foyda: so'rov yaxlit, javob COMMIT'dan keyin |
| Q25 | Audit so'rov tranzaksiyasi ICHIDA va kutiladi | Jurnal amal bilan birga saqlanadi yoki birga bekor bo'ladi (avval "yubor-va-unut" edi). Interceptorlar tartibi `AppModule` da belgilangan |
| Q26 | `inTenantTransaction` tashqi tranzaksiyaga QO'SHILADI | Prisma ichma-ich tranzaksiyani qo'llamaydi; servis bir xil kod bilan so'rovda ham, fon ishida ham ishlaydi |
| Q27 | Noyoblik yozishdan OLDIN tekshiriladi (`uniqueRules`) | RLS yoqilgan jadvalda Postgres unique xatosida kalitni yashiradi, Prisma `target: null` beradi. Baza cheklovi — poyga holati uchun oxirgi to'siq |
| Q28 | Idempotentlik: kalit SO'ROV tranzaksiyasida, avval `INSERT … ON CONFLICT DO NOTHING`; PK `(tenant_id, key)` | Parallel dublikat unique indeksda kutadi va keyin saqlangan javobni oladi (ikki marta bajarilmaydi). Amal yiqilsa kalit ham bekor — tuzatib qayta yuborish mumkin. Tana xeshi maydon tartibiga bog'liq emas. Interceptor validatsiya pipe'idan OLDIN ishlaydi — 400 ham tranzaksiyani (kalit bilan) bekor qiladi |
| Q29 | Ombor yozuvchisi: qulf → qoldiqlarni o'qish → BITTA CTE yozuv (`jsonb_to_recordset`) | So'rovlar soni qatorlar soniga bog'liq emas (4 ta). Qoldiq qulfdan KEYIN alohida so'rovda o'qiladi (READ COMMITTED'da yangi snapshot). Miqdor butun milli-birlikda hisoblanadi — suzuvchi nuqta xatosi yo'q |
| Q30 | Harakatlar jurnali kaliti `(date DESC, id DESC)`; indeks `(tenant_id, date, id)` | `created_at` bazada mikrosekund, JS'da millisekund — kursor aniqligini yo'qotardi. id — uuidv7 (vaqt tartibida), shuning uchun kun ichida ham yaratilish tartibi |
| Q31 | Harakat id'lari ilovada (uuidv7), biznes sanasi `Asia/Tashkent` | Javobga id yozishdan oldin kerak. 00:30 dagi amal mahalliy kunga tegishli (UTC bo'yicha kechagi kun bo'lardi) |
| Q32 | Xom SQL'ga massivlar JSON sifatida (`uuidArray()`, `jsonb_to_recordset`) | Prisma bo'sh/null massivni `integer[]` deb yuboradi — `::uuid[]` yiqiladi (42846) |
| Q33 | **Kassa registri qulfi**: `tenant_state FOR UPDATE` — sotuv, qaytarish, bekor qilish, taklifni aylantirish (E7 da naqd to'lovlar, smena) BIRINCHI shuni oladi | Smena sotuv bilan bir vaqtda yopilmaydi (I8/I9), bir mijozning parallel nasiyalari limitni birga oshirmaydi (I16), bonus ikki marta sarflanmaydi (I17): qarz/ball qulfdan KEYINGI so'rovda o'qiladi. Qulf tartibi: registr → hujjat qatori → mahsulotlar (id) → hisoblagich. Narxi: do'kon kassa amallari ketma-ket |
| Q34 | Chek BITTA so'rovda yoziladi (CTE): raqam + chek + qatorlar + ombor + kassa + bonus + yetkazish (+ taklif holati) | `POST /sales` = 8 so'rov (idempotentlik 2 ta bilan), qatorlar soniga bog'liq emas. Hisoblagich qulfi oxirgi so'rovda — ketma-ketlik oynasi eng qisqa |
| Q35 | Bazada `paid_cash` = kassada QOLGAN naqd (berilgan − qaytim); API'da `paid.cash` = BERILGAN (`paid_cash + change`) | `paid_not_over_total` CHECK saqlanadi, kassaga qaytim bilan emas, sof summa tushadi (frontend berilganni qo'shardi). Karta/o'tkazma chekdan oshsa — 422 `PAYMENT_EXCEEDS_TOTAL` |
| Q36 | `sales.outstanding` — STORED generated ustun (I13) | Ro'yxat filtri, nasiya limiti, qarzlar sahifasi bir qoidani o'qiydi; ilovada hisoblanmaydi (T-056) |
| Q37 | Bonus chekda saqlanadi (`bonus_used`, `bonus_earned`); `discount` bonus BILAN (API misoli) | Bekor qilishda aynan berilgan ball olinadi (foiz keyin o'zgarsa ham). Qaytarishda ball bilan to'langan ulush ball bo'lib qaytadi, berilgan ball ulush bo'yicha olinadi |
| Q38 | Nasiya chekni qaytarish avval QARZNI yopadi (`debt_paid += offset`), qolgani naqd | To'lanmagan tovar uchun kassadan pul chiqmasin. Qaytarish hujjatida: `paid_cash` — naqd, `debt_paid` — hisob. Bekor qilinsa — qarz qayta ochiladi |
| Q39 | Qaytarishi yoki qarz to'lovi bor chek bekor qilinmaydi — 409 `SALE_NOT_CANCELLABLE`; qaytarish hujjatini bekor qilish uni teskari qiladi | Tovar/pul ikki marta qaytmasin. Qaytarish qatori asl qatorga bog'langan (`return_of_id`) — miqdor aniq qator bo'yicha cheklanadi |
| Q40 | `StockService`: `prepare` (qulf + qoldiq/omborlar BITTA so'rovda) / `writeCtes` / `apply` | Hujjat ombor yozuvini o'z so'roviga qo'shadi; ombor amallari 3 so'rov (4 edi) |
| Q41 | `uuidv7` jarayon ichida MONOTON (RFC 9562 §6.2) | Bir millisekunddagi id'lar yaratilish tartibida — `transfer_out` → `transfer_in`, jurnal tartibi barqaror |
| Q42 | Cheklar ro'yxati kalitli (`date DESC, id DESC`), indeks `(tenant_id, date, id)` | 10 §10.5 cheklarni uzun jurnal deb belgilaydi. `payment=cash\|card\|transfer` — holatdan qat'i nazar, `debt` — qarzi bor |
| Q43 | Har sotuv (naqdsiz ham) va qaytarish ochiq smenani talab qiladi; bekor qilish — faqat naqd qaytarilsa | 04-api §4 tekshiruvlar tartibi (1-qadam) va I8 ro'yxati |
| Q44 | `sales.shift_id` qo'shildi (boshqa pul hujjatlarida bor edi) + `shift_id` indekslari | Z-hisobot vaqt oralig'i bilan emas, aniq smena bo'yicha yig'iladi — bitta agregat so'rov (T-061) |
| Q45 | `client_balances` — `security_invoker` ko'rinish | Ko'rinish egasi (`crm`) huquqi bilan ishlasa RLS chetlab o'tilardi; endi so'rovchi (`crm_app`) roli bilan — test bilan tasdiqlangan |
| Q46 | Xom SQL'da `id` ilovada (`uuidv7`) | `@default(uuid(7))` Prisma mijozida yaratiladi, bazada sukut yo'q |
| Q47 | Xarajat tahririda naqd farqi joriy smenaga, qator shu smenaga ko'chadi | Frontend qoidasi (eski ta'sir qaytarib, yangisi). Yopilgan smena snapshot qiymatlari (kutilgan/sanalgan) o'zgarmaydi |
| Q48 | Takrorlanuvchi xarajat: cron `5 0 * * *` Toshkent, har tenant alohida tranzaksiya, shablonlar `FOR UPDATE` | I21: parallel instansiya ikkinchi marta yaratmaydi (advisory lock o'rniga qator qulfi — tenant ichida aniqroq). Shared `isTemplateDue` mahalliy sana bilan — `businessCalendarDate` |
| Q49 | Nasiya qoidasi `CreditService` da (sotuv, taklif) | T-066; qarz yig'indisi registr qulfidan keyin o'qiladi |
| Q50 | `purchase_orders.received_value` (qabulda oshadi) + `outstanding` generated ustun | I18 kreditorlik bazada (Q36 kabi): ta'minotchi kartasi, to'lov tekshiruvi bir qoidani o'qiydi. Kelgan qiymat ulush yig'indisi bo'yicha — to'liq kelganda aynan buyurtma summasi |
| Q51 | Ta'minotchiga to'lov ≤ qarz (kelgan tovar − to'langan) — oldindan to'lov yo'q | PLAN T-070 va I18. Eski (frontend) ma'lumotda oldindan to'lov bo'lishi mumkin — shuning uchun baza CHECK'i qo'yilmadi, `outstanding` 0 dan past tushmaydi |
| Q52 | Buyurtma/qabul — `suppliers` huquqi (omborchi ham), to'lov — `finance` | Omborchi tovar qabul qiladi, pul bilan ishlamaydi (shared huquq matritsasi) |
| Q53 | Shared `poReceivedValue` qatorni so'mgacha yaxlitlaydi | Kasr miqdorda (kg, m) server hisobi bilan bir xil bo'lishi uchun |
| Q54 | Haydovchi roli yo'q — haydovchi ko'rinishi token'dagi XODIM bo'yicha (`/deliveries/my`); tahrir huquqisiz foydalanuvchi faqat o'ziga biriktirilgan yetkazish holatini o'zgartiradi | TZ/matritsada haydovchi roli yo'q; xodim tokendan — soxtalashtirib bo'lmaydi |
| Q55 | SMS navbati bazada (`message_recipients`, outbox), ishchi `SKIP LOCKED` + "ijara" (`next_attempt_at`) | Redis'siz ham ishonchli: jarayon o'lsa xabar yo'qolmaydi, bir necha instansiya ikki marta yubormaydi; HTTP yuborish tranzaksiyadan tashqarida. E12 BullMQ faqat "uyg'otuvchi" bo'lishi mumkin |
| Q56 | `tenants_with_due_messages()` — SECURITY DEFINER funksiya | RLS ostidagi ishchi barcha tenantlarni aylanmasin: faqat ishi borlarining id'si (ma'lumot emas) |
| Q57 | RLS testi — sanoq o'rniga tuzilma: `tenant_id` li har jadvalda RLS + FORCE + siyosat | Yangi jadval siyosatsiz qolsa test yiqiladi (qo'lda son yangilash kerak emas) |
| Q58 | Kunlik agregat — YAGONA ta'rif: `daily_*_live` (`security_invoker` ko'rinish), MV = `SELECT * FROM live` | I4 qoidasi bir joyda; "bugun jonli" qism MV bilan aynan bir xil hisoblanadi |
| Q59 | MV'ga RLS qo'llab bo'lmaydi → `crm_app` dan SELECT olib qo'yildi, o'qish `tenant_daily_*` (`current_tenant_id()` filtri, `security_barrier`) orqali; yangilash — SECURITY DEFINER funksiya | Izolyatsiya RLS darajasida qoladi; faqat egasi REFRESH qila oladi |
| Q60 | `report_refresh_state`: MV faqat oxirgi yangilanish KUNIDAN oldingi kunlar uchun, qolgani jonli | Kechki yangilash yiqilsa ham hisobot to'g'ri (sekinroq). Yangilanmagan bo'lsa — hammasi jonli |
| Q61 | Hisobot keshi: tenant versiyasi + global davr; bekor qilish — `AuditService.log` (har pul/ombor amali jurnalga tushadi, I22) | T-085; faqat tugallangan davr. Ko'p instansiyada versiya Redis'ga (T-096) |
| Q62 | P&L bitta so'rovda (savdo + xarajat); TZ'dagi alohida `/reports/*` yo'llari `pnl` bo'limlari sifatida | PLAN T-082 bitta hisobotni talab qiladi; byudjet ≤ 2 dan kam |
| Q63 | Fayl huquqi TURIGA bog'liq (`FILE_RULES.resource`: rasm — products, eksport — finance, zaxira — settings) va servisda tekshiriladi; `/files` yo'llari every-route-guarded oq ro'yxatida | Bitta `/files/:id` turli bo'lim fayllarini beradi — statik `@RequirePermission` yetmaydi |
| Q64 | Tasdiqlash: hajm (HEAD), sehrli baytlar (Range 0–255), ≤ 10 MB bo'lsa to'liq SHA-256 (oqim bilan) | Mijoz e'loniga ishonilmaydi (09 §9.9). Katta fayllarni (eksport/zaxira) server o'zi yozadi |
| Q65 | Karantin va tasdiqlashdagi kvota xatosi — `CommittedDomainError`: holat + audit SAQLANADI, mijozga 422/413 | Oddiy xato tranzaksiyani bekor qilib, rad etish izini ham o'chirardi |
| Q66 | Presign poygasi: `INSERT … ON CONFLICT (tenant_id, sha256, kind) DO NOTHING` | P2002 tutib bo'lmaydi — tranzaksiya buziladi (Q28 kabi) |
| Q67 | Band hajm: faqat `ready` hisoblanadi, tasdiqlashda atomik `UPDATE … WHERE used + size <= limit`; variantlar hisobga kirmaydi | Parallel yuklashlar kvotani birga oshirmaydi; pending/karantin joy egallamaydi |
| Q68 | GC: S3 obyektlari qator qulfi USHLANGAN holda, qator keyin o'chadi; har tenant alohida tranzaksiya, 500 tadan | S3 xatosida hech narsa yo'qolmaydi (keyingi aylanishda qayta); teskari tartibda S3'da hech kim bilmaydigan obyekt qolardi |
| Q69 | Yetim rasm: 24 soat grace; o'chirilgan mahsulot rasmi ham yetim, lekin mahsulot tiklansa fayl ham tiklanadi (qulf tartibi fayl → mahsulot, GC bilan bir xil) | 09 §9.10 — 30 kunlik undo; forma to'ldirilayotgan rasm o'chmasin |
| Q70 | Variantlar ishchisi `variants='{}'` bilan oladi (`SKIP LOCKED`); S3 xatosida NULL (qayta), o'qilmaydigan rasm/yo'q obyektda `{}` (qayta urinish yo'q); `limitInputPixels` 25 Mpx, bir vaqtda bitta rasm | Instansiyalar ikki marta yasamaydi; "dekompressiya bombasi" 512 MB instansiyani yiqitmaydi; `FILE_VARIANTS_INTERVAL_MS=0` — o'chiq |
| Q71 | `storage_used_bytes` tunlik solishtiruvi `files:purge` ichida — faqat ogohlantirish | 10 §10.2 3-sharti; avtomatik tuzatish sababni yashirardi |
| Q72 | Realtime: socket.io, `/events`; token qo'l siqish middleware'ida (ulanish OLDIN rad etiladi), xona `tenant:{id}`, token muddati tugaganda uziladi; CORS — HTTP bilan bir xil (`RealtimeIoAdapter`) | Tokensiz ulanish ochilmaydi, mijozda xona tanlash yo'q. Ko'p instansiyada socket.io Redis adapteri kerak (E15) |
| Q73 | `onCommit`: eng tashqi `inTenantTransaction` COMMIT'dan keyin bajaradi, javobni kutdirmaydi, xato loglanadi | Hodisa va navbat ishi faqat SAQLANGAN ma'lumot haqida; bitta mexanizm ikkalasiga |
| Q74 | `stock.changed` — `StockService.apply` da (mustaqil ombor amallari, har ombor uchun); hujjatlar (sotuv, kirim) o'z hodisasini e'lon qiladi | DRY; sotuv hodisasi mijozda ombor keshini ham bekor qiladi (06 §6.7) |
| Q75 | Navbat — "uyg'otuvchi": asl holat bazada (SMS outbox, `variants IS NULL`, `exports`), BullMQ `attempts: 1`; ishchisi o'chiq ish qo'shilmaydi (`*_INTERVAL_MS=0` — testlar) | Redis yo'qolsa ham ish yo'qolmaydi (interval zaxira); qayta urinish bitta joyda — bazada |
| Q76 | MV yangilash navbat orqali, kunlik kalit bilan (`refresh-report-views-{sana}`) | Bir necha instansiya cron'i bitta ishga aylanadi (+ SQL advisory qulf) |
| Q77 | "Eskirgan kun" belgisi: `sales` triggeri (o'tgan kunga tegadigan INSERT/UPDATE: bekor qilish, summa, to'lov, sana) → `tenant_state.report_dirty_from`; hisobot chegarasi `LEAST(yangilanish kuni, eskirgan kun)`; yangilash 1 soatdan eski belgini tozalaydi | Offline orqa sanali chek, kechagi chekni bekor qilish, migratsiya importi hisobotda DARHOL (avval — ertasi kechagacha eskirgan edi). Qarz to'lovi belgilamaydi |
| Q78 | Optimistik qulf versiyasi — `updated_at` (Prisma `@updatedAt` + tahrirlanadigan maydonni o'zgartiradigan xom SQL: ommaviy narx, import, kirim tannarxi); qoldiq (trigger) va bonus tegmaydi; solishtirish millisekund oralig'ida | Kassa sotuvi kartani tahrirlayotgan adminni to'smaydi; JSON'dagi ms qiymat bazadagi µs bilan mos. Faqat CRUD spravochniklar (TZ: "oddiy CRUD'da"); `If-Match` ixtiyoriy |
| Q79 | 409 dagi `current` ham rol bo'yicha tozalanadi (filtrda); `stripHidden` faqat oddiy obyektlarga | Interceptor xato javobiga yetmaydi; `StreamableFile`/Buffer buzilmasin |
| Q80 | Eksport: ≤ 5000 qator — javobda; ko'p — `exports` ishi + navbat, sahifalab (1000; har sahifa qisqa tranzaksiya), fayl `putDirect` (kvota, dedupe); faqat so'rovchi ko'radi/yuklaydi (`/exports/jobs/:id/download`), fayl 7 kundan keyin o'chiriladi | 09 §9.2: ko'rish — so'rovchi; uzun tranzaksiya qulf ushlamasin; 50 MB chegarasi (`FILE_RULES.export`) — 512 MB xotira |
| Q81 | CSV qoidasi `@crm/shared` da (`csvLine`, BOM, `\r\n`, formula in'yeksiyasidan himoya) | Frontend eksporti (E13) ham shunga o'tadi — bitta qoida |
| Q82 | Migratsiya: `planImport` (sof, yozmaydi — dry-run ham shu) + `MigrationWriter` (jadval tartibida, `jsonb_to_recordset` bilan ommaviy, `ON CONFLICT DO NOTHING`); id — `uuidv5(tur:eski-id, tenant)` | Qayta yuborish ikkilanmaydi, havolalar xaritasiz tiklanadi; har jadvalga bitta INSERT — 10 000 yozuv ham bir necha so'rov |
| Q83 | Migratsiya yo'li: tana 25 MB (qolgani 4 MB), tranzaksiya 300 s (`@TransactionTimeout`) | localStorage ~5–10 MB + base64 rasmlar; uzun chegara FAQAT shu yo'lga |
| Q84 | Tariflar va narxlar `@crm/shared` da; chegara `PlanService` da — tenant bo'yicha advisory qulfdan KEYIN sanaladi (qulf COMMIT'gacha); joy egallaydigan har yo'l: yaratish, qayta faollashtirish, tiklash, arxivdan qaytarish; migratsiya importi — yozishdan oldingi va keyingi son solishtiriladi | Mijoz "ishlatilgan / chegara" ni shu manbadan ko'rsatadi; parallel qo'shish oxirgi joyni birga egallamaydi (Q21 naqshi); takroriy import (son o'smaydi) chegarada ham o'tadi |
| Q85 | Payme/Click webhook'lari ochiq yo'l, kalit/imzo servisda (`timingSafeEqual`); tenant — `billing_invoice_tenant()` (SECURITY DEFINER, faqat id); hisob-faktura qatori `FOR UPDATE` | Tenant tokeni yo'q; RLS ostida boshqa tenant ma'lumoti ochilmaydi; parallel takroriy webhook bitta tasdiq beradi |
| Q86 | Payme biznes xatosi tranzaksiya ichida QIYMAT sifatida qaytadi, COMMIT'dan keyin otiladi | Muddati o'tgan tranzaksiyani bekor qilish xato javob bilan birga saqlanishi kerak (otilsa ROLLBACK bo'lardi) |
| Q87 | Faqat-o'qish holati — eng tashqi interceptor (tranzaksiyadan oldin), holat 30 s keshlanadi va o'zgarganda bekor qilinadi; ruxsatlar `@AllowReadOnlyTenant` | Bloklangan yozuv ulanish olmaydi; to'lov/o'chirishni bekor qilish/zaxira ochiq qoladi. So'rov byudjeti testlari barqaror holatni o'lchaydi — holat keshini (sozlama kabi) oldindan isitadi |
| Q88 | `purge_tenant()` — SECURITY DEFINER, qat'iy tartibli ro'yxat + oxirida `tenant_id` li HAR jadval tekshiruvi; append-only triggerlar DELETE'ni faqat `app.purge_tenant` bayrog'i + `current_user <> session_user` bilan o'tkazadi | Yangi jadval ro'yxatga qo'shilmasa jimgina qolib ketmaydi; ilova roli bayroqni o'zi qo'ysa ham jurnalni o'chira olmaydi |
| Q89 | Zaxira: `@ManualTransaction` — surat alohida REPEATABLE READ tranzaksiyada (faqat o'qish), fayl + jurnal keyin oddiy tranzaksiyada | Bitta izchil surat (chek bor, qatori yo'q bo'lmaydi); suratli tranzaksiyada `tenant_state` (issiq qator) yangilansa parallel sotuv bilan serializatsiya xatosi bo'lardi |
| Q90 | Zaxira JSON'i oqim bilan: ro'yxatlar kalitli sahifalab (1000, `id > after`) → gzip; xotirada faqat siqilgan nusxa | Katta do'kon (yillar davomidagi cheklar) 512 MB instansiyani to'ldirmaydi (global qoida: katta natija — sahifalab) |
| Q91 | Zaxira kvotaga kiradi (`putDirect`), lekin 1 soatdan keyin yumshoq o'chiriladi va 30 kun kutmasdan tozalanadi | Takroriy zaxira hajmni to'ldirib qo'ymaydi; tiklash (undo) zaxiraga kerak emas |
| Q92 | Fiskal navbat — outbox (`fiscal_receipts`, chek bilan bitta so'rovda), ishchi SMS naqshida (`SKIP LOCKED` + ijara, HTTP tranzaksiyadan tashqarida, `tenants_with_due_fiscal()`) | OFD ishlamasa sotuv to'xtamaydi va chek yo'qolmaydi (jarayon o'lsa ham); instansiyalar ikki marta yubormaydi, takrorni OFD `Idempotency-Key` bilan taniydi |
| Q93 | Fiskal qayta urinish: 1, 2, 4 … daqiqa, soatiga birdan siyrak emas — to'xtamaydi; 24 soat o'tsa yoki OFD rad etsa (4xx) — bir marta ogohlantirish (`fiscal.overdue` / `fiscal.rejected` jurnal + `critical` log) | Fiskal chek qonuniy talab — vaqtincha uzilishdan keyin o'zi tiklanadi; rad etilgani qayta yuborilmaydi (odam aralashuvi kerak) |
| Q94 | Fon ishi o'z so'rov kontekstida (`runWithContext`, `userId` yo'q) | Aks holda sotuvdan keyin inline ishga sotuvchi konteksti meros qolib, ogohlantirish jurnali uning nomiga yozilardi; kontekstsiz esa `AuditService` jimgina yozmasdi |
| Q95 | Frontend integratsiyasi bo'yicha tavsiyalar (TanStack Query kalitlari va `AFFECTS` xaritasi, realtime 250 ms yig'ish, offline navbat faqat sotuv uchun, summalar serverdan) — `docs/api/README.md` §9, §12 da | Frontend implementatsiyasi qaytarilgan (C32); qarorni frontend dasturchi qabul qiladi |
| Q96 | Login/refresh do'kon holatini TEKSHIRMAYDI — faqat bo'shatilgan xodim 423; holat javobda: `user.tenant.status` | T-127: `suspended`/`deleting` — faqat o'qish (`ReadOnlyTenantInterceptor`); avval 423 tufayli admin kira olmay, to'lay olmas va o'chirishni bekor qila olmas edi |
| Q97 | `TRUST_PROXY` — ishonchli proksi hop'lari soni (sukut 0, production 1); `true` ishlatilmaydi | Rate limit kaliti `req.ip`: proksi ortida hamma bitta IP edi (butun tizimga 10 login/daq). `true` X-Forwarded-For dagi mijoz yozgan manzilni olardi — soxtalashtirib chegarani aylanib o'tish mumkin bo'lardi |
| Q98 | `ExportJobDto.url` + `expiresAt` — tayyor fon eksportining imzolangan havolasi | `…/download` (302) ga `fetch` API alohida domenda bo'lsa CORS'da yiqiladi (yo'naltirishda `Origin: null`); JSON havola `window.location` bilan ochiladi. 302 yo'li qoldi |
| Q99 | Seed: sement `altFactor` `0.02` (asosiy `qop`, qo'shimcha `kg`) | `altFactor` = 1 qo'shimcha birlik necha asosiy birlik (`@crm/shared` units); `50` «1 kg = 50 qop» degani edi |

## Muhim eslatmalar

- `apps/api/.env` mahalliy (repoda yo'q). Namuna: `.env.example`
- JWT kalitlari: `apps/api/secrets/` (repoda yo'q) — `scripts/gen-keys.sh`
- Sxema yozishda tartib: invariantlar → sxema (TZ tavsiyasi)
- Prisma generatori o'zgargan (`relationJoins`, Q12) — yangi klon yoki
  `git pull` dan keyin: `npm run db:generate -w @crm/api`
- Audit amal bilan BIR tranzaksiyada yoziladi (Q25) — testda javobdan
  keyin darhol o'qish mumkin
- Ombor qoldig'ini faqat `StockService.apply` o'zgartiradi (qulf + harakat
  + I1 trigger). Mahsulotning `stock` ustiniga to'g'ridan-to'g'ri yozilmaydi
- SECURITY DEFINER funksiyalar (`tenants_with_*`, `refresh_report_views`)
  tenantlararo o'qiydi/yozadi: jadval egasi (migratsiya roli) superuser yoki
  `BYPASSRLS` bo'lishi SHART — `FORCE RLS` egaga ham qo'llanadi (Docker
  Postgres'da `POSTGRES_USER` — superuser)
- CI (`ci.yml`) yangilangan: Postgres + Redis + MinIO, JWT kalitlari,
  `crm_app`, OpenAPI drift — lekin GitHub'da hali ishga tushirilmagan (T-120)
- OFD yoqilsa (`OFD_ENABLED=true`) `OFD_ENDPOINT` va `OFD_TOKEN` majburiy;
  testlarda `FISCAL_PROVIDER` soxtasi bilan almashtiriladi (`ofd-degraded`)
- Testlar Redis'ni (6380) faqat `queue-bullmq` da ishlatadi; ilova testda
  `inline` navbat bilan
