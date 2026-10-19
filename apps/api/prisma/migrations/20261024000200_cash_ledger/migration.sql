-- ═══════════════════════════════════════════════════════════════════
-- Kassa daftari (T-145): har bir naqd harakati — qaysi smenada, qaysi
-- hujjat, qaysi turda — o'zgarmas qator. Avval smena hisoboti qatorlari
-- hujjat jadvallaridan (chek `shift_id` …) yig'ilardi: boshqa smenada bekor
-- qilingan chek yoki o'chirilgan xarajat puli joriy smenada qaytardi, lekin
-- hisobot qatorlarida ko'rinmasdi (balans to'g'ri, qo'lda solishtirib
-- bo'lmasdi). Endi `cashCtes` har harakatni shu yerga ham yozadi va hisobot
-- aynan shundan tuziladi — qatorlar yig'indisi = `cash_in`/`cash_out`.
-- Tarix: mavjud hujjatlar va ularning teskari amallari vaqt tamg'asi
-- bo'yicha (o'sha paytda ochiq bo'lgan smena — I8: bir vaqtda bittasi) tiklanadi.
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "CashLedgerKind" AS ENUM (
  'sale', 'sale_cancel', 'return', 'return_cancel',
  'expense', 'expense_reversal', 'payroll', 'payroll_reversal',
  'debt_payment', 'supplier_payment', 'movement', 'delivery_fee'
);

