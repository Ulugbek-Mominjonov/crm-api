-- ═══════════════════════════════════════════════════════════════════
-- Raqobatli tahrirlash (T-098, 04 §4.4): spravochnik yozuvining versiyasi.
-- `PATCH` + `If-Match: <updatedAt>` — yozuv o'zgargan bo'lsa 409.
--
-- Ilova (Prisma `@updatedAt`) va tahrirlanadigan maydonni o'zgartiradigan
-- xom SQL (ommaviy narx, import, kirim tannarxi) yangilaydi. Qoldiq
-- (trigger) va bonus (sotuv) — tahrirlanmaydigan maydonlar, versiyaga
-- tegmaydi: kassa sotuvi mahsulot kartasini tahrirlayotgan adminni to'smasin.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE categories ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE clients    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE employees  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE products   ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE suppliers  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE warehouses ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
