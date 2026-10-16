-- ═══════════════════════════════════════════════════════════════════
-- Platforma egasi paneli (T-135): do'konlar ustidan nazorat.
--
-- Egasi hisobi do'kon hisoblaridan ALOHIDA (`platform_admins`), uning
-- jurnali global (`platform_audit_log`, RLS'siz). Do'konga egasi bloki
-- (`blocked_at`) holatdan mustaqil saqlanadi: o'chirishdan qaytganda ham
-- blok qoladi. Tenantlararo o'qish — faqat shu yerdagi SECURITY DEFINER
-- funksiyalar orqali (RLS siyosatlari o'zgarmaydi, yangi DB roli yo'q).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE tenants
  ADD COLUMN blocked_at     timestamptz,
  ADD COLUMN blocked_reason text,
  ADD COLUMN notes          text,
  DROP CONSTRAINT tenants_status_check,
  ADD CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'blocked', 'deleting'));

-- Egasi qo'lda yozgan to'lov (naqd, o'tkazma, bonus — summa 0 bo'lishi mumkin): kim va izoh
ALTER TABLE billing_invoices
  ADD COLUMN platform_admin_id uuid,
  ADD COLUMN note              text,
  DROP CONSTRAINT billing_invoices_amount_check,
  ADD CONSTRAINT billing_invoices_amount_check CHECK (amount >= 0),
  DROP CONSTRAINT billing_invoices_provider_check,
  ADD CONSTRAINT billing_invoices_provider_check CHECK (provider IN ('payme', 'click', 'cash', 'transfer', 'bonus'));
