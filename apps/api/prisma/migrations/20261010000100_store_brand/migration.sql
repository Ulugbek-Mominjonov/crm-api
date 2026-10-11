-- ═══════════════════════════════════════════════════════════════════
-- Do'kon brendi (Q117): asosiy rang va logotip.
--
-- Mavjud do'konlarda ikkalasi NULL — standart rang, logotipsiz; ko'chirish
-- kerak emas. Logotip — matn emas, `files` ga havola (mahsulot rasmi kabi).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE settings
  ADD COLUMN brand_color varchar(7) CONSTRAINT settings_brand_color_check CHECK (brand_color ~ '^#[0-9A-F]{6}$'),
  ADD COLUMN logo_file_id uuid;

-- Fayl o'chsa logotip uziladi. `SET NULL (logo_file_id)` (PG15+): kompozit FK
-- tenant ustunini NOLGA chiqarmaydi; begona do'kon faylini bog'lab bo'lmaydi
ALTER TABLE settings
  ADD CONSTRAINT "settings_logo_file_id_same_tenant"
  FOREIGN KEY (tenant_id, logo_file_id) REFERENCES files (tenant_id, id)
  ON DELETE SET NULL (logo_file_id) ON UPDATE CASCADE;
-- Alohida indeks kerak emas: do'konda bitta qator, (tenant_id, …) qidiruvi — PK

-- Rasm variantlari (128/512) — logotipga ham: navbat indeksi va ishchi funksiyasi
DROP INDEX files_variants_due;
CREATE INDEX files_variants_due ON files (tenant_id, created_at)
  WHERE status = 'ready' AND kind IN ('product_image', 'store_logo') AND variants IS NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION tenants_with_pending_variants()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT tenant_id FROM files
   WHERE status = 'ready' AND kind IN ('product_image', 'store_logo') AND variants IS NULL AND deleted_at IS NULL
$$;
