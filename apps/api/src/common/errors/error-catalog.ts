/**
 * Xato kodlarining YAGONA manbai.
 *
 * Bu jadval API shartnomasining bir qismi: frontend `code` bo'yicha qaror
 * qabul qiladi. Shuning uchun kod qo'shilsa yoki statusi o'zgarsa — bu
 * buzuvchi o'zgarish va hujjat ham yangilanadi
 * (backend-tz/core/04-api-conventions.md §4.1).
 */

export const ErrorCode = {
  // Auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_INVALID_REFRESH: 'AUTH_INVALID_REFRESH',
  AUTH_TOKEN_REUSE: 'AUTH_TOKEN_REUSE',
  AUTH_TENANT_REQUIRED: 'AUTH_TENANT_REQUIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  // Kassa smenasi
  SHIFT_REQUIRED: 'SHIFT_REQUIRED',
  SHIFT_ALREADY_OPEN: 'SHIFT_ALREADY_OPEN',
  SHIFT_NOT_OPEN: 'SHIFT_NOT_OPEN',
  // Ombor
  STOCK_INSUFFICIENT: 'STOCK_INSUFFICIENT',
  STOCK_NEGATIVE: 'STOCK_NEGATIVE',
  WAREHOUSE_SAME: 'WAREHOUSE_SAME',
  WAREHOUSE_DEFAULT_LOCKED: 'WAREHOUSE_DEFAULT_LOCKED',
  PRODUCT_ARCHIVED: 'PRODUCT_ARCHIVED',
  DUPLICATE_SKU: 'DUPLICATE_SKU',
  // Nasiya va to'lov
  CREDIT_LIMIT_EXCEEDED: 'CREDIT_LIMIT_EXCEEDED',
  CREDIT_OVERDUE: 'CREDIT_OVERDUE',
  CREDIT_REQUIRES_CUSTOMER: 'CREDIT_REQUIRES_CUSTOMER',
  PAYMENT_EXCEEDS_DEBT: 'PAYMENT_EXCEEDS_DEBT',
  DISCOUNT_LIMIT: 'DISCOUNT_LIMIT',
  // Hujjatlar
  PO_OVER_RECEIVE: 'PO_OVER_RECEIVE',
  PO_ALREADY_RECEIVED: 'PO_ALREADY_RECEIVED',
  QUOTE_ALREADY_CONVERTED: 'QUOTE_ALREADY_CONVERTED',
  QUOTE_STOCK_SHORT: 'QUOTE_STOCK_SHORT',
  SALE_ALREADY_CANCELLED: 'SALE_ALREADY_CANCELLED',
  // Foydalanuvchilar
  LAST_ADMIN: 'LAST_ADMIN',
  SELF_DELETE: 'SELF_DELETE',
  // Umumiy
  IDEMPOTENCY_MISMATCH: 'IDEMPOTENCY_MISMATCH',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCodeName = (typeof ErrorCode)[keyof typeof ErrorCode]

interface CatalogEntry {
  /** HTTP status. 400 — so'rov shakli; 422 — biznes qoidasi */
  status: number
  /** Odam uchun qisqa sarlavha (frontend tarjima qilishi mumkin) */
  title: string
}

export const ERROR_CATALOG: Readonly<Record<ErrorCodeName, CatalogEntry>> = {
  AUTH_INVALID_CREDENTIALS: { status: 401, title: 'Email yoki parol xato' },
  AUTH_ACCOUNT_LOCKED: { status: 423, title: 'Hisob vaqtincha bloklandi' },
  AUTH_INVALID_REFRESH: { status: 401, title: 'Sessiya yaroqsiz' },
  AUTH_TOKEN_REUSE: { status: 401, title: 'Bekor qilingan token ishlatildi' },
  AUTH_TENANT_REQUIRED: { status: 409, title: 'Do‘konni tanlang' },
  PERMISSION_DENIED: { status: 403, title: 'Ruxsat yo‘q' },

  SHIFT_REQUIRED: { status: 423, title: 'Kassa smenasi ochiq emas' },
  SHIFT_ALREADY_OPEN: { status: 409, title: 'Smena allaqachon ochiq' },
  SHIFT_NOT_OPEN: { status: 409, title: 'Smena ochiq emas' },

  STOCK_INSUFFICIENT: { status: 422, title: 'Omborda yetarli tovar yo‘q' },
  STOCK_NEGATIVE: { status: 422, title: 'Qoldiq manfiy bo‘lib qoladi' },
  WAREHOUSE_SAME: { status: 422, title: 'Omborlar bir xil' },
  WAREHOUSE_DEFAULT_LOCKED: { status: 422, title: 'Sukut omborni o‘zgartirib bo‘lmaydi' },
  PRODUCT_ARCHIVED: { status: 422, title: 'Tovar arxivlangan' },
  DUPLICATE_SKU: { status: 409, title: 'Bunday artikul allaqachon bor' },

  CREDIT_LIMIT_EXCEEDED: { status: 422, title: 'Nasiya limitidan oshdi' },
  CREDIT_OVERDUE: { status: 422, title: 'Muddati o‘tgan qarz bor' },
  CREDIT_REQUIRES_CUSTOMER: { status: 422, title: 'Nasiya uchun mijoz tanlanmagan' },
  PAYMENT_EXCEEDS_DEBT: { status: 422, title: 'To‘lov qarzdan ko‘p' },
  DISCOUNT_LIMIT: { status: 422, title: 'Chegirma ruxsat etilgandan ko‘p' },

  PO_OVER_RECEIVE: { status: 422, title: 'Buyurtmadan ko‘p qabul qilinmoqda' },
  PO_ALREADY_RECEIVED: { status: 409, title: 'Buyurtma to‘liq qabul qilingan' },
  QUOTE_ALREADY_CONVERTED: { status: 409, title: 'Taklif allaqachon aylantirilgan' },
  QUOTE_STOCK_SHORT: { status: 422, title: 'Aylantirishga qoldiq yetmaydi' },
  SALE_ALREADY_CANCELLED: { status: 409, title: 'Chek allaqachon bekor qilingan' },

  LAST_ADMIN: { status: 422, title: 'Oxirgi administratorni o‘chirib bo‘lmaydi' },
  SELF_DELETE: { status: 422, title: 'O‘z hisobingizni o‘chirib bo‘lmaydi' },

  IDEMPOTENCY_MISMATCH: { status: 409, title: 'Bir kalit bilan boshqa so‘rov' },
  VERSION_CONFLICT: { status: 409, title: 'Yozuv boshqa foydalanuvchi tomonidan o‘zgargan' },
  VALIDATION_FAILED: { status: 400, title: 'So‘rov ma’lumotlari noto‘g‘ri' },
  NOT_FOUND: { status: 404, title: 'Topilmadi' },
  INTERNAL: { status: 500, title: 'Ichki xato' },
}

/** Kod bo'yicha HTTP status */
export function statusOf(code: ErrorCodeName): number {
  return ERROR_CATALOG[code].status
}
