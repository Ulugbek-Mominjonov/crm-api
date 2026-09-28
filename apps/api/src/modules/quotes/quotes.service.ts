import { Injectable } from '@nestjs/common'
import { Prisma, type CustomerGroup, type PriceTier, type QuoteStatus, type Role } from '@prisma/client'
import { dateFromDb, dateToDb, moneyFromDb, qtyFromDb } from '@/common/crud/convert'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { milliToDb, toMilli } from '@/common/quantity'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { CashRegisterService } from '@/modules/cash/cash-register.service'
import { DocNumberService } from '@/modules/doc-numbers/doc-number.service'
import type { SaleDto, SaleItemInputDto } from '@/modules/sales/dto/sale.dto'
import {
  computeTotals, priceLines, resolvePriceTier, type PricedLine, type PricingProduct,
} from '@/modules/sales/sale-totals'
import { SalesService } from '@/modules/sales/sales.service'
import { SettingsService } from '@/modules/settings/settings.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type {
  ConvertQuoteDto, CreateQuoteDto, QuoteDto, QuoteQueryDto, QuoteSummaryDto, UpdateQuoteDto,
} from './dto/quote.dto'

const RESOURCE = 'Taklif'

const QUOTE_SELECT = {
  id: true,
  number: true,
  customerId: true,
  sellerId: true,
  subtotal: true,
  discount: true,
  taxRate: true,
  tax: true,
  total: true,
  status: true,
  date: true,
  validUntil: true,
  note: true,
  saleId: true,
  createdAt: true,
  // Mijoz va sotuvchi nomi — relationJoins bilan shu so'rovning o'zida
  customer: { select: { id: true, name: true, phone: true } },
  seller: { select: { id: true, name: true } },
  items: {
    select: {
      id: true, productId: true, name: true, unit: true, qty: true, baseQty: true, price: true, cost: true, discount: true,
    },
    orderBy: { lineNo: 'asc' },
  },
} satisfies Prisma.QuoteSelect

type QuoteRecord = Prisma.QuoteGetPayload<{ select: typeof QUOTE_SELECT }>

/** Muddati "o'tadigan" holatlar — yakunlangan taklif muddati ahamiyatsiz */
const OPEN_STATUSES: ReadonlySet<QuoteStatus> = new Set<QuoteStatus>(['draft', 'sent', 'accepted'])

/** Narxlangan taklif: sarlavha summalari va qatorlar (ichma-ich yozuv uchun) */
interface PricedQuote {
  header: Pick<Prisma.QuoteUncheckedCreateInput, 'subtotal' | 'discount' | 'taxRate' | 'tax' | 'total'>
  items: Prisma.QuoteItemCreateManyQuoteInput[]
}

interface LockedQuote {
  id: string
  number: string
  status: QuoteStatus
  customerId: string | null
  sellerId: string | null
  discount: bigint
  taxRate: number
  total: bigint
  customerGroup: CustomerGroup | null
}

