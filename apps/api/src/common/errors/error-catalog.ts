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
  WAREHOUSE_ARCHIVED: 'WAREHOUSE_ARCHIVED',
  PRODUCT_ARCHIVED: 'PRODUCT_ARCHIVED',
  DUPLICATE_SKU: 'DUPLICATE_SKU',
  // Nasiya va to'lov
  CREDIT_LIMIT_EXCEEDED: 'CREDIT_LIMIT_EXCEEDED',
  CREDIT_OVERDUE: 'CREDIT_OVERDUE',
  CREDIT_REQUIRES_CUSTOMER: 'CREDIT_REQUIRES_CUSTOMER',
  PAYMENT_EXCEEDS_DEBT: 'PAYMENT_EXCEEDS_DEBT',
  DISCOUNT_LIMIT: 'DISCOUNT_LIMIT',
  PAYMENT_EXCEEDS_TOTAL: 'PAYMENT_EXCEEDS_TOTAL',
  TOTAL_MISMATCH: 'TOTAL_MISMATCH',
  // Hujjatlar
  PO_OVER_RECEIVE: 'PO_OVER_RECEIVE',
  PO_ALREADY_RECEIVED: 'PO_ALREADY_RECEIVED',
  PO_CANCELLED: 'PO_CANCELLED',
  QUOTE_ALREADY_CONVERTED: 'QUOTE_ALREADY_CONVERTED',
  QUOTE_STOCK_SHORT: 'QUOTE_STOCK_SHORT',
  SALE_ALREADY_CANCELLED: 'SALE_ALREADY_CANCELLED',
  SALE_NOT_CANCELLABLE: 'SALE_NOT_CANCELLABLE',
  SALE_NOT_RETURNABLE: 'SALE_NOT_RETURNABLE',
  RETURN_EXCEEDS_SOLD: 'RETURN_EXCEEDS_SOLD',
  // Foydalanuvchilar
  LAST_ADMIN: 'LAST_ADMIN',
  SELF_DELETE: 'SELF_DELETE',
  SELF_ROLE_CHANGE: 'SELF_ROLE_CHANGE',
  EMPLOYEE_HAS_USER: 'EMPLOYEE_HAS_USER',
  // Spravochniklar: bog'liq ma'lumot bor yozuvni o'chirib bo'lmaydi
  CATEGORY_IN_USE: 'CATEGORY_IN_USE',
  CLIENT_HAS_DEBT: 'CLIENT_HAS_DEBT',
  SUPPLIER_HAS_OPEN_ORDERS: 'SUPPLIER_HAS_OPEN_ORDERS',
  // Fayllar
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  PLAN_LIMIT_EXCEEDED: 'PLAN_LIMIT_EXCEEDED',
  TENANT_READ_ONLY: 'TENANT_READ_ONLY',
  FILE_REJECTED: 'FILE_REJECTED',
  FILE_NOT_UPLOADED: 'FILE_NOT_UPLOADED',
  // Yetkazish va xabarlar
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  MESSAGE_LIMIT_EXCEEDED: 'MESSAGE_LIMIT_EXCEEDED',
  RECIPIENT_UNREACHABLE: 'RECIPIENT_UNREACHABLE',
  // Umumiy
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  REFERENCE_NOT_FOUND: 'REFERENCE_NOT_FOUND',
  IDEMPOTENCY_MISMATCH: 'IDEMPOTENCY_MISMATCH',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
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
  WAREHOUSE_ARCHIVED: { status: 422, title: 'Ombor arxivlangan' },
  PRODUCT_ARCHIVED: { status: 422, title: 'Tovar arxivlangan' },
  DUPLICATE_SKU: { status: 409, title: 'Bunday artikul allaqachon bor' },

  CREDIT_LIMIT_EXCEEDED: { status: 422, title: 'Nasiya limitidan oshdi' },
  CREDIT_OVERDUE: { status: 422, title: 'Muddati o‘tgan qarz bor' },
  CREDIT_REQUIRES_CUSTOMER: { status: 422, title: 'Nasiya uchun mijoz tanlanmagan' },
  PAYMENT_EXCEEDS_DEBT: { status: 422, title: 'To‘lov qarzdan ko‘p' },
  DISCOUNT_LIMIT: { status: 422, title: 'Chegirma ruxsat etilgandan ko‘p' },
  PAYMENT_EXCEEDS_TOTAL: { status: 422, title: 'Naqdsiz to‘lov chek summasidan ko‘p' },
  TOTAL_MISMATCH: { status: 422, title: 'Chek summasi server hisobidan farq qiladi' },

  PO_OVER_RECEIVE: { status: 422, title: 'Buyurtmadan ko‘p qabul qilinmoqda' },
  PO_ALREADY_RECEIVED: { status: 409, title: 'Buyurtma to‘liq qabul qilingan' },
  PO_CANCELLED: { status: 409, title: 'Buyurtma bekor qilingan' },
  QUOTE_ALREADY_CONVERTED: { status: 409, title: 'Taklif allaqachon aylantirilgan' },
  QUOTE_STOCK_SHORT: { status: 422, title: 'Aylantirishga qoldiq yetmaydi' },
  SALE_ALREADY_CANCELLED: { status: 409, title: 'Chek allaqachon bekor qilingan' },
  SALE_NOT_CANCELLABLE: { status: 409, title: 'Chekni bekor qilib bo‘lmaydi' },
  SALE_NOT_RETURNABLE: { status: 422, title: 'Bu hujjatdan qaytarib bo‘lmaydi' },
  RETURN_EXCEEDS_SOLD: { status: 422, title: 'Qaytarish sotilgan miqdordan ko‘p' },

  LAST_ADMIN: { status: 422, title: 'Oxirgi administratorni o‘chirib bo‘lmaydi' },
  SELF_DELETE: { status: 422, title: 'O‘z hisobingizni o‘chirib bo‘lmaydi' },
  SELF_ROLE_CHANGE: { status: 422, title: 'O‘z rolingizni o‘zgartirib bo‘lmaydi' },
  EMPLOYEE_HAS_USER: { status: 409, title: 'Xodimning kirish hisobi bor' },

  CATEGORY_IN_USE: { status: 409, title: 'Kategoriya mahsulotlarda ishlatilmoqda' },
  CLIENT_HAS_DEBT: { status: 409, title: 'Mijozning to‘lanmagan qarzi bor' },
  SUPPLIER_HAS_OPEN_ORDERS: { status: 409, title: 'Ta’minotchining ochiq buyurtmalari bor' },

  STORAGE_QUOTA_EXCEEDED: { status: 413, title: 'Fayl saqlash hajmi tugadi' },
  PLAN_LIMIT_EXCEEDED: { status: 402, title: 'Tarif chegarasi tugadi — tarifni oshiring' },
  TENANT_READ_ONLY: { status: 423, title: 'Do‘kon faqat o‘qish rejimida' },
  FILE_REJECTED: { status: 422, title: 'Fayl tarkibi e’lon qilingan turga mos emas' },
  FILE_NOT_UPLOADED: { status: 409, title: 'Fayl hali yuklanmagan' },
  INVALID_STATUS_TRANSITION: { status: 422, title: 'Holatni bunday o‘zgartirib bo‘lmaydi' },
  MESSAGE_LIMIT_EXCEEDED: { status: 429, title: 'Kunlik xabar chegarasi tugadi' },
  RECIPIENT_UNREACHABLE: { status: 422, title: 'Mijozga yetkazib bo‘lmaydi' },

  ALREADY_EXISTS: { status: 409, title: 'Bunday yozuv allaqachon bor' },
  REFERENCE_NOT_FOUND: { status: 422, title: 'Bog‘langan yozuv topilmadi' },
  IDEMPOTENCY_MISMATCH: { status: 409, title: 'Bir kalit bilan boshqa so‘rov' },
  VERSION_CONFLICT: { status: 409, title: 'Yozuv boshqa foydalanuvchi tomonidan o‘zgargan' },
  VALIDATION_FAILED: { status: 400, title: 'So‘rov ma’lumotlari noto‘g‘ri' },
  PAYLOAD_TOO_LARGE: { status: 413, title: 'So‘rov hajmi juda katta' },
  NOT_FOUND: { status: 404, title: 'Topilmadi' },
  INTERNAL: { status: 500, title: 'Ichki xato' },
}

/** Kod bo'yicha HTTP status */
export function statusOf(code: ErrorCodeName): number {
  return ERROR_CATALOG[code].status
}
