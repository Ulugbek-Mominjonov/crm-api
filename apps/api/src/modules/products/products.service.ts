import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import {
  dateFromDb, mapDefined, mapNullable, moneyFromDb, moneyToDb, qtyFromDb, qtyToDb,
} from '@/common/crud/convert'
import { crudDelegate, SoftDeleteCrudService, type CrudDelegate } from '@/common/crud/crud.service'
import type { Paged } from '@/common/crud/paging'
import { DomainError } from '@/common/errors/domain.error'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import {
  PRODUCT_SORT,
  type CreateProductDto,
  type ProductDto,
  type ProductListQueryDto,
  type ProductStatsDto,
  type ProductSummaryDto,
  type UpdateProductDto,
} from './dto/product.dto'

/** Xulosadagi "kategoriya bo'yicha qiymat" — eng kattasi shuncha */
const SUMMARY_CATEGORIES = 8

export const PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  categoryId: true,
  supplierId: true,
  unit: true,
  price: true,
  wholesalePrice: true,
  cost: true,
  stock: true,
  minStock: true,
  archived: true,
  altUnit: true,
  altFactor: true,
  imageFileId: true,
  createdAt: true,
  updatedAt: true,
  // Ombor taqsimoti — `relationJoins` bilan katalog so'rovining O'ZIDA
  // (LATERAL JOIN): ro'yxat byudjeti 2 so'rov (10 §10.1)
  stocks: { select: { warehouseId: true, qty: true } },
} satisfies Prisma.ProductSelect

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>

/**
 * Mahsulotlar katalogi.
 *
 * QOLDIQ bu servisda o'zgarmaydi: `products.stock` — trigger yuritadigan
 * yig'indi (I1), `product_stocks` esa faqat ombor amallari orqali (E5).
 */
@Injectable()
export class ProductsService extends SoftDeleteCrudService<
  ProductRow,
  ProductDto,
  CreateProductDto,
  UpdateProductDto,
  ProductListQueryDto
