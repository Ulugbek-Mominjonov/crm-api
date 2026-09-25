-- ═══════════════════════════════════════════════════════════════════
-- Fayllar reyestri (09 §9.5, T-087)
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "FileKind" AS ENUM ('product_image', 'document', 'export', 'import', 'tenant_backup', 'avatar');
-- pending — presign berildi; ready — tekshirildi; quarantined — tarkib rad etildi
CREATE TYPE "FileStatus" AS ENUM ('pending', 'ready', 'quarantined');

CREATE TABLE files (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  kind           "FileKind" NOT NULL,
  -- To'liq S3 kaliti `t/{tenantId}/...` — faqat server yasaydi
  key            text NOT NULL UNIQUE,
  bucket         text NOT NULL,
  mime           text NOT NULL,
  size_bytes     bigint NOT NULL CHECK (size_bytes > 0),
  sha256         text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  original_name  text,
  status         "FileStatus" NOT NULL DEFAULT 'pending',
  -- Rasm variantlari: {"128": "<kalit>", "512": "<kalit>"} (T-091)
  variants       jsonb,
  uploaded_by_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

-- Bir xil tarkib ikki marta saqlanmaydi (09 §9.9)
CREATE UNIQUE INDEX "files_tenant_id_sha256_kind_key" ON files (tenant_id, sha256, kind);
CREATE UNIQUE INDEX "files_tenant_id_id_key" ON files (tenant_id, id);
-- GC: eskirgan pending (09 §9.10)
CREATE INDEX "files_status_created_at_idx" ON files (status, created_at);
CREATE INDEX "files_tenant_id_deleted_at_idx" ON files (tenant_id, deleted_at);
-- Rasm variantlari navbati: tayyor, variantsiz mahsulot rasmlari
CREATE INDEX files_variants_due ON files (tenant_id, created_at)
  WHERE status = 'ready' AND kind = 'product_image' AND variants IS NULL AND deleted_at IS NULL;

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
CREATE POLICY files_tenant_isolation ON files
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Mahsulot rasmi — havola (matn emas). Fayl o'chsa mahsulot qoladi, faqat
-- rasmi uziladi. `SET NULL (image_file_id)` (PG15+): kompozit FK tenant
-- ustunini NOLGA chiqarmaydi (Q5 dagi muammo)
ALTER TABLE products ADD COLUMN image_file_id uuid;
ALTER TABLE products
  ADD CONSTRAINT "products_image_file_id_same_tenant"
  FOREIGN KEY (tenant_id, image_file_id) REFERENCES files (tenant_id, id)
  ON DELETE SET NULL (image_file_id) ON UPDATE CASCADE;
-- Havolasi bor faylni aniqlash (GC hech qachon uni o'chirmaydi)
CREATE INDEX "products_image_file_id_idx" ON products (image_file_id) WHERE image_file_id IS NOT NULL;

-- Tenant band qilgan hajm — hisoblagich (SUM emas, 09 §9.5). Yagona
-- yozuvchi — FilesService
ALTER TABLE tenant_state
  ADD COLUMN storage_used_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0);

-- Fon ishchisi: variant yasash kerak bo'lgan tenantlar (faqat id)
CREATE OR REPLACE FUNCTION tenants_with_pending_variants()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT tenant_id FROM files
   WHERE status = 'ready' AND kind = 'product_image' AND variants IS NULL AND deleted_at IS NULL
$$;
REVOKE ALL ON FUNCTION tenants_with_pending_variants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenants_with_pending_variants() TO crm_app;
