import {
  CashDirection, ClientStatus, ClientType, CustomerGroup, DeliveryStatus, EmployeeStatus, ExpenseCategory,
  MessageTarget, MovementType, PayMethod, POStatus, PriceTier, ProductUnit, QuoteStatus, RecurrencePeriod, SaleStatus,
  SaleType, ShiftStatus, type Role,
} from '@prisma/client'
import { poReceivedValue, type PurchaseOrder } from '@crm/shared'
import { uuidv5 } from '@/common/ids'
import { normalizePhone } from '@/common/validation/phone'
import type { MigrationDto } from './dto/migration.dto'
import { bool, day, docNo, int, isObj, list, moment, money, oneOf, qty, text, type Obj } from './parse'

export type Severity = 'error' | 'warning'

export interface Issue {
  severity: Severity
  entity: string
  id?: string
  code: string
  detail?: string
}

/** Bazaga yoziladigan qator — ustun nomlari bazadagidek (`jsonb_to_recordset`) */
export type Row = Record<string, string | number | boolean | null>

/** Yozish tartibi — tashqi kalitlar bo'yicha (07 §7.4) */
export const TABLE_ORDER = [
  'warehouses', 'categories', 'suppliers', 'employees', 'clients', 'products', 'product_stocks', 'cash_shifts',
  'cash_movements', 'expense_templates', 'expenses', 'purchase_orders', 'po_items', 'supplier_payments', 'sales',
  'sale_items', 'debt_payments', 'quotes', 'quote_items', 'deliveries', 'messages', 'stock_movements', 'audit_log',
] as const
export type TableName = (typeof TABLE_ORDER)[number]

export interface PlanContext {
  tenantId: string
  /** Mavjud sukut ombor — nusxadagi sukut ombor SHUNGA birlashadi (bitta sukut ombor) */
  defaultWarehouseId: string
  /** Mavjud kategoriyalar: nom → id */
  categories: ReadonlyMap<string, string>
  /** Mavjud foydalanuvchi emaillari (kichik harfda) */
  emails: ReadonlySet<string>
  /**
   * Bazadagi noyob qiymatlar: qiymat → egasining id'si. Boshqa yozuvniki
   * bo'lsa — to'qnashuv (qo'shimcha raqam); shu importniki (qayta import) — yo'q
   */
  taken: Readonly<Record<UniqueKind, ReadonlyMap<string, string>>>
  /** Serverda allaqachon ochiq smena (I8) */
  openShiftId: string | null
  today: string
}

export type UniqueKind = 'warehouseName' | 'sku' | 'barcode' | 'saleNumber' | 'quoteNumber' | 'poNumber'

export interface NewUser {
  employee: Row
  userId: string
  email: string
  role: Role
}

export interface ImportPlan {
  /** Nusxadagi yozuvlar soni (ro'yxat bo'yicha) */
  counts: Record<string, number>
  issues: Issue[]
  tables: Record<TableName, Row[]>
  /** Nusxadagi sukut ombor nomi/manzili — mavjud sukut omborga */
  defaultWarehouse?: Row
  settings?: Row
  users: NewUser[]
  images: { productId: string; legacyId: string; dataUrl: string }[]
  cashBalance: number
  activeShiftId: string | null
}

const PERCENT_MAX = 100
const SHORT = 200

/**
 * localStorage nusxasini (`CrmSnapshot`, 07 §7.3) bazaga yoziladigan
 * qatorlarga aylantiradi — YOZMAYDI (dry-run ham shu). Id — deterministik
 * (`uuidv5(tur:eski-id, tenant)`): havolalar xaritasiz tiklanadi, qayta
 * import ikkilanmaydi. Qoidalar (07 §7.4): chek qatorida mahsulot yo'q —
 * chek o'tkaziladi; mijoz yo'q — `NULL`; ombor yo'q — sukut ombor; xodim
 * yo'q — `NULL`; baza cheklovini buzadigan qiymat — tuzatiladi yoki
 * yozuv o'tkaziladi. Har biri hisobotga tushadi.
 */
export function planImport(dto: MigrationDto, ctx: PlanContext): ImportPlan {
  return new SnapshotPlanner(dto, ctx).plan()
}

class SnapshotPlanner {
  private readonly issues: Issue[] = []
  private readonly tables = Object.fromEntries(TABLE_ORDER.map((t) => [t, [] as Row[]])) as Record<TableName, Row[]>
  /** Qabul qilingan eski id'lar — havola tekshiruvi uchun */
  private readonly accepted = new Map<string, Set<string>>()
  /** Mavjud yozuvga birlashtirilgan eski id (`tur:eski-id` → id): nusxadagi sukut ombor */
  private readonly aliases = new Map<string, string>()
  private readonly data: Obj
  private readonly tenantId: string
  private defaultWarehouse?: Row
  private readonly productUnits = new Map<string, ProductUnit>()
  private readonly customerOf = new Map<string, string | null>()
  private readonly supplierOfOrder = new Map<string, string>()

  constructor(
    private readonly dto: MigrationDto,
    private readonly ctx: PlanContext,
  ) {
    this.data = dto.data
    this.tenantId = ctx.tenantId
  }

  plan(): ImportPlan {
    this.warehouses()
    this.categories()
    this.suppliers()
    this.employees()
    this.clients()
    const users = this.users()
    const images = this.products()
    const { cashBalance, activeShiftId } = this.shifts()
    this.cashMovements()
    this.expenseTemplates()
    this.expenses()
    this.purchaseOrders()
    this.supplierPayments()
    this.sales()
    this.debtPayments()
    this.quotes()
    this.deliveries()
    this.messages()
    this.movements()
    this.audit()
    return {
      counts: this.counts(),
      issues: this.issues,
      tables: this.tables,
      defaultWarehouse: this.defaultWarehouse,
      settings: this.settings(),
      users,
      images,
      cashBalance,
      activeShiftId,
    }
  }

