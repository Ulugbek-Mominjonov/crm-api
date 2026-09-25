import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { reorderQty } from '@crm/shared'
import { dateFromDb, dateToDb, mapNullable, moneyFromDb, qtyFromDb } from '@/common/crud/convert'
import { decodeCursor, keysetWhere, toCursorPage, type CursorPage } from '@/common/crud/paging'
import { PrismaService } from '@/prisma/prisma.service'
import type {
  MovementDto, MovementQueryDto, ReorderGroupDto, ReorderItemDto,
} from './dto/stock.dto'

const MOVEMENT_SELECT = {
  id: true,
  productId: true,
  productName: true,
  type: true,
  qty: true,
  balanceAfter: true,
  warehouseId: true,
  counterWarehouseId: true,
  date: true,
  note: true,
  supplierId: true,
  unitCost: true,
  refId: true,
  userId: true,
  createdAt: true,
} satisfies Prisma.StockMovementSelect

type MovementRow = Prisma.StockMovementGetPayload<{ select: typeof MOVEMENT_SELECT }>

/** Ombor o'qishlari: harakatlar jurnali va buyurtma taklifi */
@Injectable()
export class StockQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Harakatlar jurnali — KALITLI sahifalash `(date, id)` bo'yicha (10 §10.5):
   * `OFFSET` 100 000 qatorni o'qib tashlardi, kursor esa har sahifada bir xil
   * tez. `date` aniq (kun), `id` — uuid v7, kun ichida xronologik;
   * `created_at` ishlatilmaydi: u mikrosekundli, JS `Date` esa millisekundli —
   * kursor taqqoslashida qatorlar tushib qolardi.
   */
  async movements(query: MovementQueryDto): Promise<CursorPage<MovementDto>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
    const conditions: Prisma.StockMovementWhereInput[] = [
      {
        ...(query.productId && { productId: query.productId }),
        ...(query.warehouseId && { warehouseId: query.warehouseId }),
        ...(query.type && { type: query.type }),
        ...((query.dateFrom || query.dateTo) && {
          date: {
            ...(query.dateFrom && { gte: dateToDb(query.dateFrom) }),
            ...(query.dateTo && { lte: dateToDb(query.dateTo) }),
          },
        }),
      },
    ]
    if (query.q) {
      conditions.push({
        OR: [
          { productName: { contains: query.q, mode: 'insensitive' } },
          { note: { contains: query.q, mode: 'insensitive' } },
        ],
      })
    }
    if (cursor) {
      conditions.push(keysetWhere<Prisma.StockMovementWhereInput>('date', 'desc', dateToDb(cursor.v), cursor.id))
    }

    const rows = await this.prisma.scoped.stockMovement.findMany({
      where: { AND: conditions },
      select: MOVEMENT_SELECT,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    })
    return toCursorPage(rows.map(toMovementDto), query.limit, (m) => ({ v: m.date, id: m.id }))
  }

  /**
   * Buyurtma taklifi: kam qolgan faol tovarlar, ta'minotchi bo'yicha
   * guruhlangan. Miqdor mantiqi frontend bilan BITTA manbadan
   * (`@crm/shared` → `reorderQty`). Bitta so'rov: `products_low_stock`
   * qisman indeksi + ta'minotchi LATERAL JOIN bilan.
   */
  async reorderSuggestions(): Promise<ReorderGroupDto[]> {
    const rows = await this.prisma.scoped.product.findMany({
      where: {
        deletedAt: null,
        archived: false,
        stock: { lte: this.prisma.product.fields.minStock },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        stock: true,
        minStock: true,
        cost: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })

    const groups = new Map<string, ReorderGroupDto>()
    for (const row of rows) {
      const stock = qtyFromDb(row.stock)
      const minStock = qtyFromDb(row.minStock)
      const suggestedQty = reorderQty({ stock, minStock })
      // Minimal belgilanmagan (0) tovar — buyurtma qilinadigan narsa yo'q
      if (suggestedQty <= 0) continue
      const item: ReorderItemDto = {
        productId: row.id,
        name: row.name,
        sku: row.sku,
        unit: row.unit,
        stock,
        minStock,
        suggestedQty,
        cost: moneyFromDb(row.cost),
      }
      const key = row.supplier?.id ?? ''
      const group = groups.get(key) ?? { supplier: row.supplier ?? null, items: [] }
      group.items.push(item)
      groups.set(key, group)
    }
    // Ta'minotchilar nomi bo'yicha; ta'minotchisizlar — oxirida
    return [...groups.values()].sort((a, b) => {
      if (!a.supplier) return 1
      if (!b.supplier) return -1
      return a.supplier.name.localeCompare(b.supplier.name)
    })
  }
}

function toMovementDto(row: MovementRow): MovementDto {
  return {
    ...row,
    qty: qtyFromDb(row.qty),
    balanceAfter: qtyFromDb(row.balanceAfter),
    date: dateFromDb(row.date),
    unitCost: mapNullable(row.unitCost, moneyFromDb) ?? null,
  }
}
