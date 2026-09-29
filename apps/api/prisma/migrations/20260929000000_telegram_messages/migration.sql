-- ═══════════════════════════════════════════════════════════════════
-- Telegram orqali mijozga xabar va chek (Q116). Bot bitta — barcha do'konlar uchun.
-- Bot odamga telefon raqami bo'yicha yoza olmaydi va Start bosganda raqamini
-- ham bilmaydi (Telegram qoidasi) — shuning uchun har mijozga SHAXSIY havola:
-- xodim mijoz kartasidan QR chiqaradi, mijoz skanerlab Start bosadi — chat shu
-- mijozga bog'lanadi. Havola bir martalik va muddatli; bazada faqat token xeshi.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE clients
  ADD COLUMN telegram_chat_id         bigint,
  ADD COLUMN telegram_linked_at       timestamptz,
  ADD COLUMN telegram_blocked_at      timestamptz,
  ADD COLUMN telegram_link_hash       text,
  ADD COLUMN telegram_link_expires_at timestamptz;

-- Botni bloklash/ochish (`my_chat_member`) va /start: chat bo'yicha barcha do'konlardagi
-- mijozlar. Qisman — faqat bog'langanlar (ko'pchilik qator indeksga tushmaydi)
CREATE INDEX clients_telegram_chat_id_idx ON clients (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
-- Shaxsiy havola: token xeshi bo'yicha (tasodifiy 128 bit)
CREATE UNIQUE INDEX clients_telegram_link_hash_key ON clients (telegram_link_hash) WHERE telegram_link_hash IS NOT NULL;

-- Qabul qiluvchi kanali: `sms` yoki `telegram`
ALTER TABLE message_recipients
  ADD COLUMN channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'telegram')),
  ADD COLUMN chat_id bigint,
  ADD CONSTRAINT message_recipients_telegram_chat CHECK (channel <> 'telegram' OR chat_id IS NOT NULL);

-- `recipients` — navbatga tushganlar; shundan Telegram orqali — kunlik SMS chegarasiga
-- kirmaydi. Yetib bormaydiganlar (botga ulanmagan, SMS yo'q) — qatori yo'q, faqat soni
ALTER TABLE messages
  ADD COLUMN telegram_recipients    integer NOT NULL DEFAULT 0,
  ADD COLUMN unreachable_recipients integer NOT NULL DEFAULT 0;

-- Webhook tenantsiz keladi: faqat tenant id beradi (ma'lumot emas); bog'lash va
-- bloklash — har tenantning o'z tranzaksiyasida (RLS)
CREATE OR REPLACE FUNCTION telegram_link_tenant(p_hash text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM clients
   WHERE telegram_link_hash = p_hash AND telegram_link_expires_at > now() AND deleted_at IS NULL
$$;
CREATE OR REPLACE FUNCTION tenants_with_telegram_chat(p_chat bigint)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT tenant_id FROM clients WHERE telegram_chat_id = p_chat
$$;
REVOKE ALL ON FUNCTION telegram_link_tenant(text), tenants_with_telegram_chat(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION telegram_link_tenant(text), tenants_with_telegram_chat(bigint) TO crm_app;
