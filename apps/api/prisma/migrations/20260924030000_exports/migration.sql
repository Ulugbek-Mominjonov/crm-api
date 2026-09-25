-- ═══════════════════════════════════════════════════════════════════
-- Eksport ishlari (T-084, 09 §9.2): katta eksport fonda yasaladi va
-- S3'ga (`files`, kind = export) qo'yiladi; ko'rish — faqat so'rovchi
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "ExportStatus" AS ENUM ('queued', 'running', 'ready', 'failed');

CREATE TABLE exports (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  resource    text NOT NULL,
  format      text NOT NULL CHECK (format IN ('csv', 'json')),
  params      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      "ExportStatus" NOT NULL DEFAULT 'queued',
  row_count   integer,
  file_id     uuid,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT "exports_user_id_same_tenant" FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id),
  -- Fayl o'chsa (muddati o'tgan eksport) ish yozuvi qoladi, havola uziladi
  CONSTRAINT "exports_file_id_same_tenant" FOREIGN KEY (tenant_id, file_id)
    REFERENCES files (tenant_id, id) ON DELETE SET NULL (file_id)
);

CREATE UNIQUE INDEX "exports_tenant_id_id_key" ON exports (tenant_id, id);
-- "Mening eksportlarim" va eskilarini tozalash
CREATE INDEX "exports_tenant_id_user_id_created_at_idx" ON exports (tenant_id, user_id, created_at);

ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports FORCE ROW LEVEL SECURITY;
CREATE POLICY exports_tenant_isolation ON exports
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
