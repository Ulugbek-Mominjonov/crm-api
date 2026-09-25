-- ═══════════════════════════════════════════════════════════════════
-- Chekning qolgan qarzi (I13) — bazada hisoblanadi
-- ═══════════════════════════════════════════════════════════════════

-- Qoida `packages/shared` dagi `saleOutstanding` bilan bir xil. Ustun
-- saqlanadigan (STORED): ro'yxat filtri (`payment=debt`), qarzlar sahifasi
-- va to'lov tekshiruvi (I14) uni o'qiydi, hisob ilovada takrorlanmaydi.
-- `paid_cash` — kassada qolgan naqd (berilgan − qaytim).
ALTER TABLE sales ADD COLUMN outstanding bigint NOT NULL GENERATED ALWAYS AS (
  CASE WHEN status = 'cancelled' OR type = 'return' THEN 0
       ELSE GREATEST(0, total - paid_cash - paid_card - paid_transfer - debt_paid)
  END
) STORED;

-- Cheklar jurnali kalitli sahifalanadi: `(date DESC, id DESC)` (10 §10.5)
DROP INDEX IF EXISTS "sales_tenant_id_date_idx";
CREATE INDEX "sales_tenant_id_date_id_idx" ON sales (tenant_id, date, id);
