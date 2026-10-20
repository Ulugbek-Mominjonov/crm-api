-- ═══════════════════════════════════════════════════════════════════
-- Karta orqali to'lov cheki — yangi fayl turi (T-149, Q126).
--
-- Alohida migratsiya: yangi enum qiymatini u qo'shilgan tranzaksiyada
-- ishlatib bo'lmaydi (PostgreSQL) — keyingi migratsiya unga tayanadi.
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE "FileKind" ADD VALUE 'payment_receipt';
