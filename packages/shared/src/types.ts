// Domain types — Qurilish mollari do'koni (construction materials store) CRM

export type ID = string

// ---- Auth / Rollar ----
export type Role = 'admin' | 'manager' | 'sotuvchi' | 'omborchi'

export interface User {
  id: ID
  name: string
  email: string
  role: Role
  position: string
}

// ---- Mijozlar / Xaridorlar ----
export type ClientType = 'individual' | 'company'
export type ClientStatus = 'lead' | 'active' | 'inactive'
export type CustomerGroup = 'retail' | 'wholesale' | 'vip'

export interface Client {
  id: ID
  name: string
  type: ClientType
  phone: string
  email: string
  status: ClientStatus
  group: CustomerGroup // narx darajasi / toifa
  bonusPoints: number // sodiqlik ballari
  /** Nasiya limiti (so'm). 0 yoki bo'sh — cheklanmagan */
  creditLimit?: number
  /** Nasiya uchun standart to'lov muddati (kun) */
  paymentTermDays?: number
  source: string // qayerdan keldi
  company?: string
  notes?: string
  createdAt: string // ISO date
}

// ---- Xabarlar (SMS jurnali) ----
export type MessageTarget = 'customer' | 'group' | 'debtors' | 'all'

export interface Message {
  id: ID
  target: MessageTarget
  recipientLabel: string // kimga (tavsif)
  recipients: number // qabul qiluvchilar soni
  text: string
  template?: string
  date: string
  userId?: ID
}

// ---- Yetkazib beruvchilar ----
export interface Supplier {
  id: ID
  name: string
  phone: string
  contactPerson?: string // aloqa shaxsi
  address?: string
  notes?: string
  email?: string
  tin?: string // STIR / INN
  paymentTermDays?: number // to'lov muddati (kun)
}

// ---- Omborlar ----
/**
 * Jismoniy ombor (do'kon zali, sklad, filial).
 * Har bir mahsulot qoldig'i omborlar bo'yicha taqsimlanadi.
 */
export interface Warehouse {
  id: ID
  name: string
  address?: string
  /** Sukut bo'yicha ombor — o'chirib bo'lmaydi */
  isDefault?: boolean
  archived?: boolean
}

// ---- Mahsulotlar / Ombor ----
export type ProductUnit =
  | 'dona'
  | 'kg'
  | 'metr'
  | 'm2'
  | 'm3'
  | 'litr'
  | 'qop'
  | 'rulon'

export interface Product {
  id: ID
  name: string
  sku: string // artikul
  barcode?: string // shtrix-kod
  image?: string // rasm (dataURL yoki URL)
  category: string
  unit: ProductUnit
  price: number // chakana (roznica) narx
  wholesalePrice: number // ulgurji (optom) narx
  cost: number // tannarx (kirim narxi) — barcha omborlar uchun umumiy
  /**
   * JAMI qoldiq (barcha omborlar yig'indisi).
   * `stocks` bilan doim mos bo'lishi kafolatlanadi — ./warehouse ga qarang.
   */
  stock: number
  /**
   * Ombor bo'yicha qoldiq: omborId → miqdor.
   * Eski yozuvlarda bo'lmaydi — u holda butun `stock` sukut omborda deb olinadi.
   */
  stocks?: Record<ID, number>
  minStock: number // minimal qoldiq (kam qolgan ogohlantirish)
  supplierId?: ID
  archived?: boolean // to'xtatilgan (arxivlangan) mahsulot
  /**
   * Qo'shimcha sotuv birligi. Qoldiq va narx asosiy birlikda (`unit`)
   * yuritiladi, bu esa kassada "1 qop = 50 kg" kabi sotishga imkon beradi.
   */
  altUnit?: ProductUnit
  /** 1 ta `altUnit` nechta `unit` ga teng (masalan qop→kg uchun 50) */
  altFactor?: number
}

// ---- Sotuvlar / Buyurtmalar ----
export type SaleStatus = 'completed' | 'pending' | 'cancelled'
export type SalePayment = 'cash' | 'card' | 'transfer'
export type SaleType = 'sale' | 'return'
export type PriceTier = 'retail' | 'wholesale'

