-- ═══════════════════════════════════════════════════════════════════
-- Sotuvchiga ulgurji savdo ruxsati (do'kon sozlamasi).
--
-- Sukut — yopiq: sotuvchi chakana narxda sotadi va ulgurji narxni
-- ko'rmaydi (03 §3.6). Administrator yoqsa — sotuvchi ulgurji narxda
-- sota oladi va `wholesalePrice` unga ham ko'rinadi.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE settings ADD COLUMN seller_wholesale_enabled boolean NOT NULL DEFAULT false;
