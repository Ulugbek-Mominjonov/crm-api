/**
 * Tenantga tegishli modellar.
 *
 * Bu ro'yxat XAVFSIZLIK chegarasi: bu yerdagi har bir model uchun
 * `tenantId` avtomatik qo'shiladi. Yangi model qo'shilganda uni shu yerga
 * kiritish SHART — aks holda kengaytma xato beradi (jimgina o'tkazib
 * yubormaydi).
 */
export const TENANT_MODELS = new Set([
  'TenantState', 'DocCounter', 'IdempotencyKey', 'Settings',
  'Employee', 'User', 'Role',
  'Client', 'Supplier', 'Category', 'Warehouse',
  'Product', 'ProductStock', 'StockMovement',
  'Sale', 'SaleItem', 'DebtPayment',
  'CashShift', 'CashMovement', 'CashLedgerEntry',
  'Expense', 'ExpenseTemplate', 'PayrollEntry',
  'PurchaseOrder', 'POItem', 'SupplierPayment',
  'Quote', 'QuoteItem', 'Delivery',
  'Message', 'MessageRecipient', 'AuditEntry', 'File', 'Export', 'BillingInvoice', 'FiscalReceipt',
  'TenantRequest', 'TenantRequestMessage',
])

/**
 * Tenantdan TASHQARIDAGI modellar — ular butun tizimga tegishli.
 * `RefreshToken` shu yerda: u foydalanuvchiga bog'langan va login paytida
 * (tenant hali ma'lum bo'lmaganda) o'qiladi. `Platform*` — egasi paneli
 * (T-135): hisob, sessiya va jurnal do'konga bog'lanmaydi.
 */
export const GLOBAL_MODELS = new Set(['Tenant', 'RefreshToken', 'PlatformAdmin', 'PlatformRefreshToken', 'PlatformAuditEntry', 'PlatformSettings'])

/** O'qish amallari — `where` ga tenant qo'shiladi */
export const READ_OPS = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy',
])

/** Yozish amallari — `data` ga tenant qo'shiladi */
export const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn'])

/** O'zgartirish/o'chirish — `where` ga tenant qo'shiladi */
export const MUTATE_OPS = new Set([
  'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
])
