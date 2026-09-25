import type { Prisma } from '@prisma/client'
import { dateFromDb, moneyFromDb, qtyFromDb } from '@/common/crud/convert'
import type { TenantTx } from '@/prisma/prisma.service'

/** Brauzer store versiyasi — zaxira shu shaklda (07 §7.10) */
export const SNAPSHOT_VERSION = 15
/** Brauzer jurnali shuncha yozuv saqlaydi (I22) — zaxirada ham shuncha */
const AUDIT_LIMIT = 1_000
/** Bir so'rovda o'qiladigan qatorlar (eksport bilan bir xil) — butun jadval xotiraga olinmaydi */
const PAGE_SIZE = 1_000

type Json = Record<string, unknown>
/** Kalitli sahifa: `after` — oldingi sahifaning oxirgi `id` si */
type Fetch<T> = (after: string | undefined) => Promise<T[]>

/** `null` maydonlar tushirib qoldiriladi — brauzer tiplarida ular ixtiyoriy (`?`) */
function compact(obj: Json): Json {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined))
}

const day = (d: Date | null): string | undefined => (d ? dateFromDb(d) : undefined)
const money = (v: bigint | null): number | undefined => (v === null ? undefined : moneyFromDb(v))
const qty = (v: Prisma.Decimal | null): number | undefined => (v === null ? undefined : qtyFromDb(v))

/** `id` tartibida (uuid v7 — yaratilish tartibi), `(tenant_id, id)` indeksi bo'yicha */
function page(after: string | undefined, where: Json = {}) {
  return {
    where: { ...where, ...(after !== undefined && { id: { gt: after } }) },
    orderBy: { id: 'asc' as const },
    take: PAGE_SIZE,
  }
}

const LIVE = { deletedAt: null }

const LINE_SELECT = {
  productId: true, name: true, unit: true, qty: true, baseQty: true, price: true, cost: true, discount: true,
} satisfies Prisma.SaleItemSelect

type Line = Prisma.SaleItemGetPayload<{ select: typeof LINE_SELECT }>

function line(i: Line): Json {
  return {
    productId: i.productId, name: i.name, unit: i.unit, qty: qtyFromDb(i.qty), baseQty: qtyFromDb(i.baseQty),
    price: moneyFromDb(i.price), cost: moneyFromDb(i.cost), discount: moneyFromDb(i.discount),
  }
}

/** JSON massiv — sahifama-sahifa; har sahifa bitta bo'lak */
async function* jsonList<T extends { id: string }>(fetch: Fetch<T>, map: (row: T) => unknown): AsyncGenerator<string> {
  yield '['
  let rows: T[] = []
  let separator = ''
  do {
    // Ketma-ket ATAYLAB: keyingi sahifa kursori — oldingisining oxirgi qatori (N+1 emas: 1000 tadan)
    rows = await fetch(rows.at(-1)?.id)
    if (rows.length > 0) yield separator + rows.map((row) => JSON.stringify(map(row))).join(',')
    separator = ','
  } while (rows.length === PAGE_SIZE)
  yield ']'
}

