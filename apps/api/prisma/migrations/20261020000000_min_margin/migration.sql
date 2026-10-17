-- Minimal narx (T-141): tovar tannarx × (1 + min_margin_pct / 100) dan past sotilmaydi —
-- qo'lda narx, qator chegirmasi va umumiy chegirma shu chegaraga bo'ysunadi (`sales.belowCost`
-- ruxsati bilan istisno). 0 — tannarxning o'zi; tannarxi 0 tovar cheklanmaydi.
ALTER TABLE settings
  ADD COLUMN min_margin_pct integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT settings_min_margin_pct_range CHECK (min_margin_pct BETWEEN 0 AND 100);