  // ── Yordamchilar ──────────────────────────────────────────────────

  private id(entity: string, legacyId: string): string {
    return uuidv5(`${entity}:${legacyId}`, this.tenantId)
  }

  private issue(severity: Severity, entity: string, id: string | undefined, code: string, detail?: string): void {
    this.issues.push({ severity, entity, ...(id !== undefined && { id }), code, ...(detail !== undefined && { detail }) })
  }

  private accept(entity: string, legacyId: string): void {
    const set = this.accepted.get(entity) ?? new Set<string>()
    set.add(legacyId)
    this.accepted.set(entity, set)
  }

  /** Qabul qilingan yozuvga havola — yangi id; yo'q bo'lsa `null` */
  private ref(entity: string, legacyId: unknown): string | null {
    const key = text(legacyId, SHORT)
    if (!key || !this.accepted.get(entity)?.has(key)) return null
    return this.aliases.get(`${entity}:${key}`) ?? this.id(entity, key)
  }

  /** Ixtiyoriy havola: berilgan, lekin topilmadi — ogohlantirish */
  private optionalRef(entity: string, legacyId: unknown, owner: string, ownerId: string, code: string): string | null {
    const found = this.ref(entity, legacyId)
    if (!found && text(legacyId, SHORT)) this.issue('warning', owner, ownerId, code, `${String(legacyId)} topilmadi`)
    return found
  }

  private warehouseRef(legacyId: unknown, owner: string, ownerId: string): string {
    const found = this.ref('warehouse', legacyId)
    if (found) return found
    if (text(legacyId, SHORT)) this.issue('warning', owner, ownerId, 'MISSING_WAREHOUSE', 'sukut omborga bog‘landi')
    return this.ctx.defaultWarehouseId
  }

  /** Ro'yxatning har bir yozuvi: obyekt va eski id bor bo'lsa — ishlovchiga */
  private each(key: string, entity: string, fn: (o: Obj, legacyId: string) => void): void {
    list(this.data[key]).forEach((raw, i) => {
      const legacyId = isObj(raw) ? text(raw.id, SHORT) : undefined
      if (!isObj(raw) || !legacyId) {
        this.issue('error', entity, undefined, 'INVALID_RECORD', `${key}[${i}] — obyekt yoki id yo‘q`)
        return
      }
      fn(raw, legacyId)
    })
  }

  /** Qiymat band: nusxaning o'zida yoki bazada BOSHQA yozuvda */
  private isTaken(value: string, used: ReadonlySet<string>, kind: UniqueKind, ownId: string): boolean {
    const owner = this.ctx.taken[kind].get(value)
    return used.has(value) || (owner !== undefined && owner !== ownId)
  }

  /** Noyob qiymat (SKU, chek raqami): band bo'lsa `-2`, `-3` … va ogohlantirish */
  private unique(value: string, used: Set<string>, kind: UniqueKind, ownId: string, entity: string, legacyId: string, code: string): string {
    let candidate = value
    for (let n = 2; this.isTaken(candidate, used, kind, ownId); n += 1) candidate = `${value}-${n}`
    if (candidate !== value) this.issue('warning', entity, legacyId, code, `${value} → ${candidate}`)
    used.add(candidate)
    return candidate
  }

  private nonNegative(value: number | undefined, entity: string, legacyId: string, field: string): number {
    if (value === undefined) return 0
    if (value >= 0) return value
    this.issue('warning', entity, legacyId, 'NEGATIVE_VALUE', `${field} ${value} → 0`)
    return 0
  }

  private counts(): Record<string, number> {
    const keys = [
      'warehouses', 'products', 'clients', 'suppliers', 'employees', 'sales', 'movements', 'expenses', 'debtPayments',
      'shifts', 'cashMovements', 'purchaseOrders', 'supplierPayments', 'expenseTemplates', 'quotes', 'deliveries',
      'messages', 'audit',
    ]
    return {
      ...Object.fromEntries(keys.map((k) => [k, list(this.data[k]).length])),
      users: this.dto.users?.length ?? 0,
    }
  }

  // ── Spravochniklar ────────────────────────────────────────────────

  /** v15 dan oldin omborlar yo'q — hammasi sukut omborda (07 §7.10) */
  private warehouses(): void {
    const all = list(this.data.warehouses).filter(isObj)
    const legacyDefault = all.find((w) => w.isDefault === true) ?? all[0]
    const names = new Set<string>()
    this.each('warehouses', 'warehouse', (w, legacyId) => {
      const ownId = w === legacyDefault ? this.ctx.defaultWarehouseId : this.id('warehouse', legacyId)
      const name = this.unique(text(w.name, SHORT) ?? 'Ombor', names, 'warehouseName', ownId, 'warehouse', legacyId, 'DUPLICATE_NAME')
      this.accept('warehouse', legacyId)
      if (w === legacyDefault) {
        // Bitta sukut ombor: nusxadagisi mavjudiga birlashadi, havolalar ham unga
        this.aliases.set(`warehouse:${legacyId}`, this.ctx.defaultWarehouseId)
        this.defaultWarehouse = { name, address: text(w.address) ?? null }
        return
      }
      this.tables.warehouses.push({
        id: ownId, tenant_id: this.tenantId, name, address: text(w.address) ?? null,
        is_default: false, archived: bool(w.archived) ?? false,
      })
    })
  }

