-- ═══════════════════════════════════════════════════════════════════
-- Obuna (E16): to'lovlar (T-126) va do'kon hayot sikli (T-127)
-- ═══════════════════════════════════════════════════════════════════

-- Tarif muddati: to'lov tasdiqlangach uzayadi; o'tsa (imtiyoz bilan) —
-- `suspended` (o'qish mumkin, yozish yo'q). O'chirish so'ralsa — 30 kun
-- muhlat (`deleting`), keyin ma'lumot va fayllar to'liq o'chadi
ALTER TABLE tenants
  ADD COLUMN plan_expires_at       timestamptz,
  ADD COLUMN deletion_scheduled_at timestamptz,
  ADD CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'deleting'));

CREATE TYPE "InvoiceState" AS ENUM ('created', 'pending', 'paid', 'cancelled');

-- Hisob-faktura: tarif × oy. Provayder tranzaksiyasi bilan bog'lanadi;
-- tarif FAQAT `paid` bo'lganda o'zgaradi
CREATE TABLE billing_invoices (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  plan           text NOT NULL,
  months         int NOT NULL CHECK (months BETWEEN 1 AND 12),
  amount         bigint NOT NULL CHECK (amount > 0),
  state          "InvoiceState" NOT NULL DEFAULT 'created',
  provider       text CHECK (provider IN ('payme', 'click')),
  provider_tx_id text,
  -- Payme: tranzaksiya yaratilgan vaqt (ms) — javoblarda aynan qaytariladi
  provider_time  bigint,
  created_by_id  uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  int
);
CREATE UNIQUE INDEX "billing_invoices_tenant_id_id_key" ON billing_invoices (tenant_id, id);
-- Webhook takrori: bir provayder tranzaksiyasi — bitta hisob-faktura
CREATE UNIQUE INDEX "billing_invoices_provider_tx_key" ON billing_invoices (provider, provider_tx_id)
  WHERE provider_tx_id IS NOT NULL;
CREATE INDEX "billing_invoices_tenant_id_created_at_idx" ON billing_invoices (tenant_id, created_at);

ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_invoices_tenant_isolation ON billing_invoices
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Webhook tenantsiz keladi: faqat id bo'yicha tenantni topish (ma'lumot emas)
CREATE OR REPLACE FUNCTION billing_invoice_tenant(p_invoice uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM billing_invoices WHERE id = p_invoice
$$;
CREATE OR REPLACE FUNCTION billing_tx_tenant(p_provider text, p_tx text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM billing_invoices WHERE provider = p_provider AND provider_tx_id = p_tx
$$;
-- Payme GetStatement: provayder tranzaksiyalari vaqt oralig'ida (tenantlararo, faqat to'lov maydonlari)
CREATE OR REPLACE FUNCTION billing_statement(p_provider text, p_from bigint, p_to bigint)
RETURNS TABLE (id uuid, amount bigint, provider_tx_id text, provider_time bigint, state "InvoiceState",
               paid_at timestamptz, cancelled_at timestamptz, cancel_reason int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, amount, provider_tx_id, provider_time, state, paid_at, cancelled_at, cancel_reason
    FROM billing_invoices
   WHERE provider = p_provider AND provider_time BETWEEN p_from AND p_to
   ORDER BY provider_time
$$;
REVOKE ALL ON FUNCTION billing_invoice_tenant(uuid), billing_tx_tenant(text, text), billing_statement(text, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_invoice_tenant(uuid), billing_tx_tenant(text, text), billing_statement(text, bigint, bigint) TO crm_app;

-- Faqat qo'shiladigan jadvallar (audit, ombor jurnali): O'CHIRISH faqat
-- do'konni to'liq tozalashda (`purge_tenant`, egasi huquqi bilan) va aynan
-- o'sha tenant qatorlari uchun. Ilova roli bayroqni o'zi qo'ysa ham ishlamaydi:
-- `current_user = session_user` (SECURITY DEFINER ichida emas)
CREATE OR REPLACE FUNCTION reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_user <> session_user
     AND current_setting('app.purge_tenant', true) = OLD.tenant_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% jadvali faqat qo''shish uchun (% urinishi)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;

-- Do'konni to'liq o'chirish (T-127): bolalardan otaga, bitta tranzaksiyada.
-- Oxirida tekshiruv: tenant_id li biror jadvalda qator qolsa — XATO (yangi
-- jadval bu ro'yxatga qo'shilmagan bo'lsa, jimgina qolib ketmasin)
CREATE OR REPLACE FUNCTION purge_tenant(p_tenant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t text;
  left_rows bigint;
BEGIN
  -- Faqat muhlati o'tgan o'chirish so'rovi — ilova xatosi faol do'konni o'chirmasin
  IF NOT EXISTS (SELECT 1 FROM tenants
                  WHERE id = p_tenant AND status = 'deleting' AND deletion_scheduled_at <= now()) THEN
    RAISE EXCEPTION 'purge_tenant: % o''chirishga rejalashtirilmagan yoki muhlat tugamagan', p_tenant;
  END IF;
  PERFORM set_config('app.purge_tenant', p_tenant::text, true);
  FOREACH t IN ARRAY ARRAY[
    'message_recipients', 'messages', 'audit_log', 'exports', 'billing_invoices', 'deliveries', 'debt_payments',
    'supplier_payments', 'quote_items', 'quotes', 'sale_items', 'sales', 'stock_movements', 'po_items',
    'purchase_orders', 'cash_movements', 'cash_shifts', 'expenses', 'expense_templates', 'product_stocks', 'products',
    'files', 'categories', 'suppliers', 'clients', 'warehouses', 'idempotency_keys', 'doc_counters', 'users',
    'employees', 'settings', 'tenant_state'
  ] LOOP
    EXECUTE format('DELETE FROM %I WHERE tenant_id = $1', t) USING p_tenant;
  END LOOP;
  DELETE FROM tenants WHERE id = p_tenant;

  FOR t IN SELECT c.table_name FROM information_schema.columns c
             JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
            WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND tb.table_type = 'BASE TABLE' LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = $1', t) INTO left_rows USING p_tenant;
    IF left_rows > 0 THEN
      RAISE EXCEPTION 'purge_tenant: % jadvalida % qator qoldi', t, left_rows;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION purge_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_tenant(uuid) TO crm_app;
