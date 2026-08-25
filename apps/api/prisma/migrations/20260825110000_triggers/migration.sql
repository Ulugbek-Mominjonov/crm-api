-- ═══════════════════════════════════════════════════════════════════
-- Triggerlar: ilova kodidagi xato ham buzolmaydigan kafolatlar
-- Manba: backend-tz/core/02-data-modeling.md §2.2
-- ═══════════════════════════════════════════════════════════════════

-- ── I1: products.stock = Σ product_stocks.qty ──────────────────────
-- Servis kodi FAQAT product_stocks ni o'zgartiradi; products.stock esa
-- o'qish uchun keshlangan yig'indi. Shu tufayli ular hech qachon ajralmaydi.
CREATE OR REPLACE FUNCTION sync_product_total_stock()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pid uuid := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE products p
     SET stock = COALESCE(
           (SELECT SUM(ps.qty) FROM product_stocks ps WHERE ps.product_id = pid), 0)
   WHERE p.id = pid;
  RETURN NULL;
END $$;

CREATE TRIGGER product_stock_sync
  AFTER INSERT OR UPDATE OF qty OR DELETE ON product_stocks
  FOR EACH ROW EXECUTE FUNCTION sync_product_total_stock();

-- ── I22: audit jurnali va ombor harakatlari o'zgartirilmaydi ───────
-- Jurnal ishonchli bo'lishi uchun u APPEND-ONLY bo'lishi shart: aks holda
-- "kim o'zgartirdi" savoliga javob beradigan yozuvning o'zi o'zgartirilishi
-- mumkin bo'lib qoladi.
CREATE OR REPLACE FUNCTION reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% jadvali faqat qo''shish uchun (% urinishi)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER movements_no_update BEFORE UPDATE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER movements_no_delete BEFORE DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
