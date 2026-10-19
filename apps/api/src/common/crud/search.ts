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

/**
 * Hujjat ro'yxatlarida `q` ikki narsani qidirardi — raqam YOKI kontragent
 * nomi — bitta `OR` bilan: Postgres `number` trigram indeksini bog'liq jadval
 * sharti bilan birlashtira olmaydi va butun jadvalni ko'rib chiqadi. Qidiruv
 * ko'rinishiga qarab bitta shoxga yo'naltiriladi — ikkalasi ham indeks bilan.
 * `CHEK-1001`, `1001`, `TKLF-9` — raqam ko'rinishi: raqami bor, bo'shliqsiz.
 */
export function looksLikeDocumentNumber(q: string): boolean {
  return /\d/.test(q) && /^[\p{L}\d-]+$/u.test(q)
}
