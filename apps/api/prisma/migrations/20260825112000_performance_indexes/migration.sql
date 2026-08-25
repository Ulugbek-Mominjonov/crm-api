-- ═══════════════════════════════════════════════════════════════════
-- Ish unumdorligi indekslari
-- Manba: backend-tz/core/10-performance.md §10.4
--
-- Qoida: har bir indeks `tenant_id` dan boshlanadi — barcha so'rovlar
-- shu bilan filtrlanadi, boshqa tartib indeksni foydasiz qiladi.
-- ═══════════════════════════════════════════════════════════════════

-- ── Qamrab oluvchi (covering) indeks: katalog ro'yxati ──────────────
-- Katalog eng ko'p so'raladigan joy. INCLUDE bilan Postgres jadval
-- sahifalariga umuman murojaat qilmaydi (Index Only Scan).
CREATE INDEX products_catalog
  ON products (tenant_id, archived, name)
  INCLUDE (sku, barcode, unit, price, wholesale_price, cost, stock, min_stock)
  WHERE deleted_at IS NULL;

-- ── Qisman (partial) indekslar ─────────────────────────────────────
-- Nasiya: sotuvlarning kichik ulushi, lekin Qarzlar sahifasi doim so'raydi
CREATE INDEX sales_open_debt
  ON sales (tenant_id, due_date, customer_id)
  WHERE status = 'pending' AND type = 'sale' AND deleted_at IS NULL;

-- Kam qolgan tovar: Dashboard va Ombor "taklif" tabi
CREATE INDEX products_low_stock
  ON products (tenant_id)
  WHERE stock <= min_stock AND archived = false AND deleted_at IS NULL;

-- Faol yetkazib berish
CREATE INDEX deliveries_active
  ON deliveries (tenant_id, scheduled_date)
  WHERE status IN ('pending', 'on_way') AND deleted_at IS NULL;

-- Ochiq kirim buyurtmalari (kreditorlik hisobi)
CREATE INDEX purchase_orders_open
  ON purchase_orders (tenant_id, due_date)
  WHERE status IN ('ordered', 'partial') AND deleted_at IS NULL;

-- ── Shtrix-kod: skaner har chekda ishlaydi, ILIKE kerak emas ────────
CREATE UNIQUE INDEX products_barcode_exact
  ON products (tenant_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

-- ── Matn qidiruvi (trigram) ────────────────────────────────────────
-- LIKE '%...%' oddiy indeksdan foydalanmaydi. Global qidiruv nom, SKU va
-- mijoz bo'ylab ishlaydi — 2000 tovarda ~5 ms.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX products_sku_trgm  ON products USING gin (sku gin_trgm_ops);
CREATE INDEX clients_name_trgm  ON clients  USING gin (name gin_trgm_ops);
CREATE INDEX suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops);

-- ── Hujjat raqami bo'yicha qidiruv (qaytarishda chek topish) ────────
CREATE INDEX sales_number_trgm ON sales USING gin (number gin_trgm_ops);
