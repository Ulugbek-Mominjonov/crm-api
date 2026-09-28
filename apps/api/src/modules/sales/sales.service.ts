import { Injectable, Logger } from '@nestjs/common'
import { Prisma, type PriceTier, type ProductUnit, type SaleStatus, type SaleType } from '@prisma/client'
import { bonusEarned, dueDateFor, type RoundStep } from '@crm/shared'
import { currentContext } from '@/common/context/request-context'
import { moneyFromDb, qtyFromDb } from '@/common/crud/convert'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { lockProducts, type LockedProduct } from '@/common/db/lock'
import { withCtes } from '@/common/db/sql'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { CashRegisterService, type RegisterState } from '@/modules/cash/cash-register.service'
import { assertCreditAllowed, CreditService } from '@/modules/credit/credit.service'
import { DocNumberService, type DocPrefix } from '@/modules/doc-numbers/doc-number.service'
import { FiscalService } from '@/modules/fiscal/fiscal.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { SettingsService } from '@/modules/settings/settings.service'
import { StockService, type StockChange, type StockPlan } from '@/modules/stock/stock.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type { CreateSaleDto, DeliveryInputDto, ReturnSaleDto, SaleDto } from './dto/sale.dto'
import {
  computeTotals, priceLines, refundFor, resolvePriceTier, returnLines, settle,
  type LineInput, type PaidInput, type PricingProduct, type SoldLine,
} from './sale-totals'
import {
  bonusCtes, debtPaidCtes, deliveryCtes, DOC_NUMBER, insertSaleCtes,
  type DeliveryRow, type SaleItemRow, type SaleRow,
} from './sale.sql'
import { SalesQueriesService } from './sales-queries.service'
import { writtenSaleDto } from './sale-view'

const RESOURCE = 'Chek'

/** Sotuv buyurtmasi — `POST /sales` va taklifni aylantirish (T-058) uchun umumiy */
export interface SaleOrder {
  customerId?: string
  sellerId?: string
  warehouseId?: string
  priceTier: PriceTier
  lines: LineInput[]
  discount: number
  bonusRequested: number
  roundTo: RoundStep
  delivery?: DeliveryInputDto
  paid: PaidInput
  date: string
  taxRate: number
  maxDiscountPct: number
  loyalty: { loyaltyEnabled: boolean; loyaltyRate: number }
  /** Mijoz ko'rsatgan jami — faqat solishtiriladi (04 §4.5) */
  clientTotal?: number
  /** Chek bilan BIR so'rovda yoziladigan bog'liq o'zgarish (taklif → `converted`) */
  link?: (saleId: string) => Prisma.Sql[]
}

/** Qulflangan chek — qaytarish va bekor qilish uchun */
interface LockedSale {
  id: string
  number: string
  type: SaleType
  status: SaleStatus
  customerId: string | null
  warehouseId: string | null
  priceTier: PriceTier
  subtotal: bigint
  discount: bigint
  taxRate: number
  paidCash: bigint
  debtPaid: bigint
  outstanding: bigint
  bonusUsed: bigint
  bonusEarned: bigint
  relatedSaleId: string | null
}

interface SoldLineRow {
  id: string
  productId: string
  name: string
  unit: ProductUnit
  qty: Prisma.Decimal
  baseQty: Prisma.Decimal
  price: bigint
  cost: bigint
  discount: bigint
  returnedQty: Prisma.Decimal
  returnedBefore: bigint
}

/**
 * Sotuv yadrosi (E6): chek, qaytarish, bekor qilish.
 *
 * Har amal — bitta tranzaksiya (so'rovniki), qulf tartibi: kassa registri
 * (smena, mijoz balansi) → chek qatori → mahsulotlar (id tartibida) →
 * hisoblagich. Yozuvlar (chek, qatorlar, ombor, kassa, bonus, yetkazish)
 * BITTA so'rovda — `POST /sales` so'rovlari soni qatorlarga bog'liq emas.
 */
