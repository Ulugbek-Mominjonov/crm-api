-- ═══════════════════════════════════════════════════════════════════
-- Kassa va moliya (E7)
-- ═══════════════════════════════════════════════════════════════════

-- Chek qaysi smenada yozilgani. Boshqa pul hujjatlarida (kassa harakati,
-- xarajat, qarz va ta'minotchi to'lovi) `shift_id` bor edi — Z-hisobot
-- (T-061) chekni ham vaqt oralig'i bilan emas, aniq smena bo'yicha oladi
ALTER TABLE sales ADD COLUMN shift_id uuid;
CREATE INDEX "sales_tenant_id_shift_id_idx" ON sales (tenant_id, shift_id);
ALTER TABLE sales
  ADD CONSTRAINT "sales_shift_id_same_tenant"
  FOREIGN KEY (tenant_id, shift_id) REFERENCES cash_shifts (tenant_id, id)
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- Mijozlar qarzi (10 §10.6): oddiy ko'rinish — qarz o'zgaruvchan,
-- materiallashtirish eskirgan ma'lumot berardi. `sales_open_debt` qisman
-- indeksi uni tez qiladi. `security_invoker` — so'rovchi roli (crm_app)
-- bilan ishlaydi, ya'ni RLS qo'llanadi: ko'rinish egasi huquqi bilan
-- boshqa tenant qarzini ko'rsatib yubormaydi
CREATE VIEW client_balances WITH (security_invoker = true) AS
SELECT s.tenant_id,
       s.customer_id,
       SUM(s.outstanding)  AS debt,
       COUNT(*)            AS receipts,
       MIN(s.date)         AS oldest_date,
       MIN(s.due_date)     AS oldest_due
  FROM sales s
 WHERE s.status = 'pending' AND s.type = 'sale' AND s.deleted_at IS NULL
   AND s.customer_id IS NOT NULL
 GROUP BY s.tenant_id, s.customer_id;

GRANT SELECT ON client_balances TO crm_app;
