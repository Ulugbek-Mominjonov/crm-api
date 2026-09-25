-- ═══════════════════════════════════════════════════════════════════
-- Ta'minot va kreditorlik (E8)
-- ═══════════════════════════════════════════════════════════════════

-- I18: ta'minotchiga qarz — faqat KELGAN tovar uchun. Kelgan qiymat qabulda
-- yangilanadi (`paid` kabi denormalizatsiya, 10 §10.2), qarz esa bazada
-- hisoblanadi — `sales.outstanding` bilan bir xil yondashuv
ALTER TABLE purchase_orders ADD COLUMN received_value bigint NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN outstanding bigint NOT NULL GENERATED ALWAYS AS (
  CASE WHEN status = 'cancelled' THEN 0 ELSE GREATEST(0, received_value - paid) END
) STORED;

ALTER TABLE purchase_orders ADD CONSTRAINT po_amounts_non_negative
  CHECK (total >= 0 AND paid >= 0 AND received_value >= 0);

-- Ta'minotchi kartasi: buyurtmalar tarixi sana bo'yicha
CREATE INDEX "purchase_orders_tenant_id_supplier_id_date_idx" ON purchase_orders (tenant_id, supplier_id, date);
DROP INDEX IF EXISTS "purchase_orders_tenant_id_supplier_id_idx";