  /** Mahsulotdagi `category` — nom; spravochnik nomlar ro'yxati + mahsulotlardagilar */
  private categories(): void {
    const names = new Set<string>()
    for (const n of list(this.data.categories)) {
      const name = text(n, 60)
      if (name) names.add(name)
    }
    for (const p of list(this.data.products)) {
      const name = isObj(p) ? text(p.category, 60) : undefined
      if (name) names.add(name)
    }
    let order = this.ctx.categories.size
    for (const name of names) {
      if (this.ctx.categories.has(name)) continue
      this.tables.categories.push({ id: this.id('category', name), tenant_id: this.tenantId, name, sort_order: order++ })
    }
  }

  private categoryId(name: string | undefined): string | null {
    if (!name) return null
    return this.ctx.categories.get(name) ?? this.id('category', name)
  }

  private suppliers(): void {
    this.each('suppliers', 'supplier', (s, legacyId) => {
      const name = text(s.name, SHORT)
      if (!name) return this.issue('error', 'supplier', legacyId, 'INVALID_RECORD', 'nomi bo‘sh')
      this.accept('supplier', legacyId)
      this.tables.suppliers.push({
        id: this.id('supplier', legacyId), tenant_id: this.tenantId, name,
        phone: normalizePhone(text(s.phone, 40) ?? ''), contact_person: text(s.contactPerson, SHORT) ?? null,
        address: text(s.address) ?? null, notes: text(s.notes, 2000) ?? null, email: text(s.email, 254) ?? null,
        tin: text(s.tin, 20) ?? null, payment_term_days: this.termDays(s.paymentTermDays),
      })
    })
  }

  private termDays(v: unknown): number | null {
    const days = int(v)
    return days !== undefined && days >= 0 && days <= 365 ? days : null
  }

  private employees(): void {
    this.each('employees', 'employee', (e, legacyId) => {
      const name = text(e.name, SHORT)
      if (!name) return this.issue('error', 'employee', legacyId, 'INVALID_RECORD', 'ismi bo‘sh')
      this.accept('employee', legacyId)
      this.tables.employees.push({
        id: this.id('employee', legacyId), tenant_id: this.tenantId, name, position: text(e.position, SHORT) ?? '',
        phone: normalizePhone(text(e.phone, 40) ?? ''),
        status: oneOf(e.status, Object.values(EmployeeStatus)) ?? 'active',
        salary: this.nonNegative(money(e.salary), 'employee', legacyId, 'salary'),
        hired_at: day(e.hiredAt) ?? this.ctx.today,
      })
    })
  }

  private clients(): void {
    this.each('clients', 'client', (c, legacyId) => {
      const name = text(c.name, SHORT)
      if (!name) return this.issue('error', 'client', legacyId, 'INVALID_RECORD', 'nomi bo‘sh')
      this.accept('client', legacyId)
      const limit = money(c.creditLimit)
      this.tables.clients.push({
        id: this.id('client', legacyId), tenant_id: this.tenantId, name,
        type: oneOf(c.type, Object.values(ClientType)) ?? 'individual',
        phone: normalizePhone(text(c.phone, 40) ?? ''), email: text(c.email, 254) ?? '',
        status: oneOf(c.status, Object.values(ClientStatus)) ?? 'active',
        group: oneOf(c.group, Object.values(CustomerGroup)) ?? 'retail',
        bonus_points: this.nonNegative(money(c.bonusPoints), 'client', legacyId, 'bonusPoints'),
        // Brauzerda 0 yoki bo'sh — cheklanmagan (types.ts); serverda cheklanmagan — NULL
        credit_limit: limit !== undefined && limit > 0 ? limit : null,
        payment_term_days: this.termDays(c.paymentTermDays), source: text(c.source, SHORT) ?? '',
        company: text(c.company, SHORT) ?? null, notes: text(c.notes, 2000) ?? null,
        created_at: moment(c.createdAt) ?? null,
      })
    })
  }

  /** Parollar ko'chirilmaydi — har biriga vaqtinchalik parol (07 §7.3) */
  private users(): NewUser[] {
    const out: NewUser[] = []
    const seen = new Set(this.ctx.emails)
    for (const u of this.dto.users ?? []) {
      const email = u.email.trim().toLowerCase()
      if (seen.has(email)) {
        this.issue('warning', 'user', email, 'EMAIL_EXISTS', 'bunday foydalanuvchi bor — o‘tkazib yuborildi')
        continue
      }
      seen.add(email)
      const employeeId = this.id('user-employee', email)
      out.push({
        email,
        role: u.role,
        userId: this.id('user', email),
        employee: {
          id: employeeId, tenant_id: this.tenantId, name: u.name, position: u.role, phone: '', status: 'active',
          salary: 0, hired_at: this.ctx.today,
        },
      })
    }
    if (out.length > 0) {
      this.issue('warning', 'user', undefined, 'PASSWORD_RESET_REQUIRED', `${out.length} ta foydalanuvchiga vaqtinchalik parol`)
    }
    return out
  }

