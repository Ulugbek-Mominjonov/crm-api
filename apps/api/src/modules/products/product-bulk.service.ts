import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validateSync, type ValidationError } from 'class-validator'
import { currentTenantId } from '@/common/context/request-context'
import { mapDefined, mapNullable, moneyToDb, qtyToDb } from '@/common/crud/convert'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { DomainError } from '@/common/errors/domain.error'
import { AuditService } from '@/modules/audit/audit.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import {
  ProductImportRowDto,
  type BulkPriceDto,
  type BulkPriceResultDto,
  type ImportProductsDto,
  type ImportResultDto,
  type ImportRowErrorDto,
  type PriceMode,
  type PriceTarget,
} from './dto/product-bulk.dto'

/** Katta import bitta tranzaksiyada — sukut 10 s yetmasligi mumkin */
const IMPORT_TX_TIMEOUT_MS = 30_000

/** Ustun nomi foydalanuvchidan emas, shu OQ RO'YXATdan olinadi (03 §3.7) */
const PRICE_COLUMNS: Record<PriceTarget, Prisma.Sql> = {
  price: Prisma.raw('"price"'),
  wholesalePrice: Prisma.raw('"wholesale_price"'),
}

/** Foiz o'zgarishi chegarasi: narxni manfiy qilib yoki 11 barobardan oshirib bo'lmaydi */
const PERCENT_MIN = -100
const PERCENT_MAX = 1_000

interface ValidRow {
  row: number
  data: ProductImportRowDto
}

interface ExistingProduct {
  id: string
  sku: string
  barcode: string | null
  deletedAt: Date | null
}

/** Bazaga yoziladigan qator — `jsonb_to_recordset` ustunlari bilan bir xil nomlar */
interface UpsertRecord {
  id: string
  name: string
  barcode: string | null
  category_id: string | null
  unit: string
  price: number
  wholesale_price: number | null
  cost: number | null
  min_stock: number | null
  alt_unit: string | null
  alt_factor: number | null
}

/**
 * Ommaviy amallar: import va narxni ommaviy o'zgartirish.
 *
 * Qatorlar soniga bog'liq bo'lmagan so'rovlar soni (10 §10.9): 1000 qator
 * — bitta `createMany`, yangilash — bitta `UPDATE … FROM jsonb_to_recordset`.
 */