/** Ro'yxatlar — brauzer `CrmSnapshot` kalitlari bilan, hujjatlar bog'liqlik tartibida */
function lists(tx: TenantTx): Record<string, () => AsyncGenerator<string>> {
  return {
    warehouses: () => jsonList(
      (after) => tx.warehouse.findMany({ ...page(after), select: { id: true, name: true, address: true, isDefault: true, archived: true } }),
      (w) => compact(w),
    ),
    categories: () => jsonList((after) => tx.category.findMany({ ...page(after, LIVE), select: { id: true, name: true } }), (c) => c.name),
    suppliers: () => jsonList((after) => tx.supplier.findMany(page(after, LIVE)), (s) => compact({
      id: s.id, name: s.name, phone: s.phone, contactPerson: s.contactPerson, address: s.address, notes: s.notes, email: s.email,
      tin: s.tin, paymentTermDays: s.paymentTermDays,
    })),
    employees: () => jsonList((after) => tx.employee.findMany(page(after, LIVE)), (e) => ({
      id: e.id, name: e.name, position: e.position, phone: e.phone, status: e.status, salary: moneyFromDb(e.salary), hiredAt: day(e.hiredAt),
    })),
    clients: () => jsonList((after) => tx.client.findMany(page(after, LIVE)), (c) => compact({
      id: c.id, name: c.name, type: c.type, phone: c.phone, email: c.email, status: c.status, group: c.group,
      bonusPoints: moneyFromDb(c.bonusPoints), creditLimit: money(c.creditLimit), paymentTermDays: c.paymentTermDays, source: c.source,
      company: c.company, notes: c.notes, createdAt: c.createdAt.toISOString(),
    })),
    products: () => jsonList(
      (after) => tx.product.findMany({
        ...page(after, LIVE),
        select: {
          id: true, name: true, sku: true, barcode: true, unit: true, price: true, wholesalePrice: true, cost: true, stock: true,
          minStock: true, supplierId: true, archived: true, altUnit: true, altFactor: true, category: { select: { name: true } },
          stocks: { select: { warehouseId: true, qty: true } },
        },
      }),
      (p) => compact({
        id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, category: p.category?.name ?? '', unit: p.unit,
        price: moneyFromDb(p.price), wholesalePrice: moneyFromDb(p.wholesalePrice), cost: moneyFromDb(p.cost), stock: qtyFromDb(p.stock),
        stocks: Object.fromEntries(p.stocks.map((s) => [s.warehouseId, qtyFromDb(s.qty)])), minStock: qtyFromDb(p.minStock),
        supplierId: p.supplierId, archived: p.archived, altUnit: p.altUnit, altFactor: qty(p.altFactor),
      }),
    ),
    // Bazada naqd — kassada QOLGANI (Q35); brauzerda `paid.cash` — BERILGANI
    sales: () => jsonList(
      (after) => tx.sale.findMany({ ...page(after, LIVE), include: { items: { select: LINE_SELECT, orderBy: { lineNo: 'asc' } } } }),
      (s) => compact({
        id: s.id, number: s.number, type: s.type, customerId: s.customerId, sellerId: s.sellerId, items: s.items.map(line),
        priceTier: s.priceTier, subtotal: moneyFromDb(s.subtotal), discount: moneyFromDb(s.discount), taxRate: s.taxRate,
        tax: moneyFromDb(s.tax), deliveryFee: moneyFromDb(s.deliveryFee), total: moneyFromDb(s.total),
        paid: { cash: moneyFromDb(s.paidCash + s.change), card: moneyFromDb(s.paidCard), transfer: moneyFromDb(s.paidTransfer) },
        debtPaid: moneyFromDb(s.debtPaid), change: moneyFromDb(s.change), status: s.status, date: day(s.date),
        warehouseId: s.warehouseId, dueDate: day(s.dueDate), relatedSaleId: s.relatedSaleId,
      }),
    ),
    movements: () => jsonList((after) => tx.stockMovement.findMany(page(after)), (m) => compact({
      id: m.id, productId: m.productId, productName: m.productName, type: m.type, qty: qtyFromDb(m.qty), balanceAfter: qtyFromDb(m.balanceAfter),
      warehouseId: m.warehouseId, counterWarehouseId: m.counterWarehouseId, date: day(m.date), note: m.note, supplierId: m.supplierId,
      unitCost: money(m.unitCost), refId: m.refId, userId: m.userId,
    })),
    expenses: () => jsonList((after) => tx.expense.findMany(page(after, LIVE)), (x) => compact({
      id: x.id, category: x.category, amount: moneyFromDb(x.amount), method: x.method, date: day(x.date), note: x.note,
      userId: x.userId, templateId: x.templateId,
    })),
    debtPayments: () => jsonList((after) => tx.debtPayment.findMany(page(after)), (d) => compact({
      id: d.id, saleId: d.saleId, customerId: d.customerId, amount: moneyFromDb(d.amount), method: d.method, date: day(d.date), userId: d.userId,
    })),
    shifts: () => jsonList((after) => tx.cashShift.findMany(page(after)), (s) => compact({
      id: s.id, openedAt: s.openedAt.toISOString(), openingBalance: moneyFromDb(s.openingBalance), cashIn: moneyFromDb(s.cashIn),
      cashOut: moneyFromDb(s.cashOut), status: s.status, closedAt: s.closedAt?.toISOString(), expectedBalance: money(s.expectedBalance),
      countedBalance: money(s.countedBalance), difference: money(s.difference), note: s.note, userId: s.userId,
    })),
    cashMovements: () => jsonList((after) => tx.cashMovement.findMany(page(after)), (m) => compact({
      id: m.id, shiftId: m.shiftId, direction: m.direction, amount: moneyFromDb(m.amount), reason: m.reason,
      createdAt: m.createdAt.toISOString(), userId: m.userId,
    })),
    messages: () => jsonList((after) => tx.message.findMany(page(after)), (m) => compact({
      id: m.id, target: m.target, recipientLabel: m.recipientLabel, recipients: m.recipients, text: m.text, template: m.template,
      date: m.createdAt.toISOString(), userId: m.userId,
    })),
    // Chekka bog'liq yetkazish narxi chek ichida (D3) — brauzerda `fee` maydonida
    deliveries: () => jsonList(
      (after) => tx.delivery.findMany({ ...page(after, LIVE), include: { sale: { select: { deliveryFee: true } } } }),
      (d) => compact({
        id: d.id, saleId: d.saleId, customerId: d.customerId, address: d.address, phone: d.phone,
        fee: moneyFromDb(d.standaloneFee ?? d.sale?.deliveryFee ?? 0n), driverId: d.driverId, status: d.status,
        scheduledDate: day(d.scheduledDate), note: d.note, lat: d.lat, lng: d.lng, createdAt: d.createdAt.toISOString(),
      }),
    ),
    quotes: () => jsonList(
      (after) => tx.quote.findMany({ ...page(after, LIVE), include: { items: { select: LINE_SELECT, orderBy: { lineNo: 'asc' } } } }),
      (q) => compact({
        id: q.id, number: q.number, customerId: q.customerId, sellerId: q.sellerId, items: q.items.map(line), subtotal: moneyFromDb(q.subtotal),
        discount: moneyFromDb(q.discount), taxRate: q.taxRate, tax: moneyFromDb(q.tax), total: moneyFromDb(q.total), status: q.status,
        date: day(q.date), validUntil: day(q.validUntil), note: q.note, saleId: q.saleId,
      }),
    ),
    purchaseOrders: () => jsonList(
      (after) => tx.purchaseOrder.findMany({
        ...page(after, LIVE),
        include: { items: { select: { productId: true, name: true, qty: true, receivedQty: true, cost: true }, orderBy: { id: 'asc' } } },
      }),
      (o) => compact({
        id: o.id, number: o.number, supplierId: o.supplierId,
        items: o.items.map((i) => ({ productId: i.productId, name: i.name, qty: qtyFromDb(i.qty), receivedQty: qtyFromDb(i.receivedQty), cost: moneyFromDb(i.cost) })),
        total: moneyFromDb(o.total), paid: moneyFromDb(o.paid), status: o.status, date: day(o.date), receivedDate: day(o.receivedDate),
        warehouseId: o.warehouseId, dueDate: day(o.dueDate), note: o.note,
      }),
    ),
    supplierPayments: () => jsonList((after) => tx.supplierPayment.findMany(page(after)), (p) => compact({
      id: p.id, poId: p.poId, supplierId: p.supplierId, amount: moneyFromDb(p.amount), method: p.method, date: day(p.date), userId: p.userId,
    })),
    expenseTemplates: () => jsonList((after) => tx.expenseTemplate.findMany(page(after, LIVE)), (t) => compact({
      id: t.id, name: t.name, category: t.category, amount: moneyFromDb(t.amount), method: t.method, period: t.period,
      dayOfPeriod: t.dayOfPeriod, active: t.active, lastRunKey: t.lastRunKey, note: t.note,
    })),
    // Parolsiz: migratsiya importi ularga vaqtinchalik parol beradi (`MigrationDto.users` shakli)
    users: () => jsonList(
      (after) => tx.user.findMany({ ...page(after, LIVE), select: { id: true, email: true, role: true, employee: { select: { name: true } } } }),
      (u) => ({ name: u.employee.name, email: u.email, role: u.role }),
    ),
  }
}

