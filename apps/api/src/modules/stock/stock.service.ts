import { Injectable } from '@nestjs/common'
import { MovementType, Prisma } from '@prisma/client'
import { averageCost } from '@crm/shared'
import { lockProducts, type LockedProduct } from '@/common/db/lock'
import { uuidArray, withCtes } from '@/common/db/sql'
import { moneyFromDb } from '@/common/crud/convert'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { DomainError, type FieldError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { fromMilli, milliToDb, toMilli } from '@/common/quantity'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'

/** Bitta ombor o'zgarishi. Miqdor ASOSIY birlikda (I23) */
export interface StockChange {
  productId: string
  /** Berilmasa — do'konning joriy ombori (arxivlangan bo'lsa — sukut ombor) */
  warehouseId?: string
  type: MovementType
  /** Ishorali: + kirim, − chiqim. `countTo` bilan birga berilmaydi */
  qty?: number
  /** Inventarizatsiya: SANALGAN miqdor — farq qulfdan KEYIN hisoblanadi */
  countTo?: number
  /** Kirim narxi: o'rtacha tannarx qayta hisoblanadi (I11) */
  unitCost?: number
  counterWarehouseId?: string
  supplierId?: string
  refId?: string
  note?: string
  /** Xato javobidagi maydon yo'li: `productId`, `items[2].productId` ... */
  field?: string
}

export interface AppliedMovement {
  movementId: string
  productId: string
  warehouseId: string
  type: MovementType
  qty: number
  balanceAfter: number
}

/** O'zgargan mahsulotning yangi holati (javob uchun) */
export interface ProductStockState {
  id: string
  name: string
  stock: number
  cost: number
  stocks: Record<string, number>
}

export interface StockResult {
  movements: AppliedMovement[]
  products: Map<string, ProductStockState>
  /** Farqi 0 bo'lgan inventarizatsiya qatorlari — harakat yozilmadi */
  unchanged: string[]
}

export interface StockWriteMeta {
  date: string
  userId?: string
  /**
   * Izohsiz harakatlar izohi — SQL ifoda. Hujjat raqami (`CHEK-1042`) shu
   * so'rovning o'zidagi hisoblagich CTE'sidan olinadi, oldindan ma'lum emas
   */
  noteFallback?: Prisma.Sql
}

/**
 * Tekshirilgan, hali yozilmagan amal: qulflar olingan, qoldiqlar va
 * `balanceAfter` hisoblangan. Yozuv — `writeCtes` (hujjat so'rovi ichida)
 * yoki `apply` (alohida so'rov).
 */
export interface StockPlan {
  movements: PlannedMovement[]
  costs: Map<string, bigint>
  unchanged: string[]
  products: Map<string, LockedProduct>
  balances: Map<string, Map<string, number>>
}

/** Arxivlangan omborda taqiqlangan harakatlar: yangi tovar kiritish va sotish */
const ARCHIVED_FORBIDDEN: ReadonlySet<MovementType> = new Set<MovementType>([
  MovementType.intake,
  MovementType.transfer_in,
  MovementType.sale,
])

interface BalanceRow {
  productId: string
  warehouseId: string
  qty: string
}

interface WarehouseRow {
  id: string
  name: string
  archived: boolean
  isDefault: boolean
  isActive: boolean
}

/** So'ralgan omborlar va joriy ombor (warehouseId berilmagan harakatlar uchun) */
interface WarehouseLookup {
  byId: Map<string, WarehouseRow>
  active?: WarehouseRow
}

export interface PlannedMovement {
  id: string
  change: StockChange
  warehouseId: string
  qtyMilli: number
  balanceMilli: number
}

/**
 * Ombor harakatlari yozuvchisi — qoldiq FAQAT shu yerda o'zgaradi.
 *
 * Bitta chaqiruv = bitta amal: qoldiq + harakat yozuvi + `balanceAfter` +
 * (kirimda) tannarx — chaqiruvchining tranzaksiyasida. So'rovlar soni
 * qatorlar soniga BOG'LIQ EMAS (10 §10.9): qulf, qoldiqlar bilan omborlar
 * va bitta yozuvchi so'rov — jami 3 ta. Hujjat (sotuv) yozuvi ombor
 * yozuvini O'Z so'roviga qo'shadi (`prepare` + `writeCtes`) — 2 ta.
 *
 * Invariantlar: I1 (jami = taqsimot, trigger), I2 (manfiy qoldiq yo'q —
 * aniq xato, baza CHECK'i oxirgi to'siq), I11 (o'rtacha tannarx — shared),
 * I23 (miqdor asosiy birlikda).
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  /** Mustaqil ombor amali; hujjat (sotuv, kirim) o'z hodisasini o'zi e'lon qiladi */
  async apply(changes: StockChange[], meta: StockWriteMeta): Promise<StockResult> {
    const plan = await this.prepare(changes)
    const ctes = this.writeCtes(plan, meta)
    if (ctes.length > 0) {
      await this.prisma.scoped
        .$executeRaw(withCtes(ctes, Prisma.sql`SELECT 1`))
        .catch((err: unknown) => rethrowAsDomain(err, { resource: 'Ombor harakati' }))
      this.announce(plan)
    }
    return this.result(plan)
  }

  /** `stock.changed` — har ombor uchun alohida (ko'chirishda ikkitasi) */
  private announce(plan: StockPlan): void {
    const byWarehouse = new Map<string, Set<string>>()
    for (const m of plan.movements) {
      byWarehouse.set(m.warehouseId, (byWarehouse.get(m.warehouseId) ?? new Set()).add(m.change.productId))
    }
    for (const [warehouseId, productIds] of byWarehouse) {
      this.events.publish('stock.changed', { warehouseId, productIds: [...productIds] })
    }
  }

  /**
   * Qulf, qoldiqlar va reja — YOZMAYDI. Xatolar (I2, arxiv ombor, begona
   * havola) shu yerda chiqadi, hujjat yozilishidan oldin.
   *
   * `locked` — chaqiruvchi mahsulotlarni o'zi qulflagan bo'lsa (sotuv narx
   * va birlik uchun ularni oldinroq o'qiydi): qulf so'rovi takrorlanmaydi.
   */
  async prepare(changes: StockChange[], locked?: Map<string, LockedProduct>): Promise<StockPlan> {
    const tx = this.prisma.scoped
    const { tenantId } = requireTenantTx()

    // 1. Qulf — id tartibida (deadlock yo'q). Shundan keyingi o'qishlar
    //    YANGI surat oladi va boshqa tranzaksiya o'zgarishini ko'radi
    const products = locked ?? (await lockProducts(tx, changes.map((c) => c.productId)))
    changes.forEach((change) => {
      if (!products.has(change.productId)) {
        throw referenceError(change.field ?? 'productId', 'Mahsulot topilmadi')
      }
    })

    // 2. Qoldiqlar va omborlar — qulfdan KEYIN, bitta alohida so'rovda (01 §1.7)
    const { balances, warehouses } = await this.readState(tx, tenantId, [...products.keys()], changes)
    return { ...this.plan(changes, products, balances, warehouses), products, balances }
  }

  /** Reja bo'yicha javob: harakatlar va mahsulotlarning yangi holati */
  result(plan: StockPlan): StockResult {
    return {
      movements: plan.movements.map((m) => ({
        movementId: m.id,
        productId: m.change.productId,
        warehouseId: m.warehouseId,
        type: m.change.type,
        qty: fromMilli(m.qtyMilli),
        balanceAfter: fromMilli(m.balanceMilli),
      })),
      products: productStates(plan.products, plan.balances, plan.costs),
      unchanged: plan.unchanged,
    }
  }

  /**
   * Qulflangan mahsulotlarning BUTUN taqsimoti (product → ombor → milli) va
   * so'ralgan omborlar + joriy (tenant_state) va sukut ombor — BITTA so'rov.
   * Miqdor matn bo'lib keladi: JSON raqami kasrni yo'qotmasin.
   * Kengaytma xom SQL ga tenant qo'shmaydi — shart aniq (03 §3.7).
   */
  private async readState(
    tx: TenantTx,
    tenantId: string,
    productIds: string[],
    changes: StockChange[],
  ): Promise<{ balances: Map<string, Map<string, number>>; warehouses: WarehouseLookup }> {
    const warehouseIds = [
      ...new Set(changes.flatMap((c) => [c.warehouseId, c.counterWarehouseId].filter((id): id is string => !!id))),
    ]
    const [row] = await tx.$queryRaw<{ balances: BalanceRow[]; warehouses: WarehouseRow[] }[]>`
      SELECT
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'productId', ps.product_id, 'warehouseId', ps.warehouse_id, 'qty', ps.qty::text)), '[]'::jsonb)
           FROM product_stocks ps
          WHERE ps.tenant_id = ${tenantId}::uuid AND ps.product_id = ANY(${uuidArray(productIds)})) AS balances,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'id', w.id, 'name', w.name, 'archived', w.archived, 'isDefault', w.is_default,
                  'isActive', COALESCE(w.id = s.active_warehouse_id, false))), '[]'::jsonb)
           FROM warehouses w
           LEFT JOIN tenant_state s ON s.tenant_id = w.tenant_id
          WHERE w.tenant_id = ${tenantId}::uuid
            AND (w.id = ANY(${uuidArray(warehouseIds)}) OR w.is_default OR w.id = s.active_warehouse_id)) AS warehouses`

    const balances = new Map<string, Map<string, number>>(productIds.map((id) => [id, new Map()]))
    for (const b of row!.balances) balances.get(b.productId)?.set(b.warehouseId, toMilli(b.qty))
    return {
      balances,
      warehouses: {
        byId: new Map(row!.warehouses.map((w) => [w.id, w])),
        // Joriy ombor arxivlangan bo'lsa — sukut ombor (frontend qoidasi bilan bir xil)
        active: row!.warehouses.find((w) => w.isActive && !w.archived) ?? row!.warehouses.find((w) => w.isDefault),
      },
    }
  }

  /**
   * Xotirada, o'zgarishlar TARTIBIDA: har harakatdan keyingi qoldiq
   * (`balanceAfter`), I2 tekshiruvi va I11 tannarxi. Hisob butun
   * mingdan birlarda — suzuvchi nuqta xatosi yo'q.
   */
  private plan(
    changes: StockChange[],
    products: Map<string, LockedProduct>,
    balances: Map<string, Map<string, number>>,
    warehouses: WarehouseLookup,
  ): { movements: PlannedMovement[]; costs: Map<string, bigint>; unchanged: string[] } {
    const movements: PlannedMovement[] = []
    const shortages: FieldError[] = []
    const shortageText: string[] = []
    const costs = new Map<string, bigint>()
    const totals = new Map([...balances].map(([id, byWh]) => [id, sum(byWh)]))
    const unchanged: string[] = []

    for (const change of changes) {
      const product = products.get(change.productId)!
      const warehouse = this.resolveWarehouse(change, warehouses)
      const byWh = balances.get(change.productId)!
      const before = byWh.get(warehouse.id) ?? 0
      const qtyMilli = change.countTo !== undefined ? toMilli(change.countTo) - before : toMilli(change.qty ?? 0)
      if (qtyMilli === 0) {
        unchanged.push(change.productId)
        continue
      }

      const after = before + qtyMilli
      if (after < 0) {
        // I2: aynan QAYSI omborda yetmagani ko'rsatiladi
        shortages.push({
          field: change.field ?? 'productId',
          code: 'STOCK_INSUFFICIENT',
          meta: {
            productId: product.id,
            warehouseId: warehouse.id,
            available: fromMilli(before),
            requested: fromMilli(-qtyMilli),
          },
        })
        shortageText.push(
          `${product.name} (${warehouse.name}): kerak ${fromMilli(-qtyMilli)}, mavjud ${fromMilli(before)}`,
        )
        continue
      }

      // I11: kirim narxi bilan o'rtacha tannarx — JAMI qoldiq bo'yicha
      if (qtyMilli > 0 && change.unitCost !== undefined && change.unitCost > 0) {
        const current = costs.get(product.id) ?? product.cost
        const next = averageCost(fromMilli(totals.get(product.id)!), moneyFromDb(current), fromMilli(qtyMilli), change.unitCost)
        costs.set(product.id, BigInt(next))
      }

      byWh.set(warehouse.id, after)
      totals.set(product.id, totals.get(product.id)! + qtyMilli)
      movements.push({ id: uuidv7(), change, warehouseId: warehouse.id, qtyMilli, balanceMilli: after })
    }

    if (shortages.length > 0) {
      throw new DomainError('STOCK_INSUFFICIENT', shortageText.join('; '), shortages)
    }
    return { movements, costs, unchanged }
  }

  private resolveWarehouse(change: StockChange, warehouses: WarehouseLookup): WarehouseRow {
    const warehouse = change.warehouseId ? warehouses.byId.get(change.warehouseId) : warehouses.active
    if (!warehouse) throw referenceError('warehouseId', 'Ombor topilmadi')
    if (warehouse.archived && ARCHIVED_FORBIDDEN.has(change.type)) {
      throw new DomainError('WAREHOUSE_ARCHIVED', `«${warehouse.name}» arxivlangan — unga kirim va sotuv yo‘q`, [
        { field: 'warehouseId', code: 'WAREHOUSE_ARCHIVED' },
      ])
    }
    return warehouse
  }

  /**
   * Yozuv CTE'lari: qoldiqlar (upsert), tannarx va harakatlar jurnali —
   * chaqiruvchining BITTA so'rovi ichida. `products.stock` ni trigger
   * yangilaydi (I1) — bu yerda unga tegilmaydi. Harakat yo'q — bo'sh ro'yxat.
   *
   * Ma'lumot `jsonb_to_recordset` orqali: bitta parametr, tiplar aniq,
   * NULL va bo'sh ro'yxat ham to'g'ri (massiv parametrlarda Prisma bo'sh
   * massivni `integer[]` deb yuborardi).
   */
  writeCtes(plan: StockPlan, meta: StockWriteMeta): Prisma.Sql[] {
    if (plan.movements.length === 0) return []
    const { tenantId } = requireTenantTx()

    // Har (mahsulot, ombor) juftligining YAKUNIY qoldig'i
    const finals = new Map<string, PlannedMovement>()
    for (const m of plan.movements) finals.set(`${m.change.productId}:${m.warehouseId}`, m)

    const stocks = [...finals.values()].map((m) => ({
      product_id: m.change.productId,
      warehouse_id: m.warehouseId,
      qty: milliToDb(m.balanceMilli),
    }))
    const costs = [...plan.costs].map(([id, cost]) => ({ id, cost: String(cost) }))
    const moves = plan.movements.map((m) => ({
      id: m.id,
      product_id: m.change.productId,
      product_name: plan.products.get(m.change.productId)!.name,
      type: m.change.type,
      qty: milliToDb(m.qtyMilli),
      balance_after: milliToDb(m.balanceMilli),
      warehouse_id: m.warehouseId,
      counter_warehouse_id: m.change.counterWarehouseId ?? null,
      note: m.change.note ?? null,
      supplier_id: m.change.supplierId ?? null,
      unit_cost: m.change.unitCost === undefined ? null : String(m.change.unitCost),
      ref_id: m.change.refId ?? null,
    }))

    return [
      Prisma.sql`stock_upsert AS (
        INSERT INTO product_stocks (tenant_id, product_id, warehouse_id, qty)
        SELECT ${tenantId}::uuid, s.product_id, s.warehouse_id, s.qty
          FROM jsonb_to_recordset(${JSON.stringify(stocks)}::jsonb)
            AS s(product_id uuid, warehouse_id uuid, qty numeric)
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET qty = EXCLUDED.qty
        RETURNING 1)`,
      Prisma.sql`cost_update AS (
        -- Tannarx tahrirlanadigan maydon — versiya (If-Match) ham yangilanadi; qoldiq esa yo'q
        UPDATE products p SET cost = c.cost, updated_at = now()
          FROM jsonb_to_recordset(${JSON.stringify(costs)}::jsonb) AS c(id uuid, cost bigint)
         WHERE p.id = c.id AND p.tenant_id = ${tenantId}::uuid
        RETURNING 1)`,
      Prisma.sql`stock_moves AS (
        INSERT INTO stock_movements (id, tenant_id, product_id, product_name, type, qty, balance_after,
                                     warehouse_id, counter_warehouse_id, date, note, supplier_id,
                                     unit_cost, ref_id, user_id)
        SELECT m.id, ${tenantId}::uuid, m.product_id, m.product_name, m.type::"MovementType", m.qty,
               m.balance_after, m.warehouse_id, m.counter_warehouse_id, ${meta.date}::date,
               COALESCE(m.note, ${meta.noteFallback ?? Prisma.sql`NULL`}),
               m.supplier_id, m.unit_cost, m.ref_id, ${meta.userId ?? null}::uuid
          FROM jsonb_to_recordset(${JSON.stringify(moves)}::jsonb)
            AS m(id uuid, product_id uuid, product_name text, type text, qty numeric, balance_after numeric,
                 warehouse_id uuid, counter_warehouse_id uuid, note text, supplier_id uuid,
                 unit_cost bigint, ref_id uuid)
        RETURNING 1)`,
    ]
  }
}

function sum(byWh: Map<string, number>): number {
  let total = 0
  for (const qty of byWh.values()) total += qty
  return total
}

function productStates(
  products: Map<string, LockedProduct>,
  balances: Map<string, Map<string, number>>,
  costs: Map<string, bigint>,
): Map<string, ProductStockState> {
  return new Map(
    [...products.values()].map((p) => {
      const byWh = balances.get(p.id)!
      return [
        p.id,
        {
          id: p.id,
          name: p.name,
          stock: fromMilli(sum(byWh)),
          cost: moneyFromDb(costs.get(p.id) ?? p.cost),
          stocks: Object.fromEntries([...byWh].map(([wh, milli]) => [wh, fromMilli(milli)])),
        },
      ]
    }),
  )
}

function referenceError(field: string, detail: string): DomainError {
  return new DomainError('REFERENCE_NOT_FOUND', detail, [{ field, code: 'REFERENCE_NOT_FOUND' }])
}
