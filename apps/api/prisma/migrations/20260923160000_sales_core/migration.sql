-- ═══════════════════════════════════════════════════════════════════
-- Sotuv yadrosi (E6)
-- ═══════════════════════════════════════════════════════════════════

-- I17: sotuvda ishlatilgan va berilgan bonus ball chekda saqlanadi.
-- Bekor qilishda AYNAN shu miqdor qaytariladi — keyin o'zgargan foiz
-- bilan qayta hisoblanmaydi (aks holda "bepul ball" qoladi yoki yo'qoladi)
ALTER TABLE sales
  ADD COLUMN bonus_used   bigint NOT NULL DEFAULT 0,
  ADD COLUMN bonus_earned bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT sale_bonus_non_negative CHECK (bonus_used >= 0 AND bonus_earned >= 0);

-- Qaytarish qatori → asl chek qatori. Qaytarilgan miqdor asl miqdordan
-- oshmasligi (T-054) aynan qator bo'yicha tekshiriladi: bir chekda bitta
-- tovar ikki qatorda (turli birlik/narx) bo'lishi mumkin
ALTER TABLE sale_items ADD COLUMN return_of_id uuid;

-- Asl chekning qaytarishlari — qaytarish va bekor qilishda o'qiladi
CREATE INDEX "sales_tenant_id_related_sale_id_idx" ON sales (tenant_id, related_sale_id);
