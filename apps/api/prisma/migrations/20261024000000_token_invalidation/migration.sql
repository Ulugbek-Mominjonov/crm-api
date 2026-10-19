-- ═══════════════════════════════════════════════════════════════════
-- Access tokenni darhol bekor qilish (T-147, 03 §3.3): parol almashganda,
-- «barcha qurilmalardan chiqish»da, hisob faolsizlantirilganda/o'chirilganda,
-- xodim bo'shatilganda refresh tokenlar yopiladi — lekin access token 15
-- daqiqagacha amal qilardi. Endi `tokens_invalid_before` dan OLDIN berilgan
-- (`iat`) tokenlar har so'rovda rad etiladi (huquq keshi bilan birga, Redis'siz).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users           ADD COLUMN tokens_invalid_before timestamptz;
ALTER TABLE platform_admins ADD COLUMN tokens_invalid_before timestamptz;

-- Sessiyalarni yopish tenant tranzaksiyasidan tashqarida ham chaqiriladi (refresh tokenni
-- qayta ishlatish aniqlanganda) — `users` ga RLS'siz yozish uchun SECURITY DEFINER.
-- Soniyagacha: JWT `iat` soniyada; shu soniyada berilgan token amal qiladi
CREATE OR REPLACE FUNCTION auth_invalidate_tokens(p_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users SET tokens_invalid_before = date_trunc('second', now()) WHERE id = p_user
$$;
REVOKE ALL ON FUNCTION auth_invalidate_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_invalidate_tokens(uuid) TO crm_app;
