-- ═══════════════════════════════════════════════════════════════════
-- Hisobot o'qish modellari (10 §10.6, T-079)
-- ═══════════════════════════════════════════════════════════════════

-- Kunlik savdo agregati — YAGONA ta'rif. Jonli ko'rinish (bugungi kun va
-- tekshiruvlar uchun) va materiallashgan nusxa (o'tgan kunlar) shundan.
-- Tushum qoidasi I4 bilan AYNAN bir xil: bekor qilinmagan cheklar, nasiya
-- (`pending`) ham; qaytarish alohida ustunda (hisobotda ayriladi).
-- Tannarx — qator tannarxi × miqdor (sotuv birligida). `security_invoker` —
-- ilova roli bilan RLS qo'llanadi.
CREATE VIEW daily_sales_live WITH (security_invoker = true) AS
SELECT s.tenant_id,
       s.date,
       COALESCE(SUM(s.total)         FILTER (WHERE s.type = 'sale'), 0)::bigint   AS revenue,
       COALESCE(SUM(s.total)         FILTER (WHERE s.type = 'return'), 0)::bigint AS returns,
       COALESCE(SUM(c.cost)          FILTER (WHERE s.type = 'sale'), 0)           AS cogs,
       COALESCE(SUM(c.cost)          FILTER (WHERE s.type = 'return'), 0)         AS returns_cogs,
       COUNT(*)                      FILTER (WHERE s.type = 'sale')               AS sale_count,
       COALESCE(SUM(s.paid_cash)     FILTER (WHERE s.type = 'sale'), 0)::bigint   AS paid_cash,
       COALESCE(SUM(s.paid_card)     FILTER (WHERE s.type = 'sale'), 0)::bigint   AS paid_card,
       COALESCE(SUM(s.paid_transfer) FILTER (WHERE s.type = 'sale'), 0)::bigint   AS paid_transfer
  FROM sales s
 CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(i.cost * i.qty), 0) AS cost
          FROM sale_items i
         WHERE i.tenant_id = s.tenant_id AND i.sale_id = s.id
       ) c
 WHERE s.status <> 'cancelled' AND s.deleted_at IS NULL
 GROUP BY s.tenant_id, s.date;

-- Kunlik mahsulot savdosi (top mahsulotlar, ABC, sotilmayotgan tovar).
-- Qator tushumi — server hisobi bilan bir xil: round(narx × miqdor) − chegirma
CREATE VIEW daily_product_sales_live WITH (security_invoker = true) AS
SELECT s.tenant_id,
       s.date,
       i.product_id,
       SUM(i.base_qty)                                            AS base_qty,
       SUM(ROUND(i.price * i.qty) - i.discount)::bigint           AS revenue,
       SUM(ROUND(i.price * i.qty) - i.discount - i.cost * i.qty)  AS profit
  FROM sale_items i
  JOIN sales s ON s.tenant_id = i.tenant_id AND s.id = i.sale_id
 WHERE s.status <> 'cancelled' AND s.type = 'sale' AND s.deleted_at IS NULL
 GROUP BY s.tenant_id, s.date, i.product_id;

-- Materiallashgan nusxalar — har kecha yangilanadi (T-080). CONCURRENTLY
-- yangilash uchun noyob indeks shart
CREATE MATERIALIZED VIEW daily_sales_summary AS SELECT * FROM daily_sales_live;
CREATE UNIQUE INDEX daily_sales_summary_key ON daily_sales_summary (tenant_id, date);

CREATE MATERIALIZED VIEW daily_product_sales AS SELECT * FROM daily_product_sales_live;
CREATE UNIQUE INDEX daily_product_sales_key ON daily_product_sales (tenant_id, date, product_id);

-- Materiallashgan ko'rinishga RLS qo'llab BO'LMAYDI (Postgres cheklovi).
-- Ilova roli ularni to'g'ridan-to'g'ri o'qimaydi — faqat joriy tenant bilan
-- filtrlaydigan ko'rinishlar orqali (izolyatsiya RLS darajasida qoladi)
REVOKE ALL ON daily_sales_summary, daily_product_sales FROM crm_app;

CREATE VIEW tenant_daily_sales WITH (security_barrier) AS
SELECT * FROM daily_sales_summary WHERE tenant_id = current_tenant_id();

CREATE VIEW tenant_daily_products WITH (security_barrier) AS
SELECT * FROM daily_product_sales WHERE tenant_id = current_tenant_id();

GRANT SELECT ON daily_sales_live, daily_product_sales_live, tenant_daily_sales, tenant_daily_products TO crm_app;

-- Oxirgi yangilanish vaqti: hisobot shu KUNDAN OLDINGI kunlarni
-- ko'rinishdan, qolganini jonli oladi. Yangilash yiqilsa ham raqam
-- yo'qolmaydi — faqat jonli qism uzayadi (sekinroq, lekin to'g'ri)
CREATE TABLE report_refresh_state (
  id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refreshed_at timestamptz NOT NULL
);
INSERT INTO report_refresh_state (refreshed_at) VALUES (now());
REVOKE ALL ON report_refresh_state FROM crm_app;
GRANT SELECT ON report_refresh_state TO crm_app;

-- Yangilash (T-080): faqat egasi REFRESH qila oladi — funksiya egasi
-- huquqi bilan. Bir nechta instansiyada faqat bittasi bajaradi: qulf
-- olinmasa `false` qaytaradi (boshqasi yangilayapti)
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
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION refresh_report_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_report_views() TO crm_app;
