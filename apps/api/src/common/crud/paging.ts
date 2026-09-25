import { DomainError } from '@/common/errors/domain.error'
import type { SortDir } from './sort'

/** Sahifali ro'yxat javobi (04 §4.1) */
export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  pageCount: number
}

interface PageQuery {
  page: number
  pageSize: number
}

/**
 * `OFFSET` sahifalash — qisqa spravochniklar uchun (< 5000 qator) va UI'da
 * sahifa raqami kerak bo'lganda (10 §10.5). Uzun jurnallar kursor bilan.
 */
export function pageArgs(q: PageQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize }
}

export function toPaged<T>(items: T[], total: number, q: PageQuery): Paged<T> {
  return {
    items,
    page: q.page,
    pageSize: q.pageSize,
    total,
    pageCount: Math.ceil(total / q.pageSize),
  }
}

// ─────────────────────────────────────────────── Kalitli (keyset) sahifalash

/**
 * Kursorli ro'yxat javobi (10 §10.5) — uzun jurnallar uchun
 * (harakatlar, cheklar, audit): chuqur sahifada ham tezlik bir xil.
 */
export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

/** Oxirgi qatorning saralash qiymati (satr ko'rinishida) va `id` si */
export interface CursorKey {
  v: string
  id: string
}

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url')
}

/** Buzilgan yoki soxta kursor — 400 (so'rov shakli noto'g'ri) */
export function decodeCursor(raw: string): CursorKey {
  const parsed = parseJson(Buffer.from(raw, 'base64url').toString('utf8'))
  if (!isCursorKey(parsed)) {
    throw new DomainError('VALIDATION_FAILED', 'Kursor yaroqsiz', [
      { field: 'cursor', code: 'VALIDATION_FAILED' },
    ])
  }
  return parsed
}

/**
 * Kursordan KEYINGI qatorlar sharti: `(field, id)` juftligi bo'yicha.
 * `id` bir xil qiymatli qatorlarni ajratadi — ular sahifalar orasida
 * yo'qolmaydi va takrorlanmaydi.
 */
export function keysetWhere<TWhere>(
  field: string,
  dir: SortDir,
  value: unknown,
  id: string,
): TWhere {
  const op = dir === 'desc' ? 'lt' : 'gt'
  // Maydon nomi o'zgaruvchidan kelgani uchun tip bu yerda tiklanadi;
  // chaqiruvchi `field` ni o'z modelining saralash kalitidan beradi
  return {
    OR: [{ [field]: { [op]: value } }, { [field]: value, id: { [op]: id } }],
  } as TWhere
}

/**
 * `take + 1` qator so'raladi: ortiqchasi keyingi sahifa borligini bildiradi
 * va `COUNT(*)` ga hojat qolmaydi.
 */
export function toCursorPage<T>(
  rows: T[],
  take: number,
  keyOf: (row: T) => CursorKey,
): CursorPage<T> {
  const hasMore = rows.length > take
  const items = hasMore ? rows.slice(0, take) : rows
  const last = items.at(-1)
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(keyOf(last)) : null,
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // JSON emas — chaqiruvchi buni "yaroqsiz kursor" deb qaytaradi
    return undefined
  }
}

function isCursorKey(value: unknown): value is CursorKey {
  if (value === null || typeof value !== 'object') return false
  const { v, id } = value as Record<string, unknown>
  return typeof v === 'string' && typeof id === 'string' && id.length > 0
}