@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly register: CashRegisterService,
    private readonly stock: StockService,
    private readonly numbers: DocNumberService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly queries: SalesQueriesService,
    private readonly credit: CreditService,
    private readonly events: DomainEvents,
    private readonly fiscal: FiscalService,
  ) {}

  /**
   * `POST /sales` — narx darajasi (sotuvchiga ulgurji — sozlama bilan), QQS,
   * bonus va chegirma chegarasi sozlamadan
   */
  async create(dto: CreateSaleDto, user: Pick<AuthContext, 'employeeId' | 'role'>): Promise<SaleDto> {
    const settings = await this.settings.get()
    return this.place({
      customerId: dto.customerId,
      sellerId: dto.sellerId ?? user.employeeId,
      warehouseId: dto.warehouseId,
      priceTier: resolvePriceTier(dto.priceTier, 'retail', settings, user.role),
      lines: dto.items,
      discount: dto.discount ?? 0,
      bonusRequested: settings.loyaltyEnabled ? (dto.bonusUsed ?? 0) : 0,
      roundTo: dto.roundTo ?? 0,
      delivery: dto.delivery,
      paid: dto.paid,
      date: saleDate(dto.date),
      taxRate: settings.taxEnabled ? settings.taxRate : 0,
      maxDiscountPct: settings.maxDiscountPct,
      loyalty: settings,
      clientTotal: dto.total,
    })
  }

  /**
   * Chek yaratish (04-api §4, tekshiruvlar tartibi bilan):
   * smena (I8) → mahsulotlar → qoldiq (I3, qulf bilan) → summalar (I5) →
   * chegirma chegarasi → nasiya (I15, I16) → raqam (I12) → bitta yozuv.
   *
   * `lockedRegister` — chaqiruvchi registrni o'zi qulflagan bo'lsa (taklifni
   * aylantirish: registr → taklif qatori → mahsulotlar tartibi).
   */
  async place(order: SaleOrder, lockedRegister?: RegisterState): Promise<SaleDto> {
    const tx = this.prisma.scoped
    const { tenantId } = requireTenantTx()

    // 1. Kassa registri: smena (I8). Shundan keyingi o'qishlar yangi suratda
    const register = lockedRegister ?? (await this.register.lock())
    const shiftId = this.register.requireOpenShift(register)
    // 2. Mijozning ball va nasiya holati
    const customer = order.customerId ? await this.credit.position(order.customerId) : undefined

    // 3. Mahsulotlar — qulf (id tartibida), narx, birlik (I23)
    const locked = await lockProducts(tx, order.lines.map((line) => line.productId))
    const lines = priceLines(order.lines, pricingProducts(locked), order.priceTier)

    // 4. Qoldiq AYNAN tanlangan omborda (I3) — qulf ostida
    const saleId = uuidv7()
    const plan = await this.stock.prepare(
      lines.map((line, i): StockChange => ({
        productId: line.productId,
        warehouseId: order.warehouseId,
        type: 'sale',
        qty: -line.baseQty,
        refId: saleId,
        field: `items[${i}].qty`,
      })),
      locked,
    )

    // 5. Summalar (shared) va chegirma chegarasi
    const totals = computeTotals(lines, {
      discount: order.discount,
      taxRate: order.taxRate,
      maxDiscountPct: order.maxDiscountPct,
      bonusRequested: order.bonusRequested,
      bonusAvailable: customer?.bonusPoints ?? 0,
      roundTo: order.roundTo,
      deliveryFee: order.delivery?.fee ?? 0,
    })
    this.assertClientTotal(order.clientTotal, totals.total)
    const payment = settle(totals.total, order.paid)

    // 6. Nasiya: mijoz shart (I15), muddati o'tgan qarz va limit (I16)
    assertCreditAllowed(customer, payment.outstanding)

    const earned = customer ? bonusEarned(totals.total, order.loyalty) : 0
    const row: SaleRow = {
      id: saleId,
      type: 'sale',
      customerId: order.customerId ?? null,
      sellerId: order.sellerId ?? null,
      warehouseId: plan.movements[0]!.warehouseId,
      priceTier: order.priceTier,
      subtotal: totals.subtotal,
      discount: totals.discount + totals.bonusUsed,
      taxRate: order.taxRate,
      tax: totals.tax,
      deliveryFee: totals.deliveryFee,
      total: totals.total,
      paidCash: payment.cash,
      paidCard: payment.card,
      paidTransfer: payment.transfer,
      debtPaid: 0,
      change: payment.change,
      bonusUsed: totals.bonusUsed,
      bonusEarned: earned,
      status: payment.outstanding > 0 ? 'pending' : 'completed',
      date: order.date,
      dueDate: payment.outstanding > 0 ? (dueDateFor(customer, order.date) ?? null) : null,
      relatedSaleId: null,
      shiftId,
    }
    const items = lines.map((line, i): SaleItemRow => ({ ...line, id: uuidv7(), lineNo: i + 1, returnOfId: null }))
    const delivery = order.delivery ? deliveryRow(order.delivery, order.date) : null

    // 7–8. Raqam (I12), chek, qatorlar, ombor, kassa, bonus (I17), yetkazish — BITTA so'rov
    const written = await this.write('CHEK', plan, row, items, [
      ...this.register.cashCtes(shiftId, BigInt(payment.cash)),
      ...bonusCtes(tenantId, row.customerId, earned - totals.bonusUsed),
      ...deliveryCtes(tenantId, saleId, row.customerId, delivery),
      ...(order.link?.(saleId) ?? []),
    ])

    await this.audit.log({
      action: 'sale.create',
      entityType: 'sale',
      entityId: saleId,
      diff: {
        number: written.number,
        total: row.total,
        paid: { cash: row.paidCash, card: row.paidCard, transfer: row.paidTransfer },
        outstanding: payment.outstanding,
        customerId: row.customerId,
        warehouseId: row.warehouseId,
      },
    })
    this.announce(saleId, plan)
    return writtenSaleDto(row, items, { ...written, deliveryId: delivery?.id ?? null })
  }

  /**
   * Qaytarish (T-054): QQS asl chek foizi bo'yicha (I6), miqdor asl chekdan
   * oshmaydi, ombor qoldig'i bilan cheklanmaydi (I7), tovar asl omborga
   * qaytadi. Pul avval shu chekning qolgan qarzidan hisoblanadi, qolgani
   * naqd kassadan qaytariladi.
   */
  async returnSale(id: string, dto: ReturnSaleDto, defaultSellerId: string): Promise<SaleDto> {
    const { tenantId } = requireTenantTx()
    assertUnique(dto.items.map((item) => item.saleItemId), 'items')

    const register = await this.register.lock()
    const original = await this.lockSale(id)
    if (original.status === 'cancelled') {
      throw new DomainError('SALE_ALREADY_CANCELLED', `${original.number} bekor qilingan — qaytarib bo‘lmaydi`)
    }
    if (original.type !== 'sale') {
      throw new DomainError('SALE_NOT_RETURNABLE', `${original.number} — qaytarish hujjati`)
    }
    // I8: qaytarish ham kassa amali — ochiq smena shart
    const shiftId = this.register.requireOpenShift(register)

    const { sold, returnedBefore } = await this.soldLines(id)
    const lines = returnLines(sold, dto.items)
    const refund = refundFor(
      {
        subtotal: moneyFromDb(original.subtotal),
        discount: moneyFromDb(original.discount),
        bonusUsed: moneyFromDb(original.bonusUsed),
        bonusEarned: moneyFromDb(original.bonusEarned),
        taxRate: original.taxRate,
      },
      lines.reduce((sum, line) => sum + line.total, 0),
      returnedBefore,
    )
    // Nasiya chek: qaytgan tovar avval QARZNI yopadi — to'lanmagan tovar uchun pul berilmaydi
    const offset = Math.min(moneyFromDb(original.outstanding), refund.total)
    const cash = refund.total - offset

    const returnId = uuidv7()
    const plan = await this.stock.prepare(
      lines.map((line, i): StockChange => ({
        productId: line.productId,
        warehouseId: original.warehouseId ?? undefined,
        type: 'return',
        qty: line.baseQty,
        refId: returnId,
        field: `items[${i}].saleItemId`,
      })),
    )

    const date = businessDate()
    const row: SaleRow = {
      id: returnId,
      type: 'return',
      customerId: original.customerId,
      sellerId: defaultSellerId,
      warehouseId: plan.movements[0]!.warehouseId,
      priceTier: original.priceTier,
      subtotal: refund.subtotal,
      discount: refund.discount,
      taxRate: refund.taxRate,
      tax: refund.tax,
      deliveryFee: 0,
      total: refund.total,
      paidCash: cash,
      paidCard: 0,
      paidTransfer: 0,
      debtPaid: offset,
      change: 0,
      bonusUsed: refund.bonusRestored,
      bonusEarned: refund.bonusRevoked,
      status: 'completed',
      date,
      dueDate: null,
      relatedSaleId: original.id,
      shiftId,
    }
    const items = lines.map((line, i): SaleItemRow => ({ ...line, id: uuidv7(), lineNo: i + 1 }))

    const written = await this.write('QAYT', plan, row, items, [
      ...this.register.cashCtes(shiftId, -BigInt(cash)),
      ...bonusCtes(tenantId, original.customerId, refund.bonusRestored - refund.bonusRevoked),
      ...debtPaidCtes(tenantId, original.id, offset),
    ])

    await this.audit.log({
      action: 'sale.return',
      entityType: 'sale',
      entityId: original.id,
      detail: dto.reason,
      diff: { number: written.number, sale: original.number, total: refund.total, cash, debtOffset: offset },
    })
    this.announce(returnId, plan)
    return writtenSaleDto(row, items, { ...written, deliveryId: null })
  }

  /**
   * Bekor qilish (T-055): tovar AYNAN sotilgan omborga qaytadi (I24), naqd
   * kassadan qaytariladi, bonus qaytarib olinadi (I17). Qaytarish hujjatini
   * bekor qilish uning ta'sirini teskari qiladi.
   */
  async cancel(id: string): Promise<SaleDto> {
    const { tenantId } = requireTenantTx()
    const register = await this.register.lock()
    const sale = await this.lockSale(id)
    if (sale.status === 'cancelled') {
      throw new DomainError('SALE_ALREADY_CANCELLED', `${sale.number} allaqachon bekor qilingan`)
    }
    if (sale.type === 'sale') await this.assertCancellable(sale)

    const isSale = sale.type === 'sale'
    const items = await this.prisma.scoped.saleItem.findMany({
      where: { saleId: id },
      select: { productId: true, baseQty: true },
      orderBy: { lineNo: 'asc' },
    })
    const plan = await this.stock.prepare(
      items.map((item, i): StockChange => ({
        productId: item.productId,
        warehouseId: sale.warehouseId ?? undefined,
        type: 'adjustment',
        // Sotuv bekor — tovar omborga qaytadi; qaytarish bekor — yana chiqadi
        qty: isSale ? qtyFromDb(item.baseQty) : -qtyFromDb(item.baseQty),
        refId: sale.id,
        note: `Bekor qilindi (${sale.number})`,
        field: `items[${i}]`,
      })),
    )

    const cashDelta = isSale ? -sale.paidCash : sale.paidCash
    const cash = cashDelta === 0n ? [] : this.register.cashCtes(this.register.requireOpenShift(register), cashDelta)
    const bonusUsed = moneyFromDb(sale.bonusUsed)
    const earned = moneyFromDb(sale.bonusEarned)

    await this.prisma.scoped
      .$executeRaw(
        withCtes(
          [
            Prisma.sql`cancelled AS (
              UPDATE sales SET status = 'cancelled', cancelled_at = now()
               WHERE tenant_id = ${tenantId}::uuid AND id = ${sale.id}::uuid
              RETURNING 1)`,
            ...this.stock.writeCtes(plan, { date: businessDate(), userId: currentContext().userId }),
            ...cash,
            ...bonusCtes(tenantId, sale.customerId, isSale ? bonusUsed - earned : earned - bonusUsed),
            ...(isSale ? [] : debtPaidCtes(tenantId, sale.relatedSaleId!, -moneyFromDb(sale.debtPaid))),
            Prisma.sql`delivery_cancel AS (
              UPDATE deliveries SET status = 'cancelled'
               WHERE tenant_id = ${tenantId}::uuid AND sale_id = ${sale.id}::uuid
                 AND status IN ('pending', 'on_way')
              RETURNING 1)`,
          ],
          Prisma.sql`SELECT 1`,
        ),
      )
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE, id }))

    await this.audit.log({
      action: 'sale.cancel',
      entityType: 'sale',
      entityId: sale.id,
      diff: { number: sale.number, type: sale.type, cash: moneyFromDb(-cashDelta) },
    })
    this.events.publish('sale.cancelled', { saleId: sale.id })
    return this.queries.get(id)
  }

  /** Yangi chek (sotuv yoki qaytarish) — ikkinchi kassa katalog va qoldiqni yangilaydi */
  private announce(saleId: string, plan: StockPlan): void {
    this.events.publish('sale.created', {
      saleId,
      warehouseId: plan.movements[0]!.warehouseId,
      productIds: [...new Set(plan.movements.map((m) => m.change.productId))],
    })
  }

  /**
   * Hujjatni yozadi: raqam (I12) + chek + qatorlar + ombor + qo'shimcha
   * CTE'lar + fiskal navbat (OFD yoqilgan bo'lsa) — BITTA so'rov.
   * Hisoblagich qulfi eng oxirida olinadi.
   */
  private async write(
    prefix: DocPrefix,
    plan: StockPlan,
    row: SaleRow,
    items: SaleItemRow[],
    extra: Prisma.Sql[],
  ): Promise<{ number: string; createdAt: Date }> {
    const { tenantId } = requireTenantTx()
    const ctes = [
      this.numbers.cte(prefix),
      ...insertSaleCtes(tenantId, row, items),
      ...this.stock.writeCtes(plan, { date: row.date, userId: currentContext().userId, noteFallback: DOC_NUMBER }),
      ...extra,
      ...this.fiscal.outbox(tenantId, row.id),
    ]
    const [written] = await this.prisma.scoped
      .$queryRaw<{ number: string; createdAt: Date }[]>(
        withCtes(ctes, Prisma.sql`SELECT d.number, s.created_at AS "createdAt" FROM doc d, sale_row s`),
      )
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE }))
    return written!
  }

  /** 04 §4.5: farq xato emas, lekin kuzatiladi — bu yerda mijoz ko'rsatgan summa bilan sotilmasin */
  private assertClientTotal(client: number | undefined, server: number): void {
    if (client === undefined || client === server) return
    this.logger.warn('Frontend/server summa farqi', { client, server })
    throw new DomainError('TOTAL_MISMATCH', `Chek summasi ${server} so‘m (ekranda ${client}) — qayta hisoblang`, [
      { field: 'total', code: 'TOTAL_MISMATCH', meta: { client, server } },
    ])
  }

  /** Chek qatori qulfi (registrdan keyin). Boshqa tenant cheki — 404 */
  private async lockSale(id: string): Promise<LockedSale> {
    const { tenantId } = requireTenantTx()
    const [sale] = await this.prisma.scoped.$queryRaw<LockedSale[]>`
      SELECT id, number, type, status, customer_id AS "customerId", warehouse_id AS "warehouseId",
             price_tier AS "priceTier", subtotal, discount, tax_rate AS "taxRate", paid_cash AS "paidCash",
             debt_paid AS "debtPaid", outstanding, bonus_used AS "bonusUsed", bonus_earned AS "bonusEarned",
             related_sale_id AS "relatedSaleId"
        FROM sales
       WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND deleted_at IS NULL
         FOR UPDATE`
    if (!sale) throw new NotFoundError(RESOURCE, id)
    return sale
  }

  /**
   * Asl chek qatorlari va ular bo'yicha oldingi (bekor qilinmagan)
   * qaytarishlar — bitta so'rov (`sales (tenant_id, related_sale_id)`).
   */
  private async soldLines(saleId: string): Promise<{ sold: Map<string, SoldLine>; returnedBefore: number }> {
    const { tenantId } = requireTenantTx()
    const rows = await this.prisma.scoped.$queryRaw<SoldLineRow[]>`
      WITH returns AS (
        SELECT r.id, r.subtotal FROM sales r
         WHERE r.tenant_id = ${tenantId}::uuid AND r.related_sale_id = ${saleId}::uuid
           AND r.type = 'return' AND r.status <> 'cancelled'
      ), returned AS (
        SELECT ri.return_of_id AS id, SUM(ri.qty) AS qty
          FROM returns r JOIN sale_items ri ON ri.tenant_id = ${tenantId}::uuid AND ri.sale_id = r.id
         GROUP BY ri.return_of_id
      )
      SELECT si.id, si.product_id AS "productId", si.name, si.unit, si.qty, si.base_qty AS "baseQty",
             si.price, si.cost, si.discount, COALESCE(returned.qty, 0) AS "returnedQty",
             (SELECT COALESCE(SUM(subtotal), 0) FROM returns)::bigint AS "returnedBefore"
        FROM sale_items si
        LEFT JOIN returned ON returned.id = si.id
       WHERE si.tenant_id = ${tenantId}::uuid AND si.sale_id = ${saleId}::uuid
       ORDER BY si.line_no`
    const sold = new Map(
      rows.map((r): [string, SoldLine] => [
        r.id,
        {
          id: r.id,
          productId: r.productId,
          name: r.name,
          unit: r.unit,
          qty: qtyFromDb(r.qty),
          baseQty: qtyFromDb(r.baseQty),
          price: moneyFromDb(r.price),
          cost: moneyFromDb(r.cost),
          discount: moneyFromDb(r.discount),
          returnedQty: qtyFromDb(r.returnedQty),
        },
      ]),
    )
    return { sold, returnedBefore: rows.length > 0 ? moneyFromDb(rows[0]!.returnedBefore) : 0 }
  }

  /**
   * Qaytarishi yoki qarz to'lovi bor chek bekor qilinmaydi: tovar va pul
   * ikki marta qaytib ketardi. Avval qaytarish bekor qilinadi.
   */
  private async assertCancellable(sale: LockedSale): Promise<void> {
    const returns = await this.prisma.scoped.sale.count({
      where: { relatedSaleId: sale.id, type: 'return', status: { not: 'cancelled' } },
    })
    if (returns > 0) {
      throw new DomainError('SALE_NOT_CANCELLABLE', `${sale.number} bo‘yicha qaytarish bor — avval uni bekor qiling`, [
        { code: 'SALE_NOT_CANCELLABLE', meta: { reason: 'returns', returns } },
      ])
    }
    if (sale.debtPaid > 0n) {
      throw new DomainError('SALE_NOT_CANCELLABLE', `${sale.number} bo‘yicha qarz to‘langan — bekor qilib bo‘lmaydi`, [
        { code: 'SALE_NOT_CANCELLABLE', meta: { reason: 'payments', debtPaid: moneyFromDb(sale.debtPaid) } },
      ])
    }
  }
}