export interface SaleItem {
  productId: ID
  name: string // snapshot (sotuv paytidagi nom)
  unit: ProductUnit // sotuv birligi (asosiy yoki qo'shimcha)
  qty: number // miqdor — `unit` da
  /**
   * Miqdor mahsulotning ASOSIY birligida — ombor chiqimi shu bo'yicha
   * bajariladi. Eski yozuvlarda bo'lmasligi mumkin, u holda `qty` olinadi.
   */
  baseQty?: number
  price: number // birlik narx (tanlangan daraja bo'yicha, snapshot)
  cost: number // tannarx snapshot (foyda hisoblash uchun)
  discount: number // qator chegirmasi (so'm), 0 bo'lishi mumkin
}

/** To'lov taqsimoti (aralash to'lovni qo'llab-quvvatlaydi) */
export interface SalePaid {
  cash: number
  card: number
  transfer: number
}

export interface Sale {
  id: ID
  number: string // chek raqami
  type: SaleType // sotuv yoki qaytarish
  customerId?: ID // naqd xaridor bo'lsa bo'sh
  sellerId?: ID // sotuvchi xodim
  items: SaleItem[]
  priceTier: PriceTier // chakana yoki ulgurji
  subtotal: number // qatorlar summasi (qator chegirmalaridan keyin)
  discount: number // umumiy chegirma (so'm)
  taxRate: number // QQS foizi
  tax: number // QQS summasi
  deliveryFee?: number // yetkazib berish narxi (total ichida)
  total: number // yakuniy summa (yetkazish narxi bilan birga)
  paid: SalePaid // sotuv paytida to'langan (usullar bo'yicha)
  debtPaid: number // keyinchalik qarzdan to'langan summa
  change: number // qaytim (naqddan)
  status: SaleStatus
  date: string // ISO date
  /** Qaysi ombordan sotildi (bekor qilishda shu omborga qaytariladi) */
  warehouseId?: ID
  /** Nasiya uchun to'lov muddati — o'tgach qarz "muddati o'tgan" bo'ladi */
  dueDate?: string
  relatedSaleId?: ID // qaytarish uchun asl sotuv
}

// ---- Yetkazib berish (dostavka) ----
export type DeliveryStatus = 'pending' | 'on_way' | 'delivered' | 'cancelled'

export interface Delivery {
  id: ID
  saleId?: ID
  customerId?: ID
  address: string
  phone: string
  fee: number // yetkazish narxi
  driverId?: ID // haydovchi (xodim)
  status: DeliveryStatus
  scheduledDate: string
  note?: string
  lat?: number // joylashuv (GPS/koordinata)
  lng?: number
  createdAt: string
}

// ---- Kirim buyurtmalari (Purchase Order) / kreditorlik ----
/** `partial` — buyurtmaning bir qismi kelgan */
export type POStatus = 'ordered' | 'partial' | 'received' | 'cancelled'

export interface POItem {
  productId: ID
  name: string
  qty: number // buyurtma qilingan miqdor
  receivedQty?: number // haqiqatda qabul qilingan (qisman kelishi mumkin)
  cost: number // birlik tannarx
}

export interface PurchaseOrder {
  id: ID
  number: string // BUY-1001
  supplierId: ID
  items: POItem[]
  total: number
  paid: number // ta'minotchiga to'langan
  status: POStatus
  date: string
  receivedDate?: string
  /** Qaysi omborga qabul qilinadi */
  warehouseId?: ID
  dueDate?: string // to'lov muddati (ta'minotchi shartiga ko'ra)
  note?: string
}

/** Ta'minotchiga qilingan to'lov (kassa/bank harakati bilan bog'liq) */
export interface SupplierPayment {
  id: ID
  poId: ID
  supplierId: ID
  amount: number
  method: PayMethod
  date: string
  userId?: ID
}

// ---- Xarajatlar ----
export type ExpenseCategory =
  | 'rent'
  | 'utilities'
  | 'salary'
  | 'transport'
  | 'tax'
  | 'other'

export type PayMethod = 'cash' | 'bank'

export interface Expense {
  id: ID
  category: ExpenseCategory
  amount: number
  method: PayMethod // naqd (kassadan) yoki bank
  date: string
  note?: string
  userId?: ID
  /** Qaysi shablondan avtomatik yaratilgan (takrorlanuvchi xarajat) */
  templateId?: ID
}

/** Takrorlanish davri */
export type RecurrencePeriod = 'monthly' | 'weekly'

/**
 * Takrorlanuvchi xarajat shabloni (ijara, maosh, internet...).
 * Har oy/hafta qo'lda kiritish o'rniga bir marta sozlanadi.
 */