-- Tenantlararo ro'yxat (sana bo'yicha) va oylik tushum (faqat to'langanlar)
CREATE INDEX "billing_invoices_created_at_idx" ON billing_invoices (created_at DESC);
CREATE INDEX "billing_invoices_paid_at_idx" ON billing_invoices (paid_at) WHERE state = 'paid';

CREATE TABLE platform_admins (
  id            uuid PRIMARY KEY,
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "platform_admins_email_key" ON platform_admins (email);

CREATE TABLE platform_refresh_tokens (
  id         uuid PRIMARY KEY,
  admin_id   uuid NOT NULL,
  token_hash text NOT NULL,
  parent_id  uuid,
  user_agent text,
  ip         text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_refresh_tokens_admin_id_fkey" FOREIGN KEY (admin_id)
    REFERENCES platform_admins (id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "platform_refresh_tokens_token_hash_key" ON platform_refresh_tokens (token_hash);
CREATE INDEX "platform_refresh_tokens_admin_id_idx" ON platform_refresh_tokens (admin_id);

-- `target_tenant_id` — FK emas va `tenant_id` deb nomlanmagan: do'kon to'liq
-- o'chirilgach (`purge_tenant`) ham egasi tarixi qoladi, RLS talabiga kirmaydi
CREATE TABLE platform_audit_log (
  id               uuid PRIMARY KEY,
  admin_id         uuid,
  action           text NOT NULL,
  target_tenant_id uuid,
  entity_type      text,
  entity_id        uuid,
  diff             jsonb,
  ip               text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_audit_log_admin_id_fkey" FOREIGN KEY (admin_id)
    REFERENCES platform_admins (id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "platform_audit_log_created_at_idx" ON platform_audit_log (created_at);
CREATE INDEX "platform_audit_log_target_tenant_id_created_at_idx" ON platform_audit_log (target_tenant_id, created_at);

-- Faqat qo'shiladigan jurnal: o'zgartirish ham, o'chirish ham yo'q (do'kon auditi kabi)
CREATE OR REPLACE FUNCTION reject_platform_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_log faqat qo''shish uchun (% urinishi)', TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER platform_audit_no_update BEFORE UPDATE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_platform_audit_mutation();
CREATE TRIGGER platform_audit_no_delete BEFORE DELETE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_platform_audit_mutation();

-- ─────────────────────────── Tenantlararo o'qish (egasi huquqi bilan, faqat kerakli ustunlar)

-- Tanlangan do'konlar (sahifa) bo'yicha jamlanma — bitta so'rov, N+1 emas:
-- faol hisoblar, omborlar, S3 hajmi, administrator aloqasi, so'nggi faollik
CREATE OR REPLACE FUNCTION platform_tenant_usage(p_tenants uuid[])
RETURNS TABLE (tenant_id uuid, users int, warehouses int, storage_bytes bigint,
               admin_name text, admin_email text, admin_phone text,
               last_sale_at timestamptz, sales_30d int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id,
         (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL AND u.is_active),
         (SELECT count(*)::int FROM warehouses w WHERE w.tenant_id = t.id AND NOT w.archived),
         COALESCE((SELECT s.storage_used_bytes FROM tenant_state s WHERE s.tenant_id = t.id), 0),
         e.name, a.email, e.phone,
         (SELECT max(s.created_at) FROM sales s WHERE s.tenant_id = t.id),
         (SELECT count(*)::int FROM sales s WHERE s.tenant_id = t.id AND s.created_at >= now() - interval '30 days')
    FROM unnest(p_tenants) AS t(id)
    LEFT JOIN LATERAL (
      SELECT u.email, u.employee_id
        FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = t.id AND r.key = 'admin' AND u.deleted_at IS NULL
       ORDER BY u.created_at
       LIMIT 1) a ON true
    LEFT JOIN employees e ON e.id = a.employee_id
$$;

-- Do'kon kirish hisoblari (qo'llab-quvvatlash: kim kira oladi, parolni tiklash)
CREATE OR REPLACE FUNCTION platform_tenant_users(p_tenant uuid)
RETURNS TABLE (id uuid, name text, email text, role_key "Role", role_name text,
               is_active boolean, last_login_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, e.name, u.email, r.key, r.name, u.is_active, u.last_login_at, u.created_at
    FROM users u
    JOIN employees e ON e.id = u.employee_id
    JOIN roles r ON r.id = u.role_id
   WHERE u.tenant_id = p_tenant AND u.deleted_at IS NULL
   ORDER BY u.created_at
$$;

-- Hisob-fakturalar — bitta do'kon yoki hammasi; `total` — filtrga mos umumiy son (sahifalash)
CREATE OR REPLACE FUNCTION platform_invoices(p_tenant uuid, p_state "InvoiceState", p_provider text,
                                             p_from timestamptz, p_to timestamptz, p_limit int, p_offset int)
RETURNS TABLE (id uuid, tenant_id uuid, tenant_name text, plan text, months int, amount bigint,
               state "InvoiceState", provider text, note text, created_at timestamptz, paid_at timestamptz,
               total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.tenant_id, t.name, i.plan, i.months, i.amount, i.state, i.provider, i.note, i.created_at, i.paid_at,
         count(*) OVER ()
    FROM billing_invoices i
    JOIN tenants t ON t.id = i.tenant_id
   WHERE (p_tenant IS NULL OR i.tenant_id = p_tenant)
     AND (p_state IS NULL OR i.state = p_state)
     AND (p_provider IS NULL OR i.provider = p_provider)
     AND (p_from IS NULL OR i.created_at >= p_from)
     AND (p_to IS NULL OR i.created_at < p_to)
   ORDER BY i.created_at DESC
   LIMIT p_limit OFFSET p_offset
$$;

-- Oylik tushum (Toshkent oyi bo'yicha, faqat to'langanlar) — boshqaruv paneli
CREATE OR REPLACE FUNCTION platform_revenue(p_from timestamptz)
RETURNS TABLE (month date, amount bigint, invoices int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (date_trunc('month', paid_at AT TIME ZONE 'Asia/Tashkent'))::date, sum(amount)::bigint, count(*)::int
    FROM billing_invoices
   WHERE state = 'paid' AND paid_at >= p_from
   GROUP BY 1
   ORDER BY 1
$$;

REVOKE ALL ON FUNCTION platform_tenant_usage(uuid[]), platform_tenant_users(uuid),
  platform_invoices(uuid, "InvoiceState", text, timestamptz, timestamptz, int, int), platform_revenue(timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_tenant_usage(uuid[]), platform_tenant_users(uuid),
  platform_invoices(uuid, "InvoiceState", text, timestamptz, timestamptz, int, int), platform_revenue(timestamptz)
  TO crm_app;