/** Hujjat sanasi: berilmasa — bugun; kelajak sana — xato */
function saleDate(date?: string): string {
  const today = businessDate()
  if (!date) return today
  if (date > today) {
    throw new DomainError('VALIDATION_FAILED', 'Chek sanasi kelajakda bo‘lmaydi', [{ field: 'date', code: 'VALIDATION_FAILED' }])
  }
  return date
}

function assertUnique(ids: string[], field: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new DomainError('VALIDATION_FAILED', 'Bir qator bir marta bo‘ladi', [{ field, code: 'VALIDATION_FAILED' }])
  }
}

/** Qulflangan mahsulot → narxlash ko'rinishi (so'm, qo'shimcha birlik) */
function pricingProducts(locked: Map<string, LockedProduct>): Map<string, PricingProduct> {
  return new Map(
    [...locked.values()].map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        unit: p.unit,
        altUnit: p.altUnit ?? undefined,
        altFactor: p.altFactor ? p.altFactor.toNumber() : undefined,
        price: moneyFromDb(p.price),
        wholesalePrice: moneyFromDb(p.wholesalePrice),
        cost: moneyFromDb(p.cost),
        archived: p.archived,
      },
    ]),
  )
}

function deliveryRow(input: DeliveryInputDto, date: string): DeliveryRow {
  return {
    id: uuidv7(),
    address: input.address,
    phone: input.phone,
    scheduledDate: input.scheduledDate ?? date,
    note: input.note ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
  }
}
