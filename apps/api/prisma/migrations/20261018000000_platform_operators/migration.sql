-- ═══════════════════════════════════════════════════════════════════
-- Egasi paneli, davomi (T-137…T-139): operatorlar va rol, ikki bosqichli
-- kirish (TOTP), egasining Telegram'i (xabarlar), platforma sozlamasi
-- (ro'yxatdan o'tish ochiq/yopiq). Hammasi global jadvallar — RLS yo'q.
-- ═══════════════════════════════════════════════════════════════════

-- Rol: `owner` — hammasi; `operator` — do'konlar bilan ishlaydi, lekin do'konni
-- o'chira olmaydi, hisoblar va sozlamani boshqara olmaydi. Mavjud hisob — egasi.
ALTER TABLE platform_admins
  ADD COLUMN role                     text NOT NULL DEFAULT 'owner',
  -- TOTP (RFC 6238): sir base32'da; `totp_enabled_at` NULL — sozlash boshlangan, tasdiqlanmagan.
  -- `totp_last_step` — oxirgi qabul qilingan 30 soniyalik qadam: bitta kod ikki marta o'tmaydi
  ADD COLUMN totp_secret              text,
  ADD COLUMN totp_enabled_at          timestamptz,
  ADD COLUMN totp_last_step           bigint,
  -- Telegram: egasi botga shaxsiy havola bilan ulanadi (mijozlar kabi) — yangi do'kon,
  -- onlayn to'lov, o'chirish so'rovi haqida xabar shu chatga
  ADD COLUMN telegram_chat_id         bigint,
  ADD COLUMN telegram_linked_at       timestamptz,
  ADD COLUMN telegram_link_hash       text,
  ADD COLUMN telegram_link_expires_at timestamptz,
  ADD CONSTRAINT platform_admins_role_check CHECK (role IN ('owner', 'operator'));

-- Havola xeshi bo'yicha qidiruv (`/start p-…`); bitta chat — bitta hisob
CREATE UNIQUE INDEX "platform_admins_telegram_link_hash_key" ON platform_admins (telegram_link_hash)
  WHERE telegram_link_hash IS NOT NULL;
CREATE UNIQUE INDEX "platform_admins_telegram_chat_id_key" ON platform_admins (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- Platforma sozlamasi — BITTA qator (id = 1). Ro'yxatdan o'tish yopiq bo'lsa
-- `POST /tenants/register` 403 `REGISTRATION_CLOSED`; do'konni faqat egasi ochadi
CREATE TABLE platform_settings (
  id                smallint PRIMARY KEY,
  registration_mode text NOT NULL DEFAULT 'open',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  CONSTRAINT platform_settings_single_row CHECK (id = 1),
  CONSTRAINT platform_settings_registration_mode_check CHECK (registration_mode IN ('open', 'closed')),
  CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY (updated_by)
    REFERENCES platform_admins (id) ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO platform_settings (id) VALUES (1);