/**
 * Do'konning to'liq nusxasi (T-128) — brauzerdagi "Sozlamalar → Zaxira"
 * shakli (`CrmSnapshot` + `settings`): migratsiya importi uni boshqa
 * do'konga yuklay oladi. Qo'shimcha: `version`, `exportedAt`, `categories`,
 * `users` (parolsiz). Rasmlar kirmaydi — ular S3'da.
 *
 * JSON bo'laklab chiqadi (ro'yxatlar — kalitli sahifalar bilan): katta
 * do'konda ham butun nusxa xotirada turmaydi. Bitta surat bo'lishi uchun
 * chaqiruvchi REPEATABLE READ tranzaksiyasida ishlaydi.
 */
export async function* snapshotJson(tx: TenantTx, tenantId: string): AsyncGenerator<string> {
  const [tenant, settings, state, audit] = await Promise.all([
    tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true } }),
    tx.settings.findUniqueOrThrow({
      where: { tenantId },
      select: {
        storeName: true, currency: true, taxEnabled: true, taxRate: true, wholesaleEnabled: true, loyaltyEnabled: true,
        loyaltyRate: true, maxDiscountPct: true, receiptPhone: true, receiptAddress: true, receiptFooter: true, onboarded: true,
      },
    }),
    tx.tenantState.findUniqueOrThrow({ where: { tenantId }, select: { cashBalance: true, activeShiftId: true } }),
    // Brauzerdagidek — oxirgi yozuvlar, yangisi birinchi
    tx.auditEntry.findMany({
      select: { id: true, createdAt: true, action: true, detail: true, user: { select: { employee: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: AUDIT_LIMIT,
    }),
  ])

  yield `{"version":${SNAPSHOT_VERSION},"exportedAt":${JSON.stringify(new Date().toISOString())},"tenant":${JSON.stringify(tenant)}`
  for (const [key, list] of Object.entries(lists(tx))) {
    yield `,${JSON.stringify(key)}:`
    yield* list()
  }
  const rest = {
    audit: audit.map((a) => compact({
      id: a.id, date: a.createdAt.toISOString(), userName: a.user?.employee.name ?? 'Tizim', action: a.action, detail: a.detail,
    })),
    cashBalance: moneyFromDb(state.cashBalance),
    activeShiftId: state.activeShiftId,
    settings,
  }
  yield `,${JSON.stringify(rest).slice(1)}`
}