export interface ExpenseTemplate {
  id: ID
  name: string
  category: ExpenseCategory
  amount: number
  method: PayMethod
  period: RecurrencePeriod
  /** Oylik uchun 1–28 kun, haftalik uchun 1–7 (dushanba=1) */
  dayOfPeriod: number
  active: boolean
  /** Oxirgi marta qaysi davr uchun yaratilgan: '2026-08' yoki '2026-W32' */
  lastRunKey?: string
  note?: string
}

// ---- Qarz to'lovlari (nasiya) ----
export interface DebtPayment {
  id: ID
  saleId: ID
  customerId: ID
  amount: number
  method: PayMethod
  date: string
  userId?: ID
}

// ---- Kassa smenasi ----
export type ShiftStatus = 'open' | 'closed'

export interface CashShift {
  id: ID
  openedAt: string // ISO datetime
  openingBalance: number
  cashIn: number // smena davomida naqd kirim
  cashOut: number // smena davomida naqd chiqim
  status: ShiftStatus
  closedAt?: string
  expectedBalance?: number // yopishda kutilgan qoldiq
  countedBalance?: number // sanalgan qoldiq
  difference?: number // sanalgan − kutilgan
  note?: string // yopishdagi izoh (farq izohi)
  userId?: ID
}

// ---- Qo'lda naqd harakati (pay-in / pay-out) ----
export type CashDirection = 'in' | 'out'

export interface CashMovement {
  id: ID
  shiftId?: ID
  direction: CashDirection
  amount: number
  reason: string
  createdAt: string // ISO datetime
  userId?: ID
}

// ---- Ombor harakati (stock movement) ----
export type MovementType =
  | 'intake' // kirim (yetkazib beruvchidan)
  | 'writeoff' // hisobdan chiqarish (chiqim)
  | 'adjustment' // inventarizatsiya tuzatishi
  | 'sale' // sotuv (chiqim)
  | 'return' // qaytarish (kirim)
  | 'transfer_out' // boshqa omborga ko'chirildi (chiqim)
  | 'transfer_in' // boshqa ombordan keldi (kirim)

export interface StockMovement {
  id: ID
  productId: ID
  productName: string // snapshot
  type: MovementType
  qty: number // ishorali: + kirim, − chiqim
  /** Shu harakatdan keyingi QOLDIQ — aynan shu omborda */
  balanceAfter: number
  /** Qaysi omborda bo'ldi. Eski yozuvlarda bo'lmaydi (sukut ombor) */
  warehouseId?: ID
  /** Ko'chirishda ikkinchi tomon ombori */
  counterWarehouseId?: ID
  date: string // ISO date
  note?: string // sabab / izoh
  supplierId?: ID // kirim uchun
  unitCost?: number // kirim uchun birlik tannarx
  refId?: ID // bog'liq sotuv/qaytarish id
  userId?: ID // amalni bajargan xodim
}

// ---- Takliflar / Smeta (kotirovka) ----
export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'converted'

export interface Quote {
  id: ID
  number: string // TKLF-1001
  customerId?: ID
  sellerId?: ID
  items: SaleItem[]
  subtotal: number
  discount: number
  taxRate: number
  tax: number
  total: number
  status: QuoteStatus
  date: string
  validUntil?: string
  note?: string
  saleId?: ID // sotuvga aylantirilganda
}

// ---- Audit jurnali ----
export interface AuditEntry {
  id: ID
  date: string // ISO datetime
  userName: string
  action: string // masalan "sale.create"
  detail?: string
}

// ---- Sozlamalar ----
export interface Settings {
  storeName: string
  currency: string
  taxEnabled: boolean
  taxRate: number // %
  wholesaleEnabled: boolean
  loyaltyEnabled: boolean // sodiqlik dasturi
  loyaltyRate: number // xariddan bonus ball % (masalan 1%)
  maxDiscountPct: number // kassada ruxsat etilgan maksimal chegirma % (0–100)
  receiptPhone: string
  receiptAddress: string
  receiptFooter: string
  onboarded: boolean // dastlabki sozlash tugatilganmi
}

// ---- Xodimlar ----
export type EmployeeStatus = 'active' | 'on_leave' | 'fired'

export interface Employee {
  id: ID
  name: string
  position: string // Sotuvchi, Kassir, Omborchi, Menejer ...
  phone: string
  status: EmployeeStatus
  salary: number
  hiredAt: string
}
