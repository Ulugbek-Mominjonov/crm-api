-- Harakatlar jurnali (GET /stock/movements) kalitli sahifalash bilan
-- `(date DESC, id DESC)` tartibida o'qiladi (10 §10.5). `id` — uuid v7,
-- ya'ni kun ichida xronologik. Indeks tartibni to'liq qamraydi: chuqur
-- sahifada ham saralash yo'q. Eski `(tenant_id, date)` uning prefiksi —
-- ortiqcha indeks har INSERT'da bekorga yangilanardi.
DROP INDEX IF EXISTS "stock_movements_tenant_id_date_idx";
CREATE INDEX "stock_movements_tenant_id_date_id_idx" ON "stock_movements" ("tenant_id", "date", "id");
