import type { FileKind } from '@prisma/client'
import type { Permission } from '@crm/shared'

const MB = 1024 * 1024

/**
 * Server yasaydigan `128`/`512` WebP variantlari (09 §9.8). `width` — eni
 * shu o'lchamgacha (mahsulot surati); `box` — uzun tomoni (logotip: keng
 * yoki tik bo'lsa ham kvadratga sig'adi). Shaffoflik WebP'da saqlanadi.
 */
export interface VariantProfile {
  fit: 'width' | 'box'
  quality: number
}

export interface FileRule {
  /** Oq ro'yxat (09 §9.6). `image/svg+xml`, `text/html` — ATAYLAB yo'q */
  mimes: readonly string[]
  maxBytes: number
  /** Kalitdagi bo'lim: `t/{tenant}/{prefix}/{fileId}/orig.{ext}` */
  prefix: string
  /** Kerakli ruxsat: o'qish, yuklash, o'chirish */
  access: FileAccess
  /** O'qish — do'konning barcha rollariga (`access.view` ruxsatisiz) */
  readableByAll?: true
  /** Yuklab olishda `Content-Disposition: attachment` (09 §9.16) */
  attachment: boolean
  bucket: 'media' | 'backup'
  /** Bor bo'lsa — tasdiqlangach fon ishi variantlarni yasaydi */
  variants?: VariantProfile
}

export type FileAction = 'view' | 'create' | 'delete'
export type FileAccess = Readonly<Record<FileAction, Permission>>

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Bo'lim ruxsatlari: o'qish — `view`, yuklash — `create`, o'chirish — `delete` */
const crud = (resource: 'products' | 'employees'): FileAccess => ({
  view: `${resource}.view`, create: `${resource}.create`, delete: `${resource}.delete`,
})
const SETTINGS: FileAccess = { view: 'settings.view', create: 'settings.edit', delete: 'settings.edit' }
/** To'lov cheki (T-149): obuna — administrator ishi; to'lovchi kartasi ko'rinadi, faqat sozlamani o'zgartiradigan rol */
const BILLING: FileAccess = { view: 'settings.edit', create: 'settings.edit', delete: 'settings.edit' }

export const FILE_RULES: Readonly<Record<FileKind, FileRule>> = {
  product_image: {
    mimes: IMAGES, maxBytes: 5 * MB, prefix: 'products', access: crud('products'), attachment: false, bucket: 'media',
    variants: { fit: 'width', quality: 78 },
  },
  avatar: { mimes: IMAGES, maxBytes: 5 * MB, prefix: 'avatars', access: crud('employees'), attachment: false, bucket: 'media' },
  document: { mimes: ['application/pdf'], maxBytes: 10 * MB, prefix: 'docs', access: { view: 'sales.view', create: 'sales.create', delete: 'sales.cancel' }, attachment: true, bucket: 'media' },
  import: { mimes: ['text/csv'], maxBytes: 10 * MB, prefix: 'imports', access: crud('products'), attachment: true, bucket: 'media' },
  export: { mimes: ['text/csv', 'application/json'], maxBytes: 50 * MB, prefix: 'exports', access: { view: 'reports.view', create: 'reports.view', delete: 'reports.view' }, attachment: true, bucket: 'media' },
  tenant_backup: { mimes: ['application/gzip'], maxBytes: 200 * MB, prefix: 'backups', access: SETTINGS, attachment: true, bucket: 'backup' },
  // Logotip: yon menyu va chekda — sotuvchi va omborchi ham ko'radi; brauzer ≤ 512 px qilib yuboradi
  store_logo: {
    mimes: IMAGES, maxBytes: 1 * MB, prefix: 'logos', access: SETTINGS, readableByAll: true, attachment: false, bucket: 'media',
    variants: { fit: 'box', quality: 90 },
  },
  // Karta orqali to'lov cheki: ilova skrinshoti yoki bank PDF'i — egasi tekshiradi
  payment_receipt: { mimes: [...IMAGES, 'application/pdf'], maxBytes: 5 * MB, prefix: 'receipts', access: BILLING, attachment: false, bucket: 'media' },
}

export const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/gzip': 'gz',
}

/** Tasdiqlashda o'qiladigan bosh qism (09 §9.6) */
export const MAGIC_HEAD_BYTES = 256

const starts = (head: Uint8Array, signature: readonly number[]): boolean => signature.every((b, i) => head[i] === b)

/** Matn: NUL bayt yo'q va HTML/XML bilan boshlanmaydi (brauzer uni sahifa deb ochmasin) */
function isPlainText(head: Uint8Array): boolean {
  if (head.includes(0)) return false
  const text = new TextDecoder('utf-8', { fatal: false }).decode(head).replace(/^\uFEFF/, '').trimStart()
  return !text.startsWith('<')
}

const MAGIC: Readonly<Record<string, (head: Uint8Array) => boolean>> = {
  'image/jpeg': (h) => starts(h, [0xff, 0xd8, 0xff]),
  'image/png': (h) => starts(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  // RIFF....WEBP
  'image/webp': (h) => starts(h, [0x52, 0x49, 0x46, 0x46]) && starts(h.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  'application/pdf': (h) => starts(h, [0x25, 0x50, 0x44, 0x46]),
  'application/gzip': (h) => starts(h, [0x1f, 0x8b]),
  'text/csv': isPlainText,
  'application/json': (h) => isPlainText(h) && /^\s*[[{]/.test(new TextDecoder().decode(h).replace(/^\uFEFF/, '')),
}

/**
 * Boshlanish baytlari e'lon qilingan MIME bilan mos keladimi? Presigned
 * URL bilan mijoz istalgan tarkibni yuborishi mumkin — `image/webp` deb,
 * ichida HTML. Shuning uchun tasdiqlashda server tekshiradi.
 */
export function matchesMagic(head: Uint8Array, mime: string): boolean {
  const check = MAGIC[mime]
  return !!check && check(head)
}
