-- Idempotentlik kaliti TENANT ichida noyob bo'ladi.
--
-- Avval `key` butun jadval bo'yicha noyob edi: bir do'kon boshqa do'kon
-- ishlatgan kalit bilan so'rov yuborsa, uning amali "band" deb rad etilardi
-- (va kalit mavjudligi oshkor bo'lardi). Jadval hali bo'sh — ishlatilmagan.
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_pkey";
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("tenant_id", "key");

-- Tozalash tenant bo'yicha bajariladi (RLS): indeks ham tenant bilan boshlanadi
DROP INDEX IF EXISTS "idempotency_keys_created_at_idx";
CREATE INDEX "idempotency_keys_tenant_id_created_at_idx" ON "idempotency_keys" ("tenant_id", "created_at");