@Injectable()
export class ProductBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Xato qatorlar hisobotga tushadi, to'g'rilari saqlanadi. Saqlash BITTA
   * tranzaksiyada: kategoriyalar, yangi mahsulotlar va yangilanishlar yoki
   * birga yoziladi, yoki hech biri.
   */
  async import(dto: ImportProductsDto): Promise<ImportResultDto> {
    const errors: ImportRowErrorDto[] = []
    const valid = this.validateRows(dto.rows, errors)
    const unique = this.dropFileDuplicates(valid, errors)

    const existing = await this.findExisting(unique)
    const { toCreate, toUpdate } = classify(unique, existing, dto.mode, errors)

    const saved = await this.save(dto.mode, toCreate, toUpdate, errors.length)
      // Tekshiruvdan keyin parallel so'rov xuddi shu SKU'ni yaratgan bo'lsa —
      // baza noyobligi to'xtatadi: 500 emas, aniq 409 qaytadi
      .catch((err: unknown) =>
        rethrowAsDomain(err, {
          resource: 'Mahsulot',
          unique: { sku: 'DUPLICATE_SKU', barcode: 'ALREADY_EXISTS' },
        }),
      )

    errors.sort((x, y) => x.row - y.row)
    return { ...saved, skipped: errors.length, errors }
  }

  /** Kategoriyalar, yangi mahsulotlar, yangilanishlar va audit — BITTA tranzaksiya */
  private async save(
    mode: ImportProductsDto['mode'],
    toCreate: ValidRow[],
    toUpdate: { id: string; item: ValidRow }[],
    skipped: number,
  ): Promise<Pick<ImportResultDto, 'created' | 'updated' | 'categoriesCreated'>> {
    const tenantId = currentTenantId()
    return this.prisma.inTenantTransaction(
      tenantId,
      async (tx) => {
        const categories = await this.resolveCategories(tx, tenantId, [
          ...toCreate,
          ...toUpdate.map((u) => u.item),
        ])
        const created = await this.createProducts(tx, tenantId, toCreate, categories.ids)
        const updated = await this.updateProducts(tx, tenantId, toUpdate, categories.ids)
        const categoriesCreated = categories.created
        await this.audit.log(
          {
            action: 'product.import',
            entityType: 'product',
            diff: { mode, created, updated, skipped, categoriesCreated },
          },
          tx,
        )
        return { created, updated, categoriesCreated }
      },
      { timeout: IMPORT_TX_TIMEOUT_MS },
    )
  }

  /**
   * Narxni ommaviy o'zgartirish — BITTA so'rov. Eski va yangi narx audit'ga
   * (diff) yoziladi: kim, qachon, qaysi tovar narxini qanchaga o'zgartirgani
   * ko'rinadi va kerak bo'lsa qaytarish mumkin.
   */
  async bulkPrice(dto: BulkPriceDto): Promise<BulkPriceResultDto> {
    assertPriceChange(dto.mode, dto.value)
    const tenantId = currentTenantId()
    const column = PRICE_COLUMNS[dto.target]

    return this.prisma.inTenantTransaction(tenantId, async (tx) => {
      // `FOR UPDATE`: "oldingi" narx aynan o'zgartirilgan qiymat bo'lsin
      const changes = await tx.$queryRaw<{ id: string; before: bigint; after: bigint }[]>`
        WITH target AS (
          SELECT id, ${column} AS before
            FROM products
           WHERE tenant_id = ${tenantId}::uuid
             AND id = ANY(${dto.ids}::uuid[])
             AND deleted_at IS NULL
             FOR UPDATE
        )
        UPDATE products p
           SET ${column} = ${priceExpression(dto.mode, dto.value, column)}, updated_at = now()
          FROM target t
         WHERE p.id = t.id AND p.tenant_id = ${tenantId}::uuid
        RETURNING p.id, t.before, p.${column} AS after`

      await this.audit.log(
        {
          action: 'product.bulk_price',
          entityType: 'product',
          diff: {
            target: dto.target,
            mode: dto.mode,
            value: dto.value,
            changes: changes.map((c) => ({ id: c.id, before: Number(c.before), after: Number(c.after) })),
          },
        },
        tx,
      )
      return { updated: changes.length }
    })
  }

  /** Har qator alohida: ortiqcha maydon ham xato (global siyosat bilan bir xil) */
  private validateRows(rows: Record<string, unknown>[], errors: ImportRowErrorDto[]): ValidRow[] {
    const valid: ValidRow[] = []
    rows.forEach((raw, index) => {
      const row = index + 1
      const data = plainToInstance(ProductImportRowDto, raw)
      const issues = validateSync(data, { whitelist: true, forbidNonWhitelisted: true })
      if (issues.length > 0) {
        errors.push({ row, code: 'VALIDATION_FAILED', detail: summarize(issues) })
        return
      }
      valid.push({ row, data })
    })
    return valid
  }

  /** Fayl ichidagi takror SKU/shtrix-kod: birinchisi qoladi, keyingilari — xato */
  private dropFileDuplicates(rows: ValidRow[], errors: ImportRowErrorDto[]): ValidRow[] {
    const skus = new Set<string>()
    const barcodes = new Set<string>()
    return rows.filter((item) => {
      const { sku, barcode } = item.data
      if (skus.has(sku)) {
        errors.push({ row: item.row, code: 'DUPLICATE_SKU', detail: `${sku} (faylda takror)` })
        return false
      }
      if (barcode && barcodes.has(barcode)) {
        errors.push({ row: item.row, code: 'ALREADY_EXISTS', detail: `shtrix-kod ${barcode} (faylda takror)` })
        return false
      }
      skus.add(sku)
      if (barcode) barcodes.add(barcode)
      return true
    })
  }

  /**
   * SKU yoki shtrix-kodi mos keladigan mavjud mahsulotlar — BITTA so'rov.
   * O'chirilganlari ham olinadi: SKU noyobligi ularni ham qamraydi.
   */
  private async findExisting(rows: ValidRow[]): Promise<ExistingProduct[]> {
    if (rows.length === 0) return []
    const skus = rows.map((r) => r.data.sku)
    const barcodes = rows.flatMap((r) => (r.data.barcode ? [r.data.barcode] : []))
    return this.prisma.scoped.product.findMany({
      where: { OR: [{ sku: { in: skus } }, ...(barcodes.length ? [{ barcode: { in: barcodes } }] : [])] },
      select: { id: true, sku: true, barcode: true, deletedAt: true },
    })
  }

  /**
   * Kategoriya NOMI → id. Yo'qlari yaratiladi (ro'yxat oxiriga), o'chirilgan
   * bo'lsa tiklanadi — foydalanuvchi uni yana ishlatmoqda.
   */
  private async resolveCategories(
    tx: TenantTx,
    tenantId: string,
    rows: ValidRow[],
  ): Promise<{ ids: Map<string, string>; created: number }> {
    const names = [...new Set(rows.flatMap((r) => (r.data.category ? [r.data.category] : [])))]
    if (names.length === 0) return { ids: new Map(), created: 0 }

    const found = await tx.category.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true, deletedAt: true },
    })
    const deleted = found.filter((c) => c.deletedAt).map((c) => c.id)
    if (deleted.length) {
      await tx.category.updateMany({ where: { id: { in: deleted } }, data: { deletedAt: null } })
    }

    const known = new Set(found.map((c) => c.name))
    const missing = names.filter((n) => !known.has(n))
    if (missing.length === 0) {
      return { ids: new Map(found.map((c) => [c.name, c.id])), created: 0 }
    }

    const { _max } = await tx.category.aggregate({ _max: { sortOrder: true } })
    const start = (_max.sortOrder ?? -1) + 1
    const created = await tx.category.createManyAndReturn({
      data: missing.map((name, i) => ({ tenantId, name, sortOrder: start + i })),
      select: { id: true, name: true },
    })
    return {
      ids: new Map([...found, ...created].map((c) => [c.name, c.id])),
      created: created.length,
    }
  }

  private async createProducts(
    tx: TenantTx,
    tenantId: string,
    rows: ValidRow[],
    categoryIds: Map<string, string>,
  ): Promise<number> {
    if (rows.length === 0) return 0
    const { count } = await tx.product.createMany({
      data: rows.map(
        ({ data }): Prisma.ProductCreateManyInput => ({
          tenantId,
          name: data.name,
          sku: data.sku,
          barcode: data.barcode ?? null,
          categoryId: data.category ? categoryIds.get(data.category) : null,
          unit: data.unit,
          price: moneyToDb(data.price),
          wholesalePrice: moneyToDb(data.wholesalePrice ?? data.price),
          cost: moneyToDb(data.cost ?? 0),
          minStock: mapDefined(data.minStock, qtyToDb),
          altUnit: data.altUnit ?? null,
          altFactor: mapNullable(data.altFactor, qtyToDb) ?? null,
        }),
      ),
    })
    return count
  }

  /**
   * `upsert`: SKU bo'yicha topilganlar BITTA `UPDATE` bilan. Qatorda
   * berilmagan ixtiyoriy maydon (shtrix-kod, tannarx ...) o'zgarmaydi —
   * CSV'dagi bo'sh katak mavjud qiymatni o'chirib yubormasin.
   */
  private async updateProducts(
    tx: TenantTx,
    tenantId: string,
    rows: { id: string; item: ValidRow }[],
    categoryIds: Map<string, string>,
  ): Promise<number> {
    if (rows.length === 0) return 0
    const records: UpsertRecord[] = rows.map(({ id, item: { data } }) => ({
      id,
      name: data.name,
      barcode: data.barcode ?? null,
      category_id: data.category ? (categoryIds.get(data.category) ?? null) : null,
      unit: data.unit,
      price: data.price,
      wholesale_price: data.wholesalePrice ?? null,
      cost: data.cost ?? null,
      min_stock: data.minStock ?? null,
      alt_unit: data.altUnit ?? null,
      alt_factor: data.altFactor ?? null,
    }))

    return tx.$executeRaw`
      UPDATE products AS p SET
        name            = v.name,
        barcode         = COALESCE(v.barcode, p.barcode),
        category_id     = COALESCE(v.category_id, p.category_id),
        unit            = v.unit::"ProductUnit",
        price           = v.price,
        wholesale_price = COALESCE(v.wholesale_price, p.wholesale_price),
        cost            = COALESCE(v.cost, p.cost),
        min_stock       = COALESCE(v.min_stock, p.min_stock),
        alt_unit        = COALESCE(v.alt_unit::"ProductUnit", p.alt_unit),
        alt_factor      = COALESCE(v.alt_factor, p.alt_factor),
        updated_at      = now()
      FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS v(
        id uuid, name text, barcode text, category_id uuid, unit text, price bigint,
        wholesale_price bigint, cost bigint, min_stock numeric, alt_unit text, alt_factor numeric
      )
      WHERE p.id = v.id AND p.tenant_id = ${tenantId}::uuid AND p.deleted_at IS NULL`
  }
}

