type Contains = { contains: string; mode: 'insensitive' }

/**
 * `q` bo'yicha bir nechta maydonda katta-kichik harfga qaramay qidiruv.
 *
 * Prisma bu shartni `ILIKE '%…%'` ga aylantiradi — `pg_trgm` indekslari
 * (`*_trgm`) aynan shuni tezlashtiradi (10 §10.4). `q` bo'sh bo'lsa shart
 * qo'shilmaydi.
 */
export function searchWhere<F extends string>(
  q: string | undefined,
  fields: readonly F[],
): { OR?: Partial<Record<F, Contains>>[] } {
  if (!q) return {}
  return {
    OR: fields.map(
      (field) => ({ [field]: { contains: q, mode: 'insensitive' } }) as Partial<Record<F, Contains>>,
    ),
  }
}
