-- ═══════════════════════════════════════════════════════════════════
-- Maosh hisobi (T-142): har xodim uchun varaq — hisoblangan maosh,
-- savdodan bonus, mukofot/jarima (ishlab topilgani) va to'lovlar (avans,
-- maosh). Hisoblash — tungi ish, xodimning «hisoblash kuni» kelganda O'TGAN
-- OY uchun (yozuv sanasi — o'sha oyning oxiri: oy foydasiga shu oy xarajati
-- sifatida kiradi). To'lov — kassa harakati (naqd — ochiq smenadan).
-- ═══════════════════════════════════════════════════════════════════

-- Xodim: hisoblash kuni, savdodan bonus foizi, hisob boshlanadigan sana.
-- Mavjud xodimlarga `payroll_from` = bugun: o'tgan oylar (xarajat sifatida allaqachon yozilgan
-- bo'lishi mumkin) ikkinchi marta hisoblanmaydi; yangi xodimga ilova ishga olingan sanani beradi
ALTER TABLE employees
  ADD COLUMN salary_day      smallint     NOT NULL DEFAULT 1,
  ADD COLUMN sales_bonus_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN payroll_from    date         NOT NULL DEFAULT CURRENT_DATE,
  ADD CONSTRAINT employees_salary_day_check CHECK (salary_day BETWEEN 1 AND 28),
  ADD CONSTRAINT employees_sales_bonus_pct_check CHECK (sales_bonus_pct BETWEEN 0 AND 100);

CREATE TYPE "PayrollEntryType" AS ENUM ('salary', 'bonus', 'award', 'penalty', 'advance', 'payment');

-- Varaq yozuvi. `auto` — tungi ish yaratgan; `base_amount`/`rate` — hisoblash asosi
-- (bonus: davr savdosi × foiz; maosh: oylik maosh, qisman oy bo'lsa `amount` kam)
CREATE TABLE payroll_entries (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  employee_id uuid NOT NULL,
  type        "PayrollEntryType" NOT NULL,
  amount      bigint NOT NULL,
  date        date NOT NULL,
  method      "PayMethod",
  shift_id    uuid,
  auto        boolean NOT NULL DEFAULT false,
  base_amount bigint,
  rate        numeric(5,2),
  note        text,
  user_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT "payroll_entries_tenant_id_employee_id_fkey" FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT payroll_entries_amount_check CHECK (amount > 0),
  -- To'lovda usul bor, hisoblashda yo'q
  CONSTRAINT payroll_entries_method_check CHECK ((type IN ('advance', 'payment')) = (method IS NOT NULL)),
  -- Smena faqat naqd to'lovda
  CONSTRAINT payroll_entries_shift_check CHECK (shift_id IS NULL OR method = 'cash')
);
CREATE UNIQUE INDEX "payroll_entries_tenant_id_id_key" ON payroll_entries (tenant_id, id);
-- Avtomatik hisoblash: xodim + davr (sana = oy oxiri) + tur bo'yicha BIR marta (I21 kabi);
-- o'chirilgan yozuv ham indeksda qoladi — tungi ish uni qayta yaratmaydi
CREATE UNIQUE INDEX "payroll_entries_auto_key" ON payroll_entries (tenant_id, employee_id, date, type) WHERE auto;
-- Xodim varag'i va davr xulosasi
CREATE INDEX "payroll_entries_tenant_id_employee_id_date_idx" ON payroll_entries (tenant_id, employee_id, date);
-- Oy foydasi (xarajat sifatida) va to'lovlar jurnali
CREATE INDEX "payroll_entries_tenant_id_date_idx" ON payroll_entries (tenant_id, date);
-- Smena hisoboti: naqd maosh to'lovlari
CREATE INDEX "payroll_entries_tenant_id_shift_id_idx" ON payroll_entries (tenant_id, shift_id) WHERE shift_id IS NOT NULL;

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_entries_tenant_isolation ON payroll_entries
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- purge_tenant: + payroll_entries (xodimlardan oldin)
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
    'purchase_orders', 'cash_movements', 'cash_shifts', 'expenses', 'expense_templates', 'payroll_entries',
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
