import { Prisma } from '@prisma/client'

/**
 * `uuid[]` qiymati SQL uchun. Prisma BO'SH massivni `integer[]` deb yuboradi
 * (element yo'q — tip aniqlanmaydi) va `::uuid[]` cast yiqiladi. JSON
 * orqali berilganda tip har doim aniq, bo'sh massiv ham to'g'ri ishlaydi.
 */
export function uuidArray(ids: readonly string[]): Prisma.Sql {
  return Prisma.sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::uuid)`
}

/**
 * Bir nechta CTE'ni BITTA so'rovga yig'adi: `WITH a AS (…), b AS (…) <final>`.
 * Ma'lumot o'zgartiruvchi CTE asosiy so'rov unga murojaat qilmasa ham
 * bajariladi — hujjat, uning qatorlari va yon ta'sirlari bitta aylanishda
 * (round-trip) yoziladi, so'rovlar soni qatorlar soniga bog'liq bo'lmaydi.
 */
export function withCtes(ctes: readonly Prisma.Sql[], final: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`WITH ${Prisma.join(ctes, ', ')} ${final}`
}

/**
 * `ILIKE` uchun "ichida bor" shabloni: foydalanuvchi matnidagi `%`, `_`
 * va `\` harfma-harf qidiriladi (shablon belgisi bo'lib qolmaydi).
 */
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}
