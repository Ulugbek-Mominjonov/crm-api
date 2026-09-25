-- ═══════════════════════════════════════════════════════════════════
-- Hisobot ko'rinishining eskirgan kunlari (T-097)
--
-- Materiallashgan kunlik agregat tunda yangilanadi (T-080). O'tgan kunga
-- tegadigan yozuv — offline navbatdan kelgan orqa sanali chek, kechagi
-- chekni bekor qilish, migratsiya importi — ko'rinishni o'sha kundan
-- ESKIRTIRADI. Tenant belgisi: hisobot shu kundan boshlab jonli o'qiydi,
-- tungi yangilash (o'zgarishni ko'rgan) belgini olib tashlaydi.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE tenant_state
  ADD COLUMN report_dirty_from date,
  ADD COLUMN report_dirty_at   timestamptz;

-- Trigger ilova roli bilan (RLS ostida) ishlaydi — faqat o'z tenant qatori
CREATE OR REPLACE FUNCTION mark_report_dirty()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_from date := CASE WHEN TG_OP = 'UPDATE' THEN LEAST(OLD.date, NEW.date) ELSE NEW.date END;
BEGIN
  UPDATE tenant_state
     SET report_dirty_from = LEAST(COALESCE(report_dirty_from, v_from), v_from),
         report_dirty_at   = now()
   WHERE tenant_id = NEW.tenant_id;
  RETURN NULL;
END $$;

-- Bugungi chek — ta'sirsiz (bugun baribir jonli). 'Asia/Tashkent' —
-- ilovadagi BUSINESS_TIME_ZONE bilan bir xil
CREATE TRIGGER sales_report_dirty_insert
  AFTER INSERT ON sales
  FOR EACH ROW
  WHEN (NEW.date < (now() AT TIME ZONE 'Asia/Tashkent')::date)
  EXECUTE FUNCTION mark_report_dirty();

-- Faqat hisobotga ta'sir qiladigan o'zgarish (bekor qilish, summa, to'lov
-- turi, sana, o'chirish). Qarz to'lovi (`debt_paid`, pending → completed) — yo'q
CREATE TRIGGER sales_report_dirty_update
  AFTER UPDATE ON sales
  FOR EACH ROW
  WHEN (LEAST(OLD.date, NEW.date) < (now() AT TIME ZONE 'Asia/Tashkent')::date
        AND ((OLD.status = 'cancelled') IS DISTINCT FROM (NEW.status = 'cancelled')
             OR OLD.date IS DISTINCT FROM NEW.date
             OR OLD.total IS DISTINCT FROM NEW.total
             OR OLD.paid_cash IS DISTINCT FROM NEW.paid_cash
             OR OLD.paid_card IS DISTINCT FROM NEW.paid_card
             OR OLD.paid_transfer IS DISTINCT FROM NEW.paid_transfer
             OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at))
  EXECUTE FUNCTION mark_report_dirty();

-- Yangilash ko'rgan belgilar olib tashlanadi. Oxirgi soatdagilari QOLADI:
-- ularning tranzaksiyasi REFRESH suratidan keyin COMMIT bo'lgan bo'lishi
-- mumkin (uzun import) — keyingi kechagacha jonli o'qiladi (sekinroq, to'g'ri).
-- Tenantlararo UPDATE — funksiya egasi huquqi bilan (egasi RLS'dan ozod rol)
CREATE OR REPLACE FUNCTION refresh_report_views()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('refresh-report-views')) THEN
    RETURN false;
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_product_sales;
  -- now() — tranzaksiya boshi: ko'rinishlar aynan shu paytdagi holatni oladi
  INSERT INTO report_refresh_state (id, refreshed_at) VALUES (1, now())
  ON CONFLICT (id) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;
  UPDATE tenant_state SET report_dirty_from = NULL, report_dirty_at = NULL
   WHERE report_dirty_at < now() - interval '1 hour';
  RETURN true;
END $$;
