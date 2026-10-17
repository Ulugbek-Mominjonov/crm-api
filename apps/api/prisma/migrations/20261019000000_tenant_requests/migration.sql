-- ═══════════════════════════════════════════════════════════════════
-- Do'kon murojaati platforma egasiga (T-140): bloklangan (yoki boshqa)
-- do'kon administratori tizim ichidan egasiga yozadi, egasi panelidan
-- javob beradi. Murojaat va xabarlari — do'kon ma'lumoti (RLS); egasi
-- tenantlararo o'qishni SECURITY DEFINER funksiyalar orqali qiladi,
-- yozishni — o'sha do'kon tranzaksiyasida (blok kabi). Egasining aloqa
-- ma'lumoti (telefon, Telegram, ish vaqti) — platforma sozlamasida.
-- ═══════════════════════════════════════════════════════════════════

-- Aloqa: bannerda va murojaat oynasida ko'rinadi; tizim ishlamasa ham egasini topish uchun
ALTER TABLE platform_settings
  ADD COLUMN support_phone    text,
  ADD COLUMN support_telegram text,
  ADD COLUMN support_hours    text;

-- Murojaat: `type` — nima haqida; `status`: `open` — do'kon yozdi, egasi javobini kutadi;
-- `answered` — egasi javob berdi; `closed` — yopilgan (yangi xabar yozilmaydi, yangisi ochiladi)
CREATE TABLE tenant_requests (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  type            text NOT NULL,
  status          text NOT NULL DEFAULT 'open',
  -- Administrator ko'rsatgan aloqa telefoni (ixtiyoriy)
  phone           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  CONSTRAINT "tenant_requests_tenant_id_fkey" FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT tenant_requests_type_check CHECK (type IN ('unblock', 'billing', 'other')),
  CONSTRAINT tenant_requests_status_check CHECK (status IN ('open', 'answered', 'closed'))
);
CREATE UNIQUE INDEX "tenant_requests_tenant_id_id_key" ON tenant_requests (tenant_id, id);
-- Bir do'konda bir vaqtda BITTA ochiq murojaat (poyga holatida ham) — qo'shimcha gap o'shanga yoziladi
CREATE UNIQUE INDEX "tenant_requests_one_open_key" ON tenant_requests (tenant_id) WHERE status <> 'closed';
-- Do'kon o'z tarixi (eng yangisi birinchi)
CREATE INDEX "tenant_requests_tenant_id_created_at_idx" ON tenant_requests (tenant_id, created_at DESC);
-- Egasi ro'yxati: holat bo'yicha filtr, so'nggi xabar bo'yicha tartib
CREATE INDEX "tenant_requests_status_last_message_at_idx" ON tenant_requests (status, last_message_at DESC);

