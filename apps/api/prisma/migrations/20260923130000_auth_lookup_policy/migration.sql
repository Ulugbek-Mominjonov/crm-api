-- ═══════════════════════════════════════════════════════════════════
-- Kirish (login / refresh) uchun foydalanuvchini tenantsiz topish
--
-- Ilova `crm_app` roli bilan ulanadi va `users` jadvalida RLS bor:
-- `app.tenant_id` o'rnatilmagan so'rov HECH narsani ko'rmaydi. Lekin
-- kirishda tenant hali noma'lum — foydalanuvchi email (login) yoki id
-- (refresh) bo'yicha topilishi kerak.
--
-- Yechim: tor, faqat O'QISH uchun siyosat. Qator FAQAT tranzaksiya ichida
-- `set_config(..., true)` bilan berilgan ANIQ email yoki id ga mos kelsa
-- ko'rinadi. Siyosatlar OR bilan birlashadi: oddiy so'rovlarga ta'sir yo'q.
-- ═══════════════════════════════════════════════════════════════════

CREATE POLICY users_auth_lookup ON users FOR SELECT
  USING (
    email = NULLIF(current_setting('app.auth_email', true), '')
    OR id = NULLIF(current_setting('app.auth_user_id', true), '')::uuid
  );