  /**
   * Mahsulot va ombor qoldiqlari (I1: jami — trigger). v13 dan oldin
   * taqsimot yo'q — butun qoldiq sukut omborga; manfiy qoldiq — 0 (I2).
   */
  private products(): ImportPlan['images'] {
    const images: ImportPlan['images'] = []
    const skus = new Set<string>()
    const barcodes = new Set<string>()
    this.each('products', 'product', (p, legacyId) => {
      const name = text(p.name, SHORT)
      if (!name) return this.issue('error', 'product', legacyId, 'INVALID_RECORD', 'nomi bo‘sh')
      const id = this.id('product', legacyId)
      const unit = oneOf(p.unit, Object.values(ProductUnit)) ?? 'dona'
      if (unit !== p.unit) this.issue('warning', 'product', legacyId, 'INVALID_UNIT', `${String(p.unit)} → dona`)
      let barcode = text(p.barcode, 64) ?? null
      if (barcode && this.isTaken(barcode, barcodes, 'barcode', id)) {
        this.issue('warning', 'product', legacyId, 'DUPLICATE_BARCODE', `${barcode} — boshqa mahsulotda; olib tashlandi`)
        barcode = null
      }
      if (barcode) barcodes.add(barcode)
      const altFactor = qty(p.altFactor)
      const altUnit = oneOf(p.altUnit, Object.values(ProductUnit))
      const hasAlt = altUnit !== undefined && altFactor !== undefined && altFactor > 0
      this.accept('product', legacyId)
      this.productUnits.set(legacyId, unit)
      this.tables.products.push({
        id, tenant_id: this.tenantId, name,
        sku: this.unique(text(p.sku, 64) ?? `SKU-${legacyId}`, skus, 'sku', id, 'product', legacyId, 'DUPLICATE_SKU'),
        barcode, category_id: this.categoryId(text(p.category, 60)), unit,
        price: this.nonNegative(money(p.price), 'product', legacyId, 'price'),
        wholesale_price: this.nonNegative(money(p.wholesalePrice), 'product', legacyId, 'wholesalePrice'),
        cost: this.nonNegative(money(p.cost), 'product', legacyId, 'cost'),
        min_stock: this.nonNegative(qty(p.minStock), 'product', legacyId, 'minStock'),
        supplier_id: this.optionalRef('supplier', p.supplierId, 'product', legacyId, 'MISSING_SUPPLIER'),
        archived: bool(p.archived) ?? false, alt_unit: hasAlt ? altUnit : null, alt_factor: hasAlt ? altFactor : null,
      })
      this.stocks(p, legacyId, id)
      const image = typeof p.image === 'string' && p.image.startsWith('data:') ? p.image : undefined
      if (image) images.push({ productId: id, legacyId, dataUrl: image })
    })
    return images
  }

  private stocks(p: Obj, legacyId: string, productId: string): void {
    const byWarehouse = new Map<string, number>()
    if (isObj(p.stocks) && Object.keys(p.stocks).length > 0) {
      for (const [warehouse, amount] of Object.entries(p.stocks)) {
        const target = this.warehouseRef(warehouse, 'product', legacyId)
        byWarehouse.set(target, (byWarehouse.get(target) ?? 0) + (qty(amount) ?? 0))
      }
    } else {
      byWarehouse.set(this.ctx.defaultWarehouseId, qty(p.stock) ?? 0)
    }
    for (const [warehouseId, amount] of byWarehouse) {
      const rounded = Math.round(amount * 1000) / 1000
      if (rounded < 0) this.issue('warning', 'product', legacyId, 'NEGATIVE_STOCK', `qoldiq ${rounded} → 0`)
      if (rounded > 0) {
        this.tables.product_stocks.push({ tenant_id: this.tenantId, product_id: productId, warehouse_id: warehouseId, qty: rounded })
      }
    }
  }

  // ── Kassa va xarajatlar ───────────────────────────────────────────

  /** I8: ochiq smena bittadan ko'p bo'lsa — eng oxirgisi qoladi, qolganlari yopiladi */
  private shifts(): { cashBalance: number; activeShiftId: string | null } {
    const open: Row[] = []
    this.each('shifts', 'shift', (s, legacyId) => {
      const openedAt = moment(s.openedAt)
      if (!openedAt) return this.issue('error', 'shift', legacyId, 'INVALID_RECORD', 'ochilgan vaqt yo‘q')
      this.accept('shift', legacyId)
      const row: Row = {
        id: this.id('shift', legacyId), tenant_id: this.tenantId, opened_at: openedAt,
        opening_balance: this.nonNegative(money(s.openingBalance), 'shift', legacyId, 'openingBalance'),
        cash_in: this.nonNegative(money(s.cashIn), 'shift', legacyId, 'cashIn'),
        cash_out: this.nonNegative(money(s.cashOut), 'shift', legacyId, 'cashOut'),
        status: oneOf(s.status, Object.values(ShiftStatus)) ?? 'closed', closed_at: moment(s.closedAt) ?? null,
        expected_balance: money(s.expectedBalance) ?? null, counted_balance: money(s.countedBalance) ?? null,
        difference: money(s.difference) ?? null, note: text(s.note, 2000) ?? null,
      }
      if (row.status === 'open') open.push(row)
      this.tables.cash_shifts.push(row)
    })
    open.sort((x, y) => String(x.opened_at).localeCompare(String(y.opened_at)))
    // Serverda boshqa smena ochiq bo'lsa — nusxadagi ochiq smena ham yopiladi (I8: bittadan ortiq emas)
    const keep = this.ctx.openShiftId && this.ctx.openShiftId !== open.at(-1)?.id ? 0 : 1
    for (const extra of open.slice(0, open.length - keep)) {
      extra.status = 'closed'
      extra.closed_at = extra.opened_at ?? null
      this.issue('warning', 'shift', undefined, 'EXTRA_OPEN_SHIFT', `${String(extra.opened_at)} dagi smena yopildi (I8)`)
    }
    const cashBalance = money(this.data.cashBalance) ?? 0
    const active = keep === 1 ? ((open.at(-1)?.id as string | undefined) ?? null) : null
    return { cashBalance: Math.max(cashBalance, 0), activeShiftId: active }
  }