ALTER TABLE tenant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_requests_tenant_isolation ON tenant_requests
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Xabarlar: `author` — `store` (do'kon administratori) yoki `platform` (egasi/operator);
-- `author_name` — yozilgan paytdagi ism (hisob o'chsa ham qoladi)
CREATE TABLE tenant_request_messages (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  request_id  uuid NOT NULL,
  author      text NOT NULL,
  author_name text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_request_messages_tenant_id_request_id_fkey" FOREIGN KEY (tenant_id, request_id)
    REFERENCES tenant_requests (tenant_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT tenant_request_messages_author_check CHECK (author IN ('store', 'platform'))
);
CREATE INDEX "tenant_request_messages_request_id_created_at_idx" ON tenant_request_messages (request_id, created_at);
-- Kunlik chegara: do'kon 24 soatda nechta xabar yozgani
CREATE INDEX "tenant_request_messages_tenant_id_created_at_idx" ON tenant_request_messages (tenant_id, created_at)
  WHERE author = 'store';

ALTER TABLE tenant_request_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_request_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_request_messages_tenant_isolation ON tenant_request_messages
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────── Tenantlararo o'qish (egasi huquqi bilan)

-- Murojaatlar ro'yxati (`p_id` — bitta murojaat): do'kon nomi va holati, birinchi xabar (ro'yxatda
-- qisqacha), xabarlar soni; `total` — filtrga mos umumiy son. Yopilmaganlar birinchi, keyin so'nggi xabar bo'yicha
CREATE OR REPLACE FUNCTION platform_requests(p_id uuid, p_tenant uuid, p_status text, p_type text, p_limit int, p_offset int)
RETURNS TABLE (id uuid, tenant_id uuid, tenant_name text, tenant_status text, type text, status text, phone text,
               author_name text, message text, message_count int, last_message_at timestamptz,
               created_at timestamptz, closed_at timestamptz, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.tenant_id, t.name, t.status, r.type, r.status, r.phone,
         f.author_name, f.body,
         (SELECT count(*)::int FROM tenant_request_messages m WHERE m.request_id = r.id),
         r.last_message_at, r.created_at, r.closed_at,
         count(*) OVER ()
    FROM tenant_requests r
    JOIN tenants t ON t.id = r.tenant_id
    LEFT JOIN LATERAL (
      SELECT m.author_name, m.body FROM tenant_request_messages m
       WHERE m.request_id = r.id ORDER BY m.created_at, m.id LIMIT 1) f ON true
   WHERE (p_id IS NULL OR r.id = p_id)
     AND (p_tenant IS NULL OR r.tenant_id = p_tenant)
     AND (p_status IS NULL OR r.status = p_status)
     AND (p_type IS NULL OR r.type = p_type)
   ORDER BY (r.status = 'closed'), r.last_message_at DESC, r.id DESC
   LIMIT p_limit OFFSET p_offset
$$;

-- Bitta murojaatning xabarlari (eskisi birinchi)
CREATE OR REPLACE FUNCTION platform_request_messages(p_request uuid)
RETURNS TABLE (id uuid, author text, author_name text, body text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.author, m.author_name, m.body, m.created_at
    FROM tenant_request_messages m
   WHERE m.request_id = p_request
   ORDER BY m.created_at, m.id
$$;

-- Egasi javobini kutayotgan murojaatlar soni — boshqaruv paneli va menyu belgisi
CREATE OR REPLACE FUNCTION platform_open_requests()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM tenant_requests WHERE status = 'open'
$$;

-- Do'kon jamlanmasiga `open_requests` qo'shildi (qaytish turi o'zgargani uchun qayta yaratiladi)
DROP FUNCTION platform_tenant_usage(uuid[]);
CREATE FUNCTION platform_tenant_usage(p_tenants uuid[])
RETURNS TABLE (tenant_id uuid, users int, warehouses int, storage_bytes bigint,
               admin_name text, admin_email text, admin_phone text,
               last_sale_at timestamptz, sales_30d int, open_requests int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id,
         (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL AND u.is_active),
         (SELECT count(*)::int FROM warehouses w WHERE w.tenant_id = t.id AND NOT w.archived),
         COALESCE((SELECT s.storage_used_bytes FROM tenant_state s WHERE s.tenant_id = t.id), 0),
         e.name, a.email, e.phone,
         (SELECT max(s.created_at) FROM sales s WHERE s.tenant_id = t.id),
         (SELECT count(*)::int FROM sales s WHERE s.tenant_id = t.id AND s.created_at >= now() - interval '30 days'),
         (SELECT count(*)::int FROM tenant_requests r WHERE r.tenant_id = t.id AND r.status = 'open')
    FROM unnest(p_tenants) AS t(id)
    LEFT JOIN LATERAL (
      SELECT u.email, u.employee_id
        FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = t.id AND r.key = 'admin' AND u.deleted_at IS NULL
       ORDER BY u.created_at
       LIMIT 1) a ON true
    LEFT JOIN employees e ON e.id = a.employee_id
$$;

REVOKE ALL ON FUNCTION platform_requests(uuid, uuid, text, text, int, int), platform_request_messages(uuid),
  platform_open_requests(), platform_tenant_usage(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_requests(uuid, uuid, text, text, int, int), platform_request_messages(uuid),
  platform_open_requests(), platform_tenant_usage(uuid[]) TO crm_app;

-- To'liq tozalashda murojaatlar ham (ro'yxat aniq: tenantga FK kaskadi bo'lsa ham)
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
