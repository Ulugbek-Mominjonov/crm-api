-- Egasi hisobi uchun kirish bloklash (03 §3.2, do'kon hisobi bilan bir xil): ketma-ket 5 ta
-- noto'g'ri parol yoki TOTP kodi → 15 daqiqa. `platform_admins` global jadval (RLS yo'q) —
-- hisoblagichni ilova o'zi yozadi, funksiya kerak emas.
ALTER TABLE platform_admins
  ADD COLUMN failed_logins smallint NOT NULL DEFAULT 0,
  ADD COLUMN locked_until  timestamptz;