  private cashMovements(): void {
    this.each('cashMovements', 'cashMovement', (m, legacyId) => {
      const shiftId = this.ref('shift', m.shiftId)
      if (!shiftId) return this.issue('error', 'cashMovement', legacyId, 'MISSING_SHIFT', 'smena topilmadi')
      const amount = money(m.amount)
      const direction = oneOf(m.direction, Object.values(CashDirection))
      if (!amount || amount <= 0 || !direction) return this.issue('error', 'cashMovement', legacyId, 'INVALID_RECORD')
      this.tables.cash_movements.push({
        id: this.id('cashMovement', legacyId), tenant_id: this.tenantId, shift_id: shiftId, direction, amount,
        reason: text(m.reason) ?? '—', created_at: moment(m.createdAt) ?? null,
      })
    })
  }

  private expenseTemplates(): void {
    this.each('expenseTemplates', 'expenseTemplate', (t, legacyId) => {
      const name = text(t.name, SHORT)
      const amount = money(t.amount)
      if (!name || amount === undefined || amount < 0) return this.issue('error', 'expenseTemplate', legacyId, 'INVALID_RECORD')
      const period = oneOf(t.period, Object.values(RecurrencePeriod)) ?? 'monthly'
      const max = period === 'monthly' ? 28 : 7
      const dayOfPeriod = Math.min(Math.max(int(t.dayOfPeriod) ?? 1, 1), max)
      if (dayOfPeriod !== t.dayOfPeriod) this.issue('warning', 'expenseTemplate', legacyId, 'OUT_OF_RANGE', `kun → ${dayOfPeriod}`)
      this.accept('expenseTemplate', legacyId)
      this.tables.expense_templates.push({
        id: this.id('expenseTemplate', legacyId), tenant_id: this.tenantId, name,
        category: oneOf(t.category, Object.values(ExpenseCategory)) ?? 'other', amount,
        method: oneOf(t.method, Object.values(PayMethod)) ?? 'cash', period, day_of_period: dayOfPeriod,
        active: bool(t.active) ?? true, last_run_key: text(t.lastRunKey, 20) ?? null, note: text(t.note, 2000) ?? null,
      })
    })
  }

  private expenses(): void {
    this.each('expenses', 'expense', (x, legacyId) => {
      const amount = money(x.amount)
      const date = day(x.date)
      if (!amount || amount <= 0 || !date) return this.issue('error', 'expense', legacyId, 'INVALID_RECORD', 'summa yoki sana')
      this.tables.expenses.push({
        id: this.id('expense', legacyId), tenant_id: this.tenantId,
        category: oneOf(x.category, Object.values(ExpenseCategory)) ?? 'other', amount,
        method: oneOf(x.method, Object.values(PayMethod)) ?? 'cash', date, note: text(x.note, 2000) ?? null,
        template_id: this.ref('expenseTemplate', x.templateId),
      })
    })
  }

  // ── Ta'minot ──────────────────────────────────────────────────────

  /** Buyurtma: ta'minotchi shart; mahsuloti yo'q qator tushadi, qator qolmasa — buyurtma ham */
  private purchaseOrders(): void {
    const numbers = new Set<string>()
    this.each('purchaseOrders', 'purchaseOrder', (o, legacyId) => {
      const supplierId = this.ref('supplier', o.supplierId)
      if (!supplierId) return this.issue('error', 'purchaseOrder', legacyId, 'MISSING_SUPPLIER', `${String(o.supplierId)} topilmadi`)
      const date = day(o.date)
      if (!date) return this.issue('error', 'purchaseOrder', legacyId, 'INVALID_RECORD', 'sana yo‘q')
      const id = this.id('purchaseOrder', legacyId)
      const items: { row: Row; qty: number; received: number; cost: number }[] = []
      list(o.items).forEach((raw, i) => {
        if (!isObj(raw)) return
        const productId = this.ref('product', raw.productId)
        const ordered = qty(raw.qty)
        if (!productId || !ordered || ordered <= 0) {
          this.issue('warning', 'purchaseOrder', legacyId, 'MISSING_PRODUCT', `${i + 1}-qator tushirib qoldirildi`)
          return
        }
        const received = Math.min(Math.max(qty(raw.receivedQty) ?? 0, 0), ordered)
        const cost = this.nonNegative(money(raw.cost), 'purchaseOrder', legacyId, 'cost')
        items.push({
          qty: ordered, received, cost,
          row: {
            id: this.id('poItem', `${legacyId}:${i}`), tenant_id: this.tenantId, order_id: id, product_id: productId,
            name: text(raw.name, SHORT) ?? 'Mahsulot', qty: ordered, received_qty: received, cost,
          },
        })
      })
      if (items.length === 0) return this.issue('error', 'purchaseOrder', legacyId, 'MISSING_PRODUCT', 'qator qolmadi')
      const status = oneOf(o.status, Object.values(POStatus)) ?? 'ordered'
      const total = this.nonNegative(money(o.total), 'purchaseOrder', legacyId, 'total')
      // I18 kreditorlik — shared qoida bilan (Q53): kelgan tovar qiymati
      const receivedValue = poReceivedValue({
        status, total, items: items.map((it) => ({ receivedQty: it.received, cost: it.cost })),
      } as unknown as PurchaseOrder)
      this.accept('purchaseOrder', legacyId)
      this.supplierOfOrder.set(legacyId, supplierId)
      this.tables.purchase_orders.push({
        id, tenant_id: this.tenantId,
        number: this.unique(text(o.number, 40) ?? `BUY-${legacyId}`, numbers, 'poNumber', id, 'purchaseOrder', legacyId, 'DUPLICATE_NUMBER'),
        supplier_id: supplierId, warehouse_id: this.warehouseRef(o.warehouseId, 'purchaseOrder', legacyId), total,
        paid: this.nonNegative(money(o.paid), 'purchaseOrder', legacyId, 'paid'), received_value: receivedValue, status,
        date, received_date: day(o.receivedDate) ?? null, due_date: day(o.dueDate) ?? null, note: text(o.note, 2000) ?? null,
      })
      this.tables.po_items.push(...items.map((it) => it.row))
    })
  }

