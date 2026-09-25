-- ═══════════════════════════════════════════════════════════════════
-- Fiskal chek (T-129, 08 §8.9): OFD navbati
--
-- Chek (sotuv, qaytarish) yozilgan so'rovning O'ZIDA navbat qatori
-- qo'shiladi (`OFD_ENABLED` bo'lsa) — fiskallash COMMIT'dan keyin, tashqi
-- HTTP bilan. OFD ishlamasa sotuv to'xtamaydi: qator `pending` bo'lib
-- qoladi va eksponensial kechikish bilan qayta uriniladi.
-- ═══════════════════════════════════════════════════════════════════

-- pending — navbatda; sent — OFD ga yuborilmoqda (ijara: ishchi o'lsa qaytadi);
-- confirmed — fiskal raqam olindi; failed — OFD rad etdi (qayta urinish befoyda)
CREATE TYPE "FiscalStatus" AS ENUM ('pending', 'sent', 'confirmed', 'failed');

CREATE TABLE fiscal_receipts (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  -- Chek o'chsa (faqat `purge_tenant`) — navbat qatori ham
  sale_id         uuid NOT NULL REFERENCES sales (id) ON DELETE CASCADE ON UPDATE CASCADE,
  status          "FiscalStatus" NOT NULL DEFAULT 'pending',
  fiscal_id       text,
  qr_payload      text,
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  -- 24 soatdan beri o'tmagan (yoki rad etilgan) — administrator ogohlantirilgan
  alerted_at      timestamptz,
  fiscalized_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_receipts_sale_id_same_tenant
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fiscal_receipts_confirmed_has_id CHECK (status <> 'confirmed' OR fiscal_id IS NOT NULL)
);

CREATE UNIQUE INDEX "fiscal_receipts_sale_id_key" ON fiscal_receipts (sale_id);
CREATE INDEX "fiscal_receipts_tenant_id_status_idx" ON fiscal_receipts (tenant_id, status);
-- Navbat: faqat fiskallanmaganlar (qisman indeks — tasdiqlanganlar ko'payib ketsa ham kichik)
CREATE INDEX fiscal_receipts_due ON fiscal_receipts (tenant_id, next_attempt_at)
  WHERE status IN ('pending', 'sent');

ALTER TABLE fiscal_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY fiscal_receipts_tenant_isolation ON fiscal_receipts
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Ishchi faqat navbatida ishi bor tenantlarni aylanadi (id'lar, ma'lumot emas)
CREATE OR REPLACE FUNCTION tenants_with_due_fiscal(p_now timestamptz)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT tenant_id FROM fiscal_receipts
   WHERE status IN ('pending', 'sent') AND next_attempt_at <= p_now
$$;
REVOKE ALL ON FUNCTION tenants_with_due_fiscal(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenants_with_due_fiscal(timestamptz) TO crm_app;
