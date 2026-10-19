-- ═══════════════════════════════════════════════════════════════════
-- Fon ishlari faqat ISHI BOR tenantlarni aylanadi (T-144, `tenants_with_due_messages` kabi).
-- Avval har soatlik/kunlik ish HAR tenant uchun tranzaksiya ochardi (BEGIN + set_config +
-- so'rov + COMMIT) — 5 000 do'konda kuniga yuz minglab bo'sh tranzaksiya. Ilova `crm_app`
-- RLS ostida tenantsiz hech narsani ko'rmaydi, shuning uchun ro'yxat SECURITY DEFINER
-- funksiyalardan keladi; ular faqat tenant id qaytaradi (yoki bitta global DELETE qiladi).
-- ═══════════════════════════════════════════════════════════════════

-- Idempotentlik kalitlari: tozalash — bitta global DELETE (`idempotency_keys_created_at_idx`)
CREATE OR REPLACE FUNCTION purge_idempotency_keys(p_cutoff timestamptz)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  removed int;
BEGIN
  DELETE FROM idempotency_keys WHERE created_at < p_cutoff;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION purge_idempotency_keys(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_idempotency_keys(timestamptz) TO crm_app;

-- Tashlab ketilgan yuklashlar (S3 obyektini tenant tranzaksiyasida o'chirish kerak — ro'yxat)
CREATE OR REPLACE FUNCTION tenants_with_stale_pending_files(p_cutoff timestamptz)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT tenant_id FROM files WHERE status = 'pending' AND created_at < p_cutoff
$$;
REVOKE ALL ON FUNCTION tenants_with_stale_pending_files(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenants_with_stale_pending_files(timestamptz) TO crm_app;

-- Takrorlanuvchi xarajat shablonlari: muddati kelgan va shu davrda ishlamagan (I21) — `@crm/shared`
-- `isTemplateDue` bilan bir xil qoida: oylik `YYYY-MM`, haftalik ISO `IYYY-Www`; servis o'zi ham qayta tekshiradi
CREATE OR REPLACE FUNCTION tenants_with_due_templates(p_today date)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT tenant_id FROM expense_templates
   WHERE active AND deleted_at IS NULL
     AND ((period = 'monthly' AND LEAST(day_of_period, 28) <= extract(day FROM p_today)
           AND last_run_key IS DISTINCT FROM to_char(p_today, 'YYYY-MM'))
       OR (period = 'weekly' AND LEAST(day_of_period, 7) <= extract(isodow FROM p_today)
           AND last_run_key IS DISTINCT FROM to_char(p_today, 'IYYY-"W"IW')))
$$;
REVOKE ALL ON FUNCTION tenants_with_due_templates(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenants_with_due_templates(date) TO crm_app;

-- Maosh hisoblash: kuni kelgan, o'tgan oy uchun hali hisoblanmagan xodimi bor tenantlar
-- (`PayrollAccrualService` nomzod sharti bilan aynan bir xil)
CREATE OR REPLACE FUNCTION tenants_with_due_payroll(p_today date)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH period AS (SELECT (date_trunc('month', p_today) - interval '1 day')::date AS last_day)
  SELECT DISTINCT e.tenant_id
    FROM employees e, period
   WHERE e.deleted_at IS NULL AND e.status = 'active'
     AND (e.salary > 0 OR e.sales_bonus_pct > 0)
     AND e.salary_day <= extract(day FROM p_today)
     AND e.payroll_from <= period.last_day AND e.hired_at <= period.last_day
     AND NOT EXISTS (SELECT 1 FROM payroll_entries p
                      WHERE p.tenant_id = e.tenant_id AND p.employee_id = e.id AND p.date = period.last_day
                        AND p.type IN ('salary', 'bonus') AND (p.auto OR p.deleted_at IS NULL))
$$;
REVOKE ALL ON FUNCTION tenants_with_due_payroll(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenants_with_due_payroll(date) TO crm_app;