  private supplierPayments(): void {
    this.each('supplierPayments', 'supplierPayment', (p, legacyId) => {
      const poId = this.ref('purchaseOrder', p.poId)
      const amount = money(p.amount)
      const date = day(p.date)
      if (!poId) return this.issue('error', 'supplierPayment', legacyId, 'MISSING_ORDER', `${String(p.poId)} topilmadi`)
      if (!amount || amount <= 0 || !date) return this.issue('error', 'supplierPayment', legacyId, 'INVALID_RECORD')
      this.tables.supplier_payments.push({
        id: this.id('supplierPayment', legacyId), tenant_id: this.tenantId, po_id: poId,
        supplier_id: this.ref('supplier', p.supplierId) ?? this.supplierOfOrder.get(String(p.poId))!,
        amount, method: oneOf(p.method, Object.values(PayMethod)) ?? 'cash', date,
      })
    })
  }

  // ── Savdo ─────────────────────────────────────────────────────────

  /**
   * Cheklar. Qatorida mahsuloti yo'q chek — butunlay o'tkaziladi (07
   * §7.4). Nasiya (`pending`) chek mijozsiz saqlanmaydi (I15). Bazada
   * naqd — kassada QOLGAN (Q35): berilgan − qaytim.
   */
  private sales(): void {
    const numbers = new Set<string>()
    const raw = list(this.data.sales).filter(isObj)
    // Qaytarish asl chekka havola qiladi — avval qaysilari qabul qilinishi aniqlanadi
    const saleable = new Set(
      raw.filter((s) => text(s.id, SHORT) && this.saleProblem(s) === undefined).map((s) => text(s.id, SHORT)!),
    )
    this.each('sales', 'sale', (s, legacyId) => {
      const problem = this.saleProblem(s)
      if (problem) return this.issue('error', 'sale', legacyId, problem.code, `${text(s.number, 40) ?? legacyId}: ${problem.detail}`)
      const id = this.id('sale', legacyId)
      const type = oneOf(s.type, Object.values(SaleType)) ?? 'sale'
      const status = oneOf(s.status, Object.values(SaleStatus)) ?? 'completed'
      const customerId = this.optionalRef('client', s.customerId, 'sale', legacyId, 'MISSING_CUSTOMER')
      const total = this.nonNegative(money(s.total), 'sale', legacyId, 'total')
      const paid = isObj(s.paid) ? s.paid : {}
      const change = this.nonNegative(money(s.change), 'sale', legacyId, 'change')
      let cash = Math.max(this.nonNegative(money(paid.cash), 'sale', legacyId, 'paid.cash') - change, 0)
      const card = this.nonNegative(money(paid.card), 'sale', legacyId, 'paid.card')
      const transfer = this.nonNegative(money(paid.transfer), 'sale', legacyId, 'paid.transfer')
      const debtPaid = this.nonNegative(money(s.debtPaid), 'sale', legacyId, 'debtPaid')
      const over = cash + card + transfer + debtPaid - total
      if (over > 0) {
        // I14: to'langan ≤ summa — ortiqchasi naqddan kamaytiriladi
        cash = Math.max(cash - over, 0)
        this.issue('warning', 'sale', legacyId, 'PAID_OVER_TOTAL', `${over} so‘m ortiqcha to‘lov olib tashlandi`)
      }
      this.accept('sale', legacyId)
      this.customerOf.set(legacyId, customerId)
      const related = text(s.relatedSaleId, SHORT)
      this.tables.sales.push({
        id, tenant_id: this.tenantId,
        number: this.unique(text(s.number, 40) ?? `CHEK-${legacyId}`, numbers, 'saleNumber', id, 'sale', legacyId, 'DUPLICATE_NUMBER'),
        type, customer_id: customerId,
        seller_id: this.optionalRef('employee', s.sellerId, 'sale', legacyId, 'MISSING_EMPLOYEE'),
        warehouse_id: this.warehouseRef(s.warehouseId, 'sale', legacyId),
        price_tier: oneOf(s.priceTier, Object.values(PriceTier)) ?? 'retail',
        subtotal: this.nonNegative(money(s.subtotal), 'sale', legacyId, 'subtotal'),
        discount: this.nonNegative(money(s.discount), 'sale', legacyId, 'discount'),
        tax_rate: Math.min(Math.max(int(s.taxRate) ?? 0, 0), PERCENT_MAX),
        tax: this.nonNegative(money(s.tax), 'sale', legacyId, 'tax'),
        delivery_fee: this.nonNegative(money(s.deliveryFee), 'sale', legacyId, 'deliveryFee'),
        total, paid_cash: cash, paid_card: card, paid_transfer: transfer, debt_paid: debtPaid, change, status,
        date: day(s.date)!, due_date: status === 'pending' ? (day(s.dueDate) ?? null) : null,
        related_sale_id: related && saleable.has(related) ? this.id('sale', related) : null,
      })
      if (related && !saleable.has(related)) this.issue('warning', 'sale', legacyId, 'MISSING_SALE', `asl chek ${related} topilmadi`)
      list(s.items).forEach((item, i) => this.tables.sale_items.push(this.lineRow(item as Obj, id, 'saleItem', `${legacyId}:${i}`, i)))
    })
  }

