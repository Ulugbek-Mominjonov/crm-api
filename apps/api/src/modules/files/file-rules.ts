import type { FileKind } from '@prisma/client'
import type { Resource } from '@crm/shared'

const MB = 1024 * 1024

export interface FileRule {
  /** Oq ro'yxat (09 §9.6). `image/svg+xml`, `text/html` — ATAYLAB yo'q */
  mimes: readonly string[]
  maxBytes: number
  /** Kalitdagi bo'lim: `t/{tenant}/{prefix}/{fileId}/orig.{ext}` */
  prefix: string
  /** Huquq resursi: yuklash — `create`, o'qish — `view` */
  resource: Resource
  /** Yuklab olishda `Content-Disposition: attachment` (09 §9.16) */
  attachment: boolean
  bucket: 'media' | 'backup'
}

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const FILE_RULES: Readonly<Record<FileKind, FileRule>> = {
  product_image: { mimes: IMAGES, maxBytes: 5 * MB, prefix: 'products', resource: 'products', attachment: false, bucket: 'media' },
  avatar: { mimes: IMAGES, maxBytes: 5 * MB, prefix: 'avatars', resource: 'employees', attachment: false, bucket: 'media' },
  document: { mimes: ['application/pdf'], maxBytes: 10 * MB, prefix: 'docs', resource: 'sales', attachment: true, bucket: 'media' },
  import: { mimes: ['text/csv'], maxBytes: 10 * MB, prefix: 'imports', resource: 'products', attachment: true, bucket: 'media' },
  export: { mimes: ['text/csv', 'application/json'], maxBytes: 50 * MB, prefix: 'exports', resource: 'finance', attachment: true, bucket: 'media' },
  tenant_backup: { mimes: ['application/gzip'], maxBytes: 200 * MB, prefix: 'backups', resource: 'settings', attachment: true, bucket: 'backup' },
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
