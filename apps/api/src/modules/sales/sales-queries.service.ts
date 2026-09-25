import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { dateFromDb, dateToDb, moneyFromDb } from '@/common/crud/convert'
import { decodeCursor, keysetWhere, toCursorPage, type CursorPage } from '@/common/crud/paging'
import { NotFoundError } from '@/common/errors/domain.error'
import { SettingsService } from '@/modules/settings/settings.service'
import { PrismaService } from '@/prisma/prisma.service'
import type { PaymentFilter, ReceiptDto, SaleDto, SaleListItemDto, SaleQueryDto } from './dto/sale.dto'
import { SALE_SELECT, toSaleDto } from './sale-view'

const RESOURCE = 'Chek'

const LIST_SELECT = {
  id: true,
  number: true,
  type: true,
  status: true,
  warehouseId: true,
  subtotal: true,
  discount: true,
  tax: true,
  deliveryFee: true,
  total: true,
  paidCash: true,
  paidCard: true,
  paidTransfer: true,
  change: true,
  debtPaid: true,
  outstanding: true,
  dueDate: true,
  date: true,
  relatedSaleId: true,
  createdAt: true,
  customer: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.SaleSelect

type ListRecord = Prisma.SaleGetPayload<{ select: typeof LIST_SELECT }>

/** To'lov turi filtri — qolgan qarz bazaning `outstanding` ustunidan (I13) */
const PAYMENT_WHERE: Record<PaymentFilter, Prisma.SaleWhereInput> = {
  cash: { paidCash: { gt: 0 } },
  card: { paidCard: { gt: 0 } },
  transfer: { paidTransfer: { gt: 0 } },
  debt: { outstanding: { gt: 0 } },
}

/**
 * Cheklar: ro'yxat (kalitli sahifalash, 10 §10.5), chek va chop etish
 * ma'lumoti. Qolgan qarz ilovada emas, bazada hisoblanadi.
 */
@Injectable()
export class SalesQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Chek qatorlari va yetkazish bilan — bitta so'rov */
  async get(id: string): Promise<SaleDto> {
    const sale = await this.prisma.scoped.sale.findFirst({ where: { id, deletedAt: null }, select: SALE_SELECT })
    if (!sale) throw new NotFoundError(RESOURCE, id)
    return toSaleDto(sale)
  }

  /**
   * Ro'yxat: `(date DESC, id DESC)` kaliti bo'yicha, `limit + 1` qator —
   * bitta so'rov (mijoz va sotuvchi nomi, qatorlar soni bilan).
   */
  async list(query: SaleQueryDto): Promise<CursorPage<SaleListItemDto>> {
    const and: Prisma.SaleWhereInput[] = [{ deletedAt: null }]
    if (query.dateFrom) and.push({ date: { gte: dateToDb(query.dateFrom) } })
    if (query.dateTo) and.push({ date: { lte: dateToDb(query.dateTo) } })
    if (query.status) and.push({ status: query.status })
    if (query.type) and.push({ type: query.type })
    if (query.sellerId) and.push({ sellerId: query.sellerId })
    if (query.customerId) and.push({ customerId: query.customerId })
    if (query.payment) and.push(PAYMENT_WHERE[query.payment])
    if (query.q) {
      and.push({
        OR: [
          { number: { contains: query.q, mode: 'insensitive' } },
          { customer: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      })
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor)
      and.push(keysetWhere<Prisma.SaleWhereInput>('date', 'desc', dateToDb(cursor.v), cursor.id))
    }

    const rows = await this.prisma.scoped.sale.findMany({
      where: { AND: and },
      select: LIST_SELECT,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    })
    return toCursorPage(rows.map(toListItem), query.limit, (s) => ({ v: s.date, id: s.id }))
  }

  /** Chop etish uchun: do'kon rekvizitlari (sozlama keshidan) + chek + tomonlar */
  async receipt(id: string): Promise<ReceiptDto> {
    const [sale, settings] = await Promise.all([
      this.prisma.scoped.sale.findFirst({
        where: { id, deletedAt: null },
        select: {
          ...SALE_SELECT,
          customer: { select: { id: true, name: true } },
          seller: { select: { id: true, name: true } },
          fiscal: { select: { status: true, fiscalId: true, qrPayload: true, fiscalizedAt: true } },
        },
      }),
      this.settings.get(),
    ])
    if (!sale) throw new NotFoundError(RESOURCE, id)
    return {
      store: {
        name: settings.storeName,
        phone: settings.receiptPhone,
        address: settings.receiptAddress,
        footer: settings.receiptFooter,
        currency: settings.currency,
      },
      sale: toSaleDto(sale),
      customer: sale.customer,
      seller: sale.seller,
      fiscal: sale.fiscal,
    }
  }
}

function toListItem(r: ListRecord): SaleListItemDto {
  return {
    id: r.id,
    number: r.number,
    type: r.type,
    status: r.status,
    customer: r.customer,
    seller: r.seller,
    warehouseId: r.warehouseId,
    subtotal: moneyFromDb(r.subtotal),
    discount: moneyFromDb(r.discount),
    tax: moneyFromDb(r.tax),
    deliveryFee: moneyFromDb(r.deliveryFee),
    total: moneyFromDb(r.total),
    paid: {
      cash: moneyFromDb(r.paidCash + r.change),
      card: moneyFromDb(r.paidCard),
      transfer: moneyFromDb(r.paidTransfer),
    },
    change: moneyFromDb(r.change),
    debtPaid: moneyFromDb(r.debtPaid),
    outstanding: moneyFromDb(r.outstanding),
    dueDate: r.dueDate ? dateFromDb(r.dueDate) : null,
    date: dateFromDb(r.date),
    relatedSaleId: r.relatedSaleId,
    itemCount: r._count.items,
    createdAt: r.createdAt,
  }
}