  /** Chekni butunlay o'tkazish sababi (qatorlar va majburiy maydonlar) */
  private saleProblem(s: Obj): { code: string; detail: string } | undefined {
    if (!day(s.date)) return { code: 'INVALID_RECORD', detail: 'sana yo‘q' }
    const items = list(s.items)
    if (items.length === 0) return { code: 'INVALID_RECORD', detail: 'qator yo‘q' }
    for (const item of items) {
      if (!isObj(item) || !this.ref('product', item.productId)) {
        return { code: 'MISSING_PRODUCT', detail: `mahsulot ${isObj(item) ? String(item.productId) : '?'} topilmadi` }
      }
      if (!qty(item.qty) || qty(item.qty)! <= 0) return { code: 'INVALID_RECORD', detail: 'miqdor musbat emas' }
    }
    const pendingSale = (s.type ?? 'sale') === 'sale' && s.status === 'pending'
    if (pendingSale && !this.ref('client', s.customerId)) {
      return { code: 'MISSING_CUSTOMER', detail: 'nasiya chekning mijozi topilmadi (qarz egasiz qolardi)' }
    }
    return undefined
  }

  /** Chek va taklif qatori — bir xil shakl (`SaleItem`) */
  private lineRow(item: Obj, parentId: string, entity: string, key: string, i: number): Row {
    const legacyProduct = String(item.productId)
    const count = qty(item.qty)!
    return {
      id: this.id(entity, key), tenant_id: this.tenantId,
      [entity === 'saleItem' ? 'sale_id' : 'quote_id']: parentId,
      product_id: this.id('product', legacyProduct), name: text(item.name, SHORT) ?? 'Mahsulot',
      unit: oneOf(item.unit, Object.values(ProductUnit)) ?? this.productUnits.get(legacyProduct) ?? 'dona',
      qty: count, base_qty: qty(item.baseQty) ?? count,
      price: Math.max(money(item.price) ?? 0, 0), cost: Math.max(money(item.cost) ?? 0, 0),
      discount: Math.max(money(item.discount) ?? 0, 0), line_no: i + 1,
    }
  }

  private debtPayments(): void {
    this.each('debtPayments', 'debtPayment', (p, legacyId) => {
      const saleId = this.ref('sale', p.saleId)
      const amount = money(p.amount)
      const date = day(p.date)
      if (!saleId) return this.issue('error', 'debtPayment', legacyId, 'MISSING_SALE', `${String(p.saleId)} topilmadi`)
      if (!amount || amount <= 0 || !date) return this.issue('error', 'debtPayment', legacyId, 'INVALID_RECORD')
      this.tables.debt_payments.push({
        id: this.id('debtPayment', legacyId), tenant_id: this.tenantId, sale_id: saleId,
        customer_id: this.ref('client', p.customerId) ?? this.customerOf.get(String(p.saleId)) ?? null, amount,
        method: oneOf(p.method, Object.values(PayMethod)) ?? 'cash', date,
      })
    })
  }

  /** Taklif: mahsuloti yo'q qator tushadi; qator qolmasa — taklif ham */
  private quotes(): void {
    const numbers = new Set<string>()
    const linkedSales = new Set<string>()
    this.each('quotes', 'quote', (q, legacyId) => {
      const date = day(q.date)
      if (!date) return this.issue('error', 'quote', legacyId, 'INVALID_RECORD', 'sana yo‘q')
      const id = this.id('quote', legacyId)
      const lines = list(q.items).filter((item, i) => {
        const ok = isObj(item) && !!this.ref('product', item.productId) && (qty(item.qty) ?? 0) > 0
        if (!ok) this.issue('warning', 'quote', legacyId, 'MISSING_PRODUCT', `${i + 1}-qator tushirib qoldirildi`)
        return ok
      }) as Obj[]
      if (lines.length === 0) return this.issue('error', 'quote', legacyId, 'MISSING_PRODUCT', 'qator qolmadi')
      let saleId = this.ref('sale', q.saleId)
      if (saleId && linkedSales.has(saleId)) saleId = null
      if (saleId) linkedSales.add(saleId)
      this.tables.quotes.push({
        id, tenant_id: this.tenantId,
        number: this.unique(text(q.number, 40) ?? `TKLF-${legacyId}`, numbers, 'quoteNumber', id, 'quote', legacyId, 'DUPLICATE_NUMBER'),
        customer_id: this.optionalRef('client', q.customerId, 'quote', legacyId, 'MISSING_CUSTOMER'),
        seller_id: this.ref('employee', q.sellerId),
        subtotal: this.nonNegative(money(q.subtotal), 'quote', legacyId, 'subtotal'),
        discount: this.nonNegative(money(q.discount), 'quote', legacyId, 'discount'),
        tax_rate: Math.min(Math.max(int(q.taxRate) ?? 0, 0), PERCENT_MAX),
        tax: this.nonNegative(money(q.tax), 'quote', legacyId, 'tax'),
        total: this.nonNegative(money(q.total), 'quote', legacyId, 'total'),
        status: oneOf(q.status, Object.values(QuoteStatus)) ?? 'draft', date, valid_until: day(q.validUntil) ?? null,
        note: text(q.note, 2000) ?? null, sale_id: saleId,
      })
      lines.forEach((item, i) => this.tables.quote_items.push(this.lineRow(item, id, 'quoteItem', `${legacyId}:${i}`, i)))
    })
  }

