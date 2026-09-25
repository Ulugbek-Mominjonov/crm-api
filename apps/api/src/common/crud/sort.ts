export type SortDir = 'asc' | 'desc'

type OrderBuilder<TOrderBy> = (dir: SortDir) => TOrderBy

/**
 * Saralash kaliti → Prisma `orderBy` bo'lagi.
 *
 * Kalitlar — OQ RO'YXAT: mijoz ixtiyoriy ustun bo'yicha saralay olmaydi
 * (indeksiz ustunda saralash katta jadvalni to'liq o'qitadi). `id` shart:
 * u barqaror tartib uchun har saralashga oxirgi kalit sifatida qo'shiladi.
 */
export type SortMap<TOrderBy> = { readonly id: OrderBuilder<TOrderBy> } & Readonly<
  Record<string, OrderBuilder<TOrderBy>>
>

/** Oddiy ustun bo'yicha saralash: `byField('name')` → `{ name: dir }` */
export function byField<K extends string>(field: K): (dir: SortDir) => Record<K, SortDir> {
  // Hisoblangan kalit tipni `string` ga kengaytiradi — aniq kalitni tiklaymiz
  return (dir) => ({ [field]: dir }) as Record<K, SortDir>
}

/** `@IsIn` uchun ruxsat etilgan qiymatlar: `name`, `-name`, ... */
export function sortValues(map: SortMap<unknown>): string[] {
  return Object.keys(map).flatMap((key) => [key, `-${key}`])
}

/**
 * `-createdAt` → `[{ createdAt: 'desc' }, { id: 'desc' }]`.
 *
 * Oxirgi `id` — bir xil qiymatli qatorlar (masalan bir xil nom) sahifalar
 * orasida "sakrab" yurmasligi uchun.
 */
export function orderByOf<TOrderBy>(
  sort: string | undefined,
  map: SortMap<TOrderBy>,
  fallback: string,
): TOrderBy[] {
  const raw = sort && map[stripDir(sort)] ? sort : fallback
  const dir: SortDir = raw.startsWith('-') ? 'desc' : 'asc'
  const build = map[stripDir(raw)] ?? map.id
  return [build(dir), map.id(dir)]
}

function stripDir(sort: string): string {
  return sort.startsWith('-') ? sort.slice(1) : sort
}