/**
 * Yangi yoki yangilanadigan: SKU bo'yicha. `create` rejimida mavjud SKU —
 * xato; o'chirilgan mahsulot SKU'si ikkala rejimda ham xato (avval tiklash
 * kerak). Shtrix-kod boshqa TIRIK mahsulotda bo'lsa — xato.
 */
function classify(
  rows: ValidRow[],
  existing: ExistingProduct[],
  mode: ImportProductsDto['mode'],
  errors: ImportRowErrorDto[],
): { toCreate: ValidRow[]; toUpdate: { id: string; item: ValidRow }[] } {
  const bySku = new Map(existing.map((p) => [p.sku, p]))
  const liveBarcodes = new Map(
    existing.flatMap((p) => (p.barcode && !p.deletedAt ? [[p.barcode, p.id] as const] : [])),
  )
  const toCreate: ValidRow[] = []
  const toUpdate: { id: string; item: ValidRow }[] = []

  for (const item of rows) {
    const { sku, barcode } = item.data
    const match = bySku.get(sku)
    if (match && (mode === 'create' || match.deletedAt)) {
      const detail = match.deletedAt ? `${sku} (o‘chirilgan mahsulot — avval tiklang)` : sku
      errors.push({ row: item.row, code: 'DUPLICATE_SKU', detail })
      continue
    }
    const barcodeOwner = barcode ? liveBarcodes.get(barcode) : undefined
    if (barcodeOwner && barcodeOwner !== match?.id) {
      errors.push({ row: item.row, code: 'ALREADY_EXISTS', detail: `shtrix-kod ${barcode}` })
      continue
    }
    if (match) toUpdate.push({ id: match.id, item })
    else toCreate.push(item)
  }
  return { toCreate, toUpdate }
}