  /** Yetkazish: chekka bog'liq bo'lsa narxi chek ichida — alohida narx faqat cheksizda */
  private deliveries(): void {
    this.each('deliveries', 'delivery', (d, legacyId) => {
      const saleId = this.optionalRef('sale', d.saleId, 'delivery', legacyId, 'MISSING_SALE')
      this.tables.deliveries.push({
        id: this.id('delivery', legacyId), tenant_id: this.tenantId, sale_id: saleId,
        customer_id: this.ref('client', d.customerId), address: text(d.address) ?? '',
        phone: normalizePhone(text(d.phone, 40) ?? ''),
        standalone_fee: saleId ? null : Math.max(money(d.fee) ?? 0, 0),
        driver_id: this.ref('employee', d.driverId),
        status: oneOf(d.status, Object.values(DeliveryStatus)) ?? 'pending',
        scheduled_date: day(d.scheduledDate) ?? this.ctx.today, note: text(d.note, 2000) ?? null,
        lat: typeof d.lat === 'number' && Number.isFinite(d.lat) ? d.lat : null,
        lng: typeof d.lng === 'number' && Number.isFinite(d.lng) ? d.lng : null,
        created_at: moment(d.createdAt) ?? null,
      })
    })
  }

  private messages(): void {
    this.each('messages', 'message', (m, legacyId) => {
      const body = text(m.text, 2000)
      if (!body) return this.issue('error', 'message', legacyId, 'INVALID_RECORD', 'matn yo‘q')
      this.tables.messages.push({
        id: this.id('message', legacyId), tenant_id: this.tenantId,
        target: oneOf(m.target, Object.values(MessageTarget)) ?? 'all',
        recipient_label: text(m.recipientLabel, SHORT) ?? '—', recipients: Math.max(int(m.recipients) ?? 0, 0),
        text: body, template: text(m.template, 60) ?? null, delivery_status: 'logged', created_at: moment(m.date) ?? null,
      })
    })
  }

  /** Ombor jurnali — tarix (qoldiqni o'zgartirmaydi); mahsuloti yo'q harakat tushadi (07 §7.4) */
  private movements(): void {
    this.each('movements', 'movement', (m, legacyId) => {
      const productId = this.ref('product', m.productId)
      if (!productId) return this.issue('error', 'movement', legacyId, 'MISSING_PRODUCT', `${String(m.productId)} topilmadi`)
      const type = oneOf(m.type, Object.values(MovementType))
      const amount = qty(m.qty)
      const date = day(m.date)
      if (!type || amount === undefined || !date) return this.issue('error', 'movement', legacyId, 'INVALID_RECORD')
      const warehouseId = this.warehouseRef(m.warehouseId, 'movement', legacyId)
      const counter = this.ref('warehouse', m.counterWarehouseId)
      this.tables.stock_movements.push({
        id: this.id('movement', legacyId), tenant_id: this.tenantId, product_id: productId,
        product_name: text(m.productName, SHORT) ?? 'Mahsulot', type, qty: amount, balance_after: qty(m.balanceAfter) ?? 0,
        warehouse_id: warehouseId, counter_warehouse_id: counter !== warehouseId ? counter : null, date,
        note: text(m.note) ?? null, supplier_id: this.ref('supplier', m.supplierId),
        unit_cost: money(m.unitCost) !== undefined ? Math.max(money(m.unitCost)!, 0) : null,
        ref_id: this.ref('sale', m.refId),
      })
    })
  }

  /** Brauzer jurnali (`userName`) — matn sifatida; foydalanuvchi havolasi yo'q */
  private audit(): void {
    this.each('audit', 'audit', (a, legacyId) => {
      const action = text(a.action, 100)
      if (!action) return this.issue('error', 'audit', legacyId, 'INVALID_RECORD', 'amal yo‘q')
      const who = text(a.userName, SHORT)
      const detail = text(a.detail, 2000)
      this.tables.audit_log.push({
        id: this.id('audit', legacyId), tenant_id: this.tenantId, action,
        detail: [who, detail].filter(Boolean).join(': ') || null, created_at: moment(a.date) ?? null,
      })
    })
  }

  /** Brauzer sozlamalari; foizlar 0–100 (baza cheklovi) */
  private settings(): Row | undefined {
    const s = this.dto.settings
    if (!s) return undefined
    const pct = (v: unknown) => {
      const n = int(v)
      return n === undefined ? undefined : Math.min(Math.max(n, 0), PERCENT_MAX)
    }
    const row: Record<string, string | number | boolean | undefined> = {
      store_name: text(s.storeName, SHORT), currency: text(s.currency, 10), tax_enabled: bool(s.taxEnabled),
      tax_rate: pct(s.taxRate), wholesale_enabled: bool(s.wholesaleEnabled), loyalty_enabled: bool(s.loyaltyEnabled),
      loyalty_rate: pct(s.loyaltyRate), max_discount_pct: pct(s.maxDiscountPct), receipt_phone: text(s.receiptPhone, 40),
      receipt_address: text(s.receiptAddress), receipt_footer: text(s.receiptFooter, 2000), onboarded: bool(s.onboarded),
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as Row
  }
}

/** Hujjat hisoblagichlari (I12): import qilingan eng katta raqamdan davom etadi */
export function counterFloors(plan: ImportPlan): Record<string, number> {
  const floors: Record<string, number> = { CHEK: 0, QAYT: 0, TKLF: 0, BUY: 0 }
  const bump = (prefix: string, number: unknown) => {
    floors[prefix] = Math.max(floors[prefix]!, docNo(String(number)))
  }
  for (const s of plan.tables.sales) bump(s.type === 'return' ? 'QAYT' : 'CHEK', s.number)
  for (const q of plan.tables.quotes) bump('TKLF', q.number)
  for (const o of plan.tables.purchase_orders) bump('BUY', o.number)
  return floors
}