-- `amount` ishorali: + kirim, − chiqim (`cash_shifts.cash_in/cash_out` bilan bir xil ma'no)
CREATE TABLE cash_ledger (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  shift_id   uuid NOT NULL,
  kind       "CashLedgerKind" NOT NULL,
  amount     bigint NOT NULL,
  -- Hujjat (chek, xarajat, to'lov, harakat); shablon xarajatlari to'plami — NULL
  ref_id     uuid,
  user_id    uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cash_ledger_tenant_id_shift_id_fkey" FOREIGN KEY (tenant_id, shift_id)
    REFERENCES cash_shifts (tenant_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT cash_ledger_amount_check CHECK (amount <> 0)
);
-- Smena hisoboti (bitta smenaning barcha harakatlari); hujjat bo'yicha izlash
CREATE INDEX "cash_ledger_tenant_id_shift_id_idx" ON cash_ledger (tenant_id, shift_id);
CREATE INDEX "cash_ledger_tenant_id_ref_id_idx" ON cash_ledger (tenant_id, ref_id) WHERE ref_id IS NOT NULL;

ALTER TABLE cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY cash_ledger_tenant_isolation ON cash_ledger
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────── Tarixni tiklash (bir martalik)

-- Chek va qaytarish naqdi — hujjat smenasiga (sotuv: +, qaytarish: −)
INSERT INTO cash_ledger (id, tenant_id, shift_id, kind, amount, ref_id, created_at)
SELECT gen_random_uuid(), s.tenant_id, s.shift_id,
       (CASE WHEN s.type = 'sale' THEN 'sale' ELSE 'return' END)::"CashLedgerKind",
       CASE WHEN s.type = 'sale' THEN s.paid_cash ELSE -s.paid_cash END, s.id, s.created_at
  FROM sales s
 WHERE s.shift_id IS NOT NULL AND s.paid_cash > 0 AND s.deleted_at IS NULL;

-- Bekor qilish — bekor qilingan paytda ochiq bo'lgan smenaga (naqd bekor qilish smenasiz bo'lmaydi, I8)
INSERT INTO cash_ledger (id, tenant_id, shift_id, kind, amount, ref_id, created_at)
SELECT gen_random_uuid(), s.tenant_id, sh.id,
       (CASE WHEN s.type = 'sale' THEN 'sale_cancel' ELSE 'return_cancel' END)::"CashLedgerKind",
       CASE WHEN s.type = 'sale' THEN -s.paid_cash ELSE s.paid_cash END, s.id, s.cancelled_at
  FROM sales s
  JOIN LATERAL (SELECT id FROM cash_shifts c
                 WHERE c.tenant_id = s.tenant_id AND c.opened_at <= s.cancelled_at
                   AND (c.closed_at IS NULL OR c.closed_at >= s.cancelled_at)
                 ORDER BY c.opened_at DESC LIMIT 1) sh ON true
 WHERE s.status = 'cancelled' AND s.cancelled_at IS NOT NULL AND s.paid_cash > 0 AND s.deleted_at IS NULL;

-- Naqd xarajat (o'chirilgani ham — pul o'sha paytda chiqqan) va uning o'chirilishi
INSERT INTO cash_ledger (id, tenant_id, shift_id, kind, amount, ref_id, user_id, created_at)
SELECT gen_random_uuid(), e.tenant_id, e.shift_id, 'expense', -e.amount, e.id, e.user_id, e.created_at
  FROM expenses e WHERE e.method = 'cash' AND e.shift_id IS NOT NULL;
INSERT INTO cash_ledger (id, tenant_id, shift_id, kind, amount, ref_id, created_at)
SELECT gen_random_uuid(), e.tenant_id, sh.id, 'expense_reversal', e.amount, e.id, e.deleted_at
  FROM expenses e
  JOIN LATERAL (SELECT id FROM cash_shifts c
                 WHERE c.tenant_id = e.tenant_id AND c.opened_at <= e.deleted_at
                   AND (c.closed_at IS NULL OR c.closed_at >= e.deleted_at)
                 ORDER BY c.opened_at DESC LIMIT 1) sh ON true
 WHERE e.method = 'cash' AND e.shift_id IS NOT NULL AND e.deleted_at IS NOT NULL;

-- Xodimga naqd to'lov va uning o'chirilishi
INSERT INTO cash_ledger (id, tenant_id, shift_id, kind, amount, ref_id, user_id, created_at)
SELECT gen_random_uuid(), p.tenant_id, p.shift_id, 'payroll', -p.amount, p.id, p.user_id, p.created_at
  FROM payroll_entries p WHERE p.method = 'cash' AND p.shift_id IS NOT NULL;
INSERT INTO cash_ledger (id, tenant_id, shift_id, kind, amount, ref_id, created_at)
SELECT gen_random_uuid(), p.tenant_id, sh.id, 'payroll_reversal', p.amount, p.id, p.deleted_at
  FROM payroll_entries p
  JOIN LATERAL (SELECT id FROM cash_shifts c
                 WHERE c.tenant_id = p.tenant_id AND c.opened_at <= p.deleted_at
                   AND (c.closed_at IS NULL OR c.closed_at >= p.deleted_at)
                 ORDER BY c.opened_at DESC LIMIT 1) sh ON true
 WHERE p.method = 'cash' AND p.shift_id IS NOT NULL AND p.deleted_at IS NOT NULL;

-- Naqd qarz to'lovi (+), ta'minotchiga naqd to'lov (−), qo'lda kirim/chiqim (±)
INSERT INTO cash_ledger (id, tenant_id, shift_id, kind, amount, ref_id, user_id, created_at)
SELECT gen_random_uuid(), d.tenant_id, d.shift_id, 'debt_payment', d.amount, d.id, d.user_id, d.created_at
  FROM debt_payments d WHERE d.method = 'cash' AND d.shift_id IS NOT NULL;
INSERT INTO cash_ledger (id, tenant_id, shift_id, kind, amount, ref_id, user_id, created_at)
SELECT gen_random_uuid(), sp.tenant_id, sp.shift_id, 'supplier_payment', -sp.amount, sp.id, sp.user_id, sp.created_at
  FROM supplier_payments sp WHERE sp.method = 'cash' AND sp.shift_id IS NOT NULL;
INSERT INTO cash_ledger (id, tenant_id, shift_id, kind, amount, ref_id, user_id, created_at)
SELECT gen_random_uuid(), m.tenant_id, m.shift_id, 'movement',
       CASE WHEN m.direction = 'in' THEN m.amount ELSE -m.amount END, m.id, m.user_id, m.created_at
  FROM cash_movements m;

-- purge_tenant: + cash_ledger (smenalardan oldin)
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
    'tenant_request_messages', 'tenant_requests',
    'message_recipients', 'messages', 'audit_log', 'exports', 'billing_invoices', 'deliveries', 'debt_payments',
    'supplier_payments', 'quote_items', 'quotes', 'sale_items', 'sales', 'stock_movements', 'po_items',
    'purchase_orders', 'cash_ledger', 'cash_movements', 'cash_shifts', 'expenses', 'expense_templates', 'payroll_entries',
    'product_stocks', 'products',
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