/**
 * Takliflar (smeta) — T-057, T-058.
 *
 * Summalar sotuv bilan AYNI funksiyalar (`priceLines`, `computeTotals`)
 * bilan hisoblanadi: aylantirilganda chek taklifdagi summaning o'zini
 * beradi (farq bo'lsa — `TOTAL_MISMATCH`, pul noto'g'ri yozilmaydi).
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: DocNumberService,
    private readonly settings: SettingsService,
    private readonly register: CashRegisterService,
    private readonly sales: SalesService,
    private readonly audit: AuditService,
  ) {}

  /** Ro'yxat — qatorlari bilan (relationJoins) + soni: 2 so'rov */
  async list(query: QuoteQueryDto): Promise<Paged<QuoteDto>> {
    const today = businessDate()
    const where: Prisma.QuoteWhereInput = {
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.customerId && { customerId: query.customerId }),
      ...((query.dateFrom || query.dateTo) && {
        date: {
          ...(query.dateFrom && { gte: dateToDb(query.dateFrom) }),
          ...(query.dateTo && { lte: dateToDb(query.dateTo) }),
        },
      }),
      // `expired` bilan bir xil ta'rif: ochiq holat va muddat o'tgan
      ...(query.expired && {
        AND: [{ status: { in: [...OPEN_STATUSES] } }, { validUntil: { lt: dateToDb(today) } }],
      }),
      ...(query.q && {
        OR: [
          { number: { contains: query.q, mode: 'insensitive' } },
          { customer: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    }
    const [rows, total] = await Promise.all([
      this.prisma.scoped.quote.findMany({
        where,
        select: QUOTE_SELECT,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.scoped.quote.count({ where }),
    ])
    return toPaged(rows.map((row) => toQuoteDto(row, today)), total, query)
  }

  /** Sahifa kartalari — BITTA agregat (`(tenant_id, status)` indeksi) */
  async summary(): Promise<QuoteSummaryDto> {
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<{ total: Prisma.Decimal; accepted: Prisma.Decimal; pending: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(total), 0) AS total,
             COALESCE(SUM(total) FILTER (WHERE status = 'accepted'), 0) AS accepted,
             COALESCE(SUM(total) FILTER (WHERE status = 'sent'), 0) AS pending
        FROM quotes
       WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL`
    return { total: row!.total.toNumber(), accepted: row!.accepted.toNumber(), pending: row!.pending.toNumber() }
  }

  async get(id: string): Promise<QuoteDto> {
    const quote = await this.prisma.scoped.quote.findFirst({ where: { id, deletedAt: null }, select: QUOTE_SELECT })
    if (!quote) throw new NotFoundError(RESOURCE, id)
    return toQuoteDto(quote, businessDate())
  }

  async create(dto: CreateQuoteDto, user: Pick<AuthContext, 'employeeId' | 'role'>): Promise<QuoteDto> {
    const { tenantId } = requireTenantTx()
    const priced = await this.price(dto.items, dto.discount ?? 0, dto.priceTier, dto.customerId, user.role)
    const number = await this.numbers.next('TKLF')
    const quote = await this.prisma.scoped.quote
      .create({
        data: {
          tenantId,
          number,
          customerId: dto.customerId ?? null,
          sellerId: dto.sellerId ?? user.employeeId,
          ...priced.header,
          date: dateToDb(businessDate()),
          validUntil: dto.validUntil ? dateToDb(dto.validUntil) : null,
          note: dto.note ?? null,
          items: { createMany: { data: priced.items } },
        },
        select: QUOTE_SELECT,
      })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE }))
    await this.audit.log({
      action: 'quote.create',
      entityType: 'quote',
      entityId: quote.id,
      diff: { number, total: moneyFromDb(quote.total), customerId: quote.customerId },
    })
    return toQuoteDto(quote, businessDate())
  }

  /**
   * Tahrirlash: qatorlar berilsa — to'liq almashtiriladi va qayta
   * narxlanadi. Aylantirilgan taklif o'zgarmaydi (I20).
   */
  async update(id: string, dto: UpdateQuoteDto, role: Role): Promise<QuoteDto> {
    const current = await this.lockQuote(id)
    assertNotConverted(current)

    const reprice = dto.items !== undefined || dto.discount !== undefined || dto.priceTier !== undefined
      || (dto.customerId !== undefined && dto.customerId !== current.customerId)
    const priced = reprice
      ? await this.price(
          dto.items ?? (await this.currentLines(id)),
          dto.discount ?? moneyFromDb(current.discount),
          dto.priceTier,
          dto.customerId ?? current.customerId ?? undefined,
          role,
        )
      : undefined

    const tx = this.prisma.scoped
    if (priced) await tx.quoteItem.deleteMany({ where: { quoteId: id } })
    const quote = await tx.quote
      .update({
        where: { id },
        data: {
          ...(dto.customerId !== undefined && { customerId: dto.customerId }),
          ...(dto.sellerId !== undefined && { sellerId: dto.sellerId }),
          ...(dto.validUntil !== undefined && { validUntil: dateToDb(dto.validUntil) }),
          ...(dto.note !== undefined && { note: dto.note }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(priced && { ...priced.header, items: { createMany: { data: priced.items } } }),
        },
        select: QUOTE_SELECT,
      })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE, id }))
    await this.audit.log({
      action: 'quote.update',
      entityType: 'quote',
      entityId: id,
      diff: { status: dto.status ?? null, repriced: !!priced, total: moneyFromDb(quote.total) },
    })
    return toQuoteDto(quote, businessDate())
  }

  /** Yumshoq o'chirish; aylantirilgan taklif chekka bog'langan — o'chirilmaydi */
  async remove(id: string): Promise<void> {
    const current = await this.lockQuote(id)
    assertNotConverted(current)
    await this.prisma.scoped.quote.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log({ action: 'quote.delete', entityType: 'quote', entityId: id, diff: { number: current.number } })
  }

  /** O'chirishni qaytarish (undo) — taklif avvalgi holatida tiklanadi */
  async restore(id: string): Promise<QuoteDto> {
    const { count } = await this.prisma.scoped.quote.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
    })
    if (count === 0) throw new NotFoundError(RESOURCE, id)
    const quote = await this.get(id)
    await this.audit.log({ action: 'quote.restore', entityType: 'quote', entityId: id, diff: { number: quote.number } })
    return quote
  }

  /**
   * Taklif → chek (T-058, I20): qoldiq tekshiriladi (yetmasa
   * `QUOTE_STOCK_SHORT`), bir marta aylantiriladi, to'lov usuli
   * chaqiruvchidan — avtomatik "naqd to'landi" emas. Nasiyada mijoz shart,
   * narx darajasi mijoz guruhidan. Chek va taklif holati — bitta so'rovda.
   */
  async convert(id: string, dto: ConvertQuoteDto): Promise<SaleDto> {
    const { tenantId } = requireTenantTx()
    // Qulf tartibi: registr → taklif → mahsulotlar (sotuv bilan bir xil)
    const register = await this.register.lock()
    const quote = await this.lockQuote(id)
    assertNotConverted(quote)

    const [settings, lines] = await Promise.all([this.settings.get(), this.currentLines(id)])
    const total = moneyFromDb(quote.total)
    const paid = { cash: 0, card: 0, transfer: 0 }
    if (dto.method !== 'debt') paid[dto.method] = total

    const sale = await this.sales
      .place(
        {
          customerId: quote.customerId ?? undefined,
          sellerId: quote.sellerId ?? undefined,
          warehouseId: dto.warehouseId,
          priceTier: tierOf(quote.customerGroup),
          lines,
          discount: moneyFromDb(quote.discount),
          bonusRequested: 0,
          roundTo: 0,
          paid,
          date: businessDate(),
          taxRate: quote.taxRate,
          // Chegirma taklif yaratilganda tekshirilgan — qayta cheklanmaydi
          maxDiscountPct: 100,
          loyalty: settings,
          clientTotal: total,
          link: (saleId) => [
            Prisma.sql`quote_link AS (
              UPDATE quotes SET status = 'converted', sale_id = ${saleId}::uuid
               WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
              RETURNING 1)`,
          ],
        },
        register,
      )
      .catch((err: unknown) => {
        if (err instanceof DomainError && err.code === 'STOCK_INSUFFICIENT') {
          throw new DomainError(
            'QUOTE_STOCK_SHORT',
            err.detail,
            err.errors?.map((e) => ({ ...e, code: 'QUOTE_STOCK_SHORT' })),
          )
        }
        throw err
      })

    await this.audit.log({
      action: 'quote.convert',
      entityType: 'quote',
      entityId: id,
      diff: { number: quote.number, sale: sale.number, method: dto.method },
    })
    return sale
  }

  /**
   * Qatorlarni narxlaydi (sotuv bilan bir xil qoidalar). Mahsulotlar
   * qulflanmaydi — taklif qoldiqqa tegmaydi; narx va tannarx snapshot.
   */
  private async price(
    items: readonly SaleItemInputDto[],
    discount: number,
    priceTier: PriceTier | undefined,
    customerId: string | undefined,
    role: Role,
  ): Promise<PricedQuote> {
    const tx = this.prisma.scoped
    const { tenantId } = requireTenantTx()
    const [settings, customer, products] = await Promise.all([
      this.settings.get(),
      customerId
        ? tx.client.findFirst({ where: { id: customerId, deletedAt: null }, select: { group: true } })
        : Promise.resolve(null),
      tx.product.findMany({
        where: { id: { in: [...new Set(items.map((i) => i.productId))] }, deletedAt: null },
        select: {
          id: true, name: true, unit: true, altUnit: true, altFactor: true,
          price: true, wholesalePrice: true, cost: true, archived: true,
        },
      }),
    ])
    if (customerId && !customer) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'Mijoz topilmadi', [{ field: 'customerId', code: 'REFERENCE_NOT_FOUND' }])
    }
    const pricing = new Map(
      products.map((p): [string, PricingProduct] => [
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
    const tier = resolvePriceTier(priceTier, tierOf(customer?.group ?? null), settings, role)
    const lines = priceLines(items, pricing, tier)
    const taxRate = settings.taxEnabled ? settings.taxRate : 0
    const totals = computeTotals(lines, { discount, taxRate, maxDiscountPct: settings.maxDiscountPct })
    return {
      header: {
        subtotal: BigInt(totals.subtotal),
        discount: BigInt(totals.discount),
        taxRate,
        tax: BigInt(totals.tax),
        total: BigInt(totals.total),
      },
      // Kengaytma ichma-ich yozuvga `tenantId` qo'ymaydi — aniq beriladi
      items: lines.map((line, i) => itemData(tenantId, line, i)),
    }
  }

  /** Taklif qatorlari — aylantirish va qayta narxlash uchun (taklifdagi narx bilan) */
  private async currentLines(quoteId: string): Promise<SaleItemInputDto[]> {
    const items = await this.prisma.scoped.quoteItem.findMany({
      where: { quoteId },
      select: { productId: true, unit: true, qty: true, price: true, discount: true },
      orderBy: { lineNo: 'asc' },
    })
    return items.map((item) => ({
      productId: item.productId,
      unit: item.unit,
      qty: qtyFromDb(item.qty),
      price: moneyFromDb(item.price),
      discount: moneyFromDb(item.discount),
    }))
  }

  /** Taklif qatori qulfi (tahrir va aylantirish poygasi yo'q). Boshqa tenantniki — 404 */
  private async lockQuote(id: string): Promise<LockedQuote> {
    const { tenantId } = requireTenantTx()
    const [quote] = await this.prisma.scoped.$queryRaw<LockedQuote[]>`
      SELECT q.id, q.number, q.status, q.customer_id AS "customerId", q.seller_id AS "sellerId",
             q.discount, q.tax_rate AS "taxRate", q.total, c."group" AS "customerGroup"
        FROM quotes q
        LEFT JOIN clients c ON c.tenant_id = q.tenant_id AND c.id = q.customer_id
       WHERE q.tenant_id = ${tenantId}::uuid AND q.id = ${id}::uuid AND q.deleted_at IS NULL
         FOR UPDATE OF q`
    if (!quote) throw new NotFoundError(RESOURCE, id)
    return quote
  }
}

/** Narx darajasi mijoz guruhidan: chakana bo'lmagan guruh — ulgurji */
function tierOf(group: CustomerGroup | null): PriceTier {
  return group && group !== 'retail' ? 'wholesale' : 'retail'
}

function assertNotConverted(quote: { number: string; status: QuoteStatus }): void {
  if (quote.status === 'converted') {
    throw new DomainError('QUOTE_ALREADY_CONVERTED', `${quote.number} allaqachon chekka aylantirilgan`)
  }
}

function itemData(tenantId: string, line: PricedLine, i: number): Prisma.QuoteItemCreateManyQuoteInput {
  return {
    tenantId,
    productId: line.productId,
    name: line.name,
    unit: line.unit,
    qty: milliToDb(toMilli(line.qty)),
    baseQty: milliToDb(toMilli(line.baseQty)),
    price: BigInt(line.price),
    cost: BigInt(line.cost),
    discount: BigInt(line.discount),
    lineNo: i + 1,
  }
}

function toQuoteDto(q: QuoteRecord, today: string): QuoteDto {
  const validUntil = q.validUntil ? dateFromDb(q.validUntil) : null
  return {
    id: q.id,
    number: q.number,
    customerId: q.customerId,
    sellerId: q.sellerId,
    customer: q.customer,
    seller: q.seller,
    subtotal: moneyFromDb(q.subtotal),
    discount: moneyFromDb(q.discount),
    taxRate: q.taxRate,
    tax: moneyFromDb(q.tax),
    total: moneyFromDb(q.total),
    status: q.status,
    date: dateFromDb(q.date),
    validUntil,
    expired: validUntil !== null && validUntil < today && OPEN_STATUSES.has(q.status),
    note: q.note,
    saleId: q.saleId,
    createdAt: q.createdAt,
    items: q.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      unit: item.unit,
      qty: qtyFromDb(item.qty),
      baseQty: qtyFromDb(item.baseQty),
      price: moneyFromDb(item.price),
      cost: moneyFromDb(item.cost),
      discount: moneyFromDb(item.discount),
    })),
  }
}