/** Rejimga xos chegara: DTO faqat son ekanini tekshiradi, ma'nosi shu yerda */
function assertPriceChange(mode: PriceMode, value: number): void {
  const problem = priceChangeProblem(mode, value)
  if (problem) {
    throw new DomainError('VALIDATION_FAILED', `value: ${problem}`, [
      { field: 'value', code: 'VALIDATION_FAILED', meta: { message: problem } },
    ])
  }
}

function priceChangeProblem(mode: PriceMode, value: number): string | null {
  if (mode === 'percent') {
    return value < PERCENT_MIN || value > PERCENT_MAX
      ? `foiz ${PERCENT_MIN}…${PERCENT_MAX} oralig‘ida bo‘lsin`
      : null
  }
  if (!Number.isSafeInteger(value)) return 'summa butun so‘m bo‘lsin'
  if (mode === 'set' && value < 0) return 'narx manfiy bo‘lmaydi'
  return null
}

/**
 * Yangi narx ifodasi. Foizda `numeric` arifmetika va yaxlitlash (frontenddagi
 * `Math.round` bilan bir xil natija); natija hech qachon manfiy bo'lmaydi.
 */
function priceExpression(mode: PriceMode, value: number, column: Prisma.Sql): Prisma.Sql {
  switch (mode) {
    case 'percent':
      return Prisma.sql`GREATEST(0, ROUND(p.${column} * (100 + ${value}::numeric) / 100))::bigint`
    case 'fixed':
      return Prisma.sql`GREATEST(0, p.${column} + ${value}::bigint)`
    case 'set':
      return Prisma.sql`${value}::bigint`
  }
}

/** class-validator xatolarini bitta o'qiladigan qatorga yig'adi */
function summarize(issues: ValidationError[]): string {
  return issues
    .flatMap((issue) => Object.values(issue.constraints ?? { [issue.property]: `${issue.property} noto‘g‘ri` }))
    .join('; ')
}