> {
  protected readonly resource = 'Mahsulot'
  protected readonly select = PRODUCT_SELECT
  protected readonly sortMap = PRODUCT_SORT
  protected readonly defaultSort = 'name'
  protected override readonly uniqueRules = [
    // SKU o'chirilganlar bilan ham noyob; shtrix-kod — faqat tiriklar orasida
    { field: 'sku', code: 'DUPLICATE_SKU' as const },
    { field: 'barcode', liveOnly: true },
  ]

  constructor(private readonly prisma: PrismaService) {
    super()
  }

  protected delegate(): CrudDelegate<ProductRow> {
    return crudDelegate(this.prisma.scoped.product)
  }

  protected toDto({ stocks, ...row }: ProductRow): ProductDto {
    return {
      ...row,
      price: moneyFromDb(row.price),
      wholesalePrice: moneyFromDb(row.wholesalePrice),
      cost: moneyFromDb(row.cost),
      stock: qtyFromDb(row.stock),
      minStock: qtyFromDb(row.minStock),
      altFactor: mapNullable(row.altFactor, qtyFromDb) ?? null,
      stocks: Object.fromEntries(stocks.map((s) => [s.warehouseId, qtyFromDb(s.qty)])),
    }
  }

  /**
   * Qidiruv: nom va SKU — `ILIKE` (trigram indekslari), shtrix-kod — ANIQ
   * moslik (`products_barcode_exact`): skaner har chekda ishlaydi, u yerda
   * `ILIKE` kerak emas (10 §10.4).
   */
  protected filters(query: ProductListQueryDto): Prisma.ProductWhereInput {
    const q = query.q
    return {
      archived: query.archived ?? false,
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { barcode: q },
        ],
      }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.supplierId && { supplierId: query.supplierId }),
      // `products_low_stock` qisman indeksi aynan shu shartga mos
      ...(query.lowStock && { stock: { lte: this.prisma.product.fields.minStock } }),
      ...(query.warehouseId && {
        stocks: { some: { warehouseId: query.warehouseId, qty: { gt: 0 } } },
      }),
    }
  }

  /**
   * Katalog xulosasi — BITTA agregat (ro'yxat byudjetiga kirmaydi, alohida
   * keshlanadi): faol turlar, kam qolganlar (`products_low_stock` sharti),
   * ombor qiymati tannarxda (sotuvchiga chiqmaydi — `stockValue` yashirin).
   */
  async summary(): Promise<ProductSummaryDto> {
    const { tenantId } = requireTenantTx()
    const [[row], byCategory] = await Promise.all([
      this.prisma.scoped.$queryRaw<{ active: bigint; low: bigint; value: Prisma.Decimal }[]>`
        SELECT COUNT(*) AS active,
               COUNT(*) FILTER (WHERE stock <= min_stock) AS low,
               COALESCE(SUM(stock * cost), 0) AS value
          FROM products
         WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL AND NOT archived`,
      this.prisma.scoped.$queryRaw<{ name: string | null; value: Prisma.Decimal }[]>`
        SELECT c.name, SUM(p.stock * p.cost) AS value
          FROM products p
          LEFT JOIN categories c ON c.tenant_id = p.tenant_id AND c.id = p.category_id
         WHERE p.tenant_id = ${tenantId}::uuid AND p.deleted_at IS NULL AND NOT p.archived
         GROUP BY c.name
         ORDER BY value DESC
         LIMIT ${SUMMARY_CATEGORIES}`,
    ])
    return {
      active: Number(row!.active),
      lowStock: Number(row!.low),
      stockValue: Math.round(row!.value.toNumber()),
      stockValueByCategory: byCategory.map((c) => ({ name: c.name ?? '', value: Math.round(c.value.toNumber()) })),
    }
  }

  /**
   * Mahsulot kartasi raqamlari — BITTA agregat (`sale_items` ning
   * `(tenant_id, product_id)` indeksi): sof sotilgan miqdor va oxirgi sotuv.
   */
  async stats(id: string): Promise<ProductStatsDto> {
    await this.get(id)
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<{ sold: Prisma.Decimal; last: Date | null }[]>`
      SELECT COALESCE(SUM(CASE WHEN s.type = 'sale' THEN i.base_qty ELSE -i.base_qty END), 0) AS sold,
             MAX(s.date) FILTER (WHERE s.type = 'sale') AS last
        FROM sale_items i
        JOIN sales s ON s.tenant_id = i.tenant_id AND s.id = i.sale_id
       WHERE i.tenant_id = ${tenantId}::uuid AND i.product_id = ${id}::uuid
         AND s.status <> 'cancelled' AND s.deleted_at IS NULL`
    return { soldQty: qtyFromDb(row!.sold), lastSale: row!.last ? dateFromDb(row!.last) : null }
  }

  /** `warehouseId` berilsa har mahsulotga shu ombordagi qoldiq qo'shiladi (kassa uchun) */
  override async list(query: ProductListQueryDto): Promise<Paged<ProductDto>> {
    const page = await super.list(query)
    const warehouseId = query.warehouseId
    if (!warehouseId) return page
    return {
      ...page,
      items: page.items.map((p) => ({ ...p, warehouseStock: p.stocks[warehouseId] ?? 0 })),
    }
  }

  /**
   * Mahsulot tiklanganda rasmi ham qaytadi: o'chirilgan mahsulot rasmi
   * tunda "yetim" deb belgilangan bo'lishi mumkin (09 §9.10, 30 kun).
   * Fayl AVVAL (qulf tartibi GC bilan bir xil: fayl → mahsulot).
   */
  override async restore(id: string): Promise<ProductDto> {
    const { tenantId } = requireTenantTx()
    await this.prisma.scoped.$executeRaw`
      UPDATE files f SET deleted_at = NULL
        FROM products p
       WHERE p.tenant_id = ${tenantId}::uuid AND p.id = ${id}::uuid
         AND f.tenant_id = p.tenant_id AND f.id = p.image_file_id AND f.deleted_at IS NOT NULL`
    return super.restore(id)
  }

  protected async createData(dto: CreateProductDto): Promise<Omit<Prisma.ProductUncheckedCreateInput, 'tenantId'>> {
    await this.assertImage(dto.imageFileId)
    return {
      name: dto.name,
      sku: dto.sku,
      barcode: dto.barcode ?? null,
      categoryId: dto.categoryId ?? null,
      supplierId: dto.supplierId ?? null,
      unit: dto.unit,
      price: moneyToDb(dto.price),
      wholesalePrice: moneyToDb(dto.wholesalePrice),
      cost: moneyToDb(dto.cost),
      minStock: mapDefined(dto.minStock, qtyToDb),
      archived: dto.archived,
      altUnit: dto.altUnit ?? null,
      altFactor: mapNullable(dto.altFactor, qtyToDb) ?? null,
      imageFileId: dto.imageFileId ?? null,
    }
  }

  /** Yangi rasm eskisining o'rnini oladi — eski fayl havolasiz qoladi va GC uni tozalaydi */
  protected async updateData(dto: UpdateProductDto): Promise<Prisma.ProductUncheckedUpdateInput> {
    await this.assertImage(dto.imageFileId)
    return {
      name: dto.name,
      sku: dto.sku,
      barcode: dto.barcode,
      categoryId: dto.categoryId,
      supplierId: dto.supplierId,
      unit: dto.unit,
      price: mapDefined(dto.price, moneyToDb),
      wholesalePrice: mapDefined(dto.wholesalePrice, moneyToDb),
      cost: mapDefined(dto.cost, moneyToDb),
      minStock: mapDefined(dto.minStock, qtyToDb),
      archived: dto.archived,
      altUnit: dto.altUnit,
      altFactor: mapNullable(dto.altFactor, qtyToDb),
      imageFileId: dto.imageFileId,
    }
  }

  /**
   * Rasm — shu do'konning TASDIQLANGAN mahsulot rasmi. Boshqa tenant fayli
   * RLS ostida ko'rinmaydi — "topilmadi" (mavjudligi oshkor qilinmaydi).
   */
  private async assertImage(fileId: string | null | undefined): Promise<void> {
    if (!fileId) return
    const file = await this.prisma.scoped.file.findFirst({
      where: { id: fileId, kind: 'product_image', status: 'ready', deletedAt: null },
      select: { id: true },
    })
    if (file) return
    throw new DomainError('REFERENCE_NOT_FOUND', 'Mahsulot rasmi topilmadi yoki hali tasdiqlanmagan', [
      { field: 'imageFileId', code: 'REFERENCE_NOT_FOUND' },
    ])
  }
}
