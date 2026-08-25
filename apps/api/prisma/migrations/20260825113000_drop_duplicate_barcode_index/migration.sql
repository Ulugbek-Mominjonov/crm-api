-- Takroriy indeksni olib tashlaymiz.
--
-- `products_tenant_id_barcode_idx` (Prisma) va `products_barcode_exact`
-- (UNIQUE, partial) bir xil ustunlarni qamraydi. Ikkinchisi kuchliroq:
-- u noyoblikni ham majburlaydi. Birinchisi faqat yozish tezligini yeydi.
DROP INDEX IF EXISTS "products_tenant_id_barcode_idx";
