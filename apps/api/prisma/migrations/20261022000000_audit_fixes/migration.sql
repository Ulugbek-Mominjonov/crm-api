-- ═══════════════════════════════════════════════════════════════════
-- Texnik tekshiruv tuzatishlari (2026-10-17): indekslar va kirish bloklash.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────── Indekslar (yuklama)

-- Bosh sahifa «oxirgi cheklar»: `ORDER BY created_at DESC, id DESC LIMIT 6` — avval
-- do'konning barcha cheklari saralanardi
CREATE INDEX "sales_tenant_id_created_at_id_idx" ON sales (tenant_id, created_at, id) WHERE deleted_at IS NULL;

-- Eksport va zaxira kalitli sahifalash (`tenant_id = ? AND id > ? ORDER BY id`): uuid v7 tenantlar
-- bo'ylab aralash — `(tenant_id, id)` siz bitta do'kon eksporti butun jadvalni ko'rardi
CREATE INDEX "stock_movements_tenant_id_id_idx"   ON stock_movements (tenant_id, id);
CREATE INDEX "expenses_tenant_id_id_idx"          ON expenses (tenant_id, id);
CREATE INDEX "audit_log_tenant_id_id_idx"         ON audit_log (tenant_id, id);
CREATE INDEX "debt_payments_tenant_id_id_idx"     ON debt_payments (tenant_id, id);
CREATE INDEX "supplier_payments_tenant_id_id_idx" ON supplier_payments (tenant_id, id);
CREATE INDEX "cash_movements_tenant_id_id_idx"    ON cash_movements (tenant_id, id);
CREATE INDEX "deliveries_tenant_id_id_idx"        ON deliveries (tenant_id, id);

-- Sessiyalarni tozalash ishi (har kuni): muddati o'tganlar
CREATE INDEX "refresh_tokens_expires_at_idx"          ON refresh_tokens (expires_at);
CREATE INDEX "platform_refresh_tokens_expires_at_idx" ON platform_refresh_tokens (expires_at);

-- Kirish: tenantsiz email bo'yicha qidiruv (`users_auth_lookup` siyosati) — faqat tirik hisoblar
CREATE INDEX "users_email_live_idx" ON users (email) WHERE deleted_at IS NULL;

-- ─────────────────────────── Kirishni bloklash (03 §3.2)

-- Ketma-ket 5 ta noto'g'ri parol → hisob 15 daqiqa bloklanadi; muvaffaqiyatli kirish hisobni tozalaydi.
-- Ilova `users` ni tenantsiz faqat O'QIYDI (`users_auth_lookup`) — hisoblagich SECURITY DEFINER
-- funksiyalar bilan yoziladi, ular faqat shu ikki ustunga tegadi
ALTER TABLE users
  ADD COLUMN failed_logins smallint NOT NULL DEFAULT 0,
  ADD COLUMN locked_until  timestamptz;

CREATE OR REPLACE FUNCTION auth_login_failed(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE users u
     SET failed_logins = n.next,
         locked_until  = CASE WHEN n.next >= 5 THEN now() + interval '15 minutes' END
    FROM (SELECT id,
                 -- Muddati o'tgan blokdan keyin hisob qaytadan boshlanadi
                 CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1 ELSE failed_logins + 1 END AS next
            FROM users
           WHERE email = p_email AND deleted_at IS NULL AND is_active) n
   WHERE u.id = n.id;
END $$;

CREATE OR REPLACE FUNCTION auth_login_ok(p_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users SET failed_logins = 0, locked_until = NULL
   WHERE id = p_user AND (failed_logins > 0 OR locked_until IS NOT NULL)
$$;
