-- ═══════════════════════════════════════════════════════════════════
-- Do'kon logotipi — yangi fayl turi (Q117).
--
-- Alohida migratsiya: yangi enum qiymatini u qo'shilgan tranzaksiyada
-- ishlatib bo'lmaydi (PostgreSQL) — keyingi migratsiya funksiya va
-- indeksda unga tayanadi.
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE "FileKind" ADD VALUE 'store_logo';
