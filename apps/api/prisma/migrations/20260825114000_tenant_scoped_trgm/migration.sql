-- Trigram indekslarini TENANT bo'yicha ajratamiz.
--
-- Muammo: `gin (name gin_trgm_ops)` butun jadval bo'ylab ishlaydi. Ko'p
-- tenantli bazada har bir so'rov `tenant_id` bilan filtrlanadi, shuning
-- uchun planner trigram indeksini tanlashdan ko'ra boshqa indeks bo'yicha
-- bitmap olib, ILIKE ni filtr sifatida qo'llashni afzal ko'radi.
--
-- Yechim: `btree_gin` kengaytmasi GIN indeksiga uuid ustunini qo'shishga
-- imkon beradi — endi indeks (tenant_id, name) bo'yicha ishlaydi.
CREATE EXTENSION IF NOT EXISTS btree_gin;

DROP INDEX IF EXISTS products_name_trgm;
DROP INDEX IF EXISTS products_sku_trgm;
DROP INDEX IF EXISTS clients_name_trgm;
DROP INDEX IF EXISTS suppliers_name_trgm;
DROP INDEX IF EXISTS sales_number_trgm;

CREATE INDEX products_name_trgm   ON products  USING gin (tenant_id, name gin_trgm_ops);
CREATE INDEX products_sku_trgm    ON products  USING gin (tenant_id, sku gin_trgm_ops);
CREATE INDEX clients_name_trgm    ON clients   USING gin (tenant_id, name gin_trgm_ops);
CREATE INDEX suppliers_name_trgm  ON suppliers USING gin (tenant_id, name gin_trgm_ops);
CREATE INDEX sales_number_trgm    ON sales     USING gin (tenant_id, number gin_trgm_ops);
