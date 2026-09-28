import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ExpenseCategory, ProductUnit } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import { IsDateOnly } from '@/common/validation/decorators'

export const DASHBOARD_DAYS = [7, 30, 90] as const
/** P&L ro'yxat bo'limlari (top mahsulot, sotuvchilar, sotilmayotgan tovar) chegarasi */
export const REPORT_LIST_DEFAULT = 20
export const REPORT_LIST_MAX = 100

export class DashboardQueryDto {
  @ApiPropertyOptional({ enum: DASHBOARD_DAYS, default: 30, description: 'Trend va top mahsulot davri (kun)' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(DASHBOARD_DAYS)
  days: (typeof DASHBOARD_DAYS)[number] = 30
}

/** Davr — analitika (ABC to'liq ro'yxat: mijoz o'zi sahifalaydi) */
export class PeriodQueryDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateOnly()
  from!: string

  @ApiProperty({ example: '2026-09-30' })
  @IsDateOnly()
  to!: string
}

export class PnlQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: REPORT_LIST_MAX,
    default: REPORT_LIST_DEFAULT,
    description: '`topProducts`, `sellers` va `deadStock.items` ro‘yxatlari chegarasi',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REPORT_LIST_MAX)
  limit: number = REPORT_LIST_DEFAULT
}

// ─────────────────────────────────────────────── umumiy

export class DayTotalsDto {
  @ApiProperty({ description: 'Tushum: sotuv − qaytarish (I4)' }) revenue!: number
  @ApiPropertyOptional({ description: 'Yalpi foyda. Sotuvchi rolida yo‘q' }) profit?: number
  @ApiProperty() expenses!: number
  @ApiProperty() salesCount!: number
}

export class NamedValueDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty() value!: number
}

export class TrendPointDto {
  @ApiProperty({ example: '2026-09-23', description: 'Kun yoki oy (`YYYY-MM`)' }) bucket!: string
  @ApiProperty() revenue!: number
  @ApiPropertyOptional({ description: 'Sotuvchi rolida yo‘q' }) profit?: number
}

// ─────────────────────────────────────────────── dashboard

export class LowStockItemDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty({ enum: ProductUnit }) unit!: ProductUnit
  @ApiProperty() stock!: number
  @ApiProperty() minStock!: number
}

export class RecentSaleDto {
  @ApiProperty() id!: string
  @ApiProperty() number!: string
  @ApiProperty() date!: string
  @ApiProperty() total!: number
  @ApiProperty() status!: string
  @ApiProperty() type!: string
  @ApiProperty({ nullable: true, type: String }) customer!: string | null
}

export class DashboardDto {
  @ApiProperty({ type: DayTotalsDto }) today!: DayTotalsDto
  @ApiProperty({ type: DayTotalsDto }) yesterday!: DayTotalsDto
  @ApiProperty({ description: 'Mijozlar qarzi (debitorlik)' }) receivables!: number
  @ApiProperty() debtors!: number
  @ApiPropertyOptional({ description: 'Ta’minotchilarga qarz (kreditorlik, I18). Sotuvchi rolida yo‘q' }) payables?: number
  @ApiProperty() payableOrders!: number
  @ApiProperty() lowStockCount!: number
  @ApiProperty({ type: [LowStockItemDto] }) lowStock!: LowStockItemDto[]
  @ApiProperty({ type: [TrendPointDto] }) trend!: TrendPointDto[]
  @ApiProperty({ type: [NamedValueDto], description: 'Davrdagi top mahsulot (tushum)' }) topProducts!: NamedValueDto[]
  @ApiProperty({ type: [NamedValueDto] }) topDebtors!: NamedValueDto[]
  @ApiProperty({ type: [RecentSaleDto] }) recentSales!: RecentSaleDto[]
}

// ─────────────────────────────────────────────── P&L

export class PnlTotalsDto {
  @ApiProperty({ description: 'Tushum: sotuv − qaytarish (I4)' }) revenue!: number
  @ApiPropertyOptional({ description: 'Tannarx (COGS). Sotuvchi rolida yo‘q' }) cogs?: number
  @ApiPropertyOptional({ description: 'Sotuvchi rolida yo‘q' }) grossProfit?: number
  @ApiProperty() expenses!: number
  @ApiPropertyOptional({ description: 'Sotuvchi rolida yo‘q' }) netProfit?: number
  @ApiProperty() salesCount!: number
}

export class PnlChangeDto {
  @ApiProperty({ nullable: true, type: Number, description: '% — oldingi davr 0 bo‘lsa null' }) revenue!: number | null
  @ApiPropertyOptional({ nullable: true, type: Number }) grossProfit?: number | null
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Sotuvchi rolida yo‘q' }) netProfit?: number | null
  @ApiProperty({ nullable: true, type: Number }) expenses!: number | null
}

export class PaymentMixDto {
  @ApiProperty({ description: 'Kassada qolgan naqd' }) cash!: number
  @ApiProperty() card!: number
  @ApiProperty() transfer!: number
  @ApiProperty({ description: 'Davr cheklarining HOZIR qolgan qarzi' }) debt!: number
}

export class CategoryAmountDto {
  @ApiProperty({ enum: ExpenseCategory }) category!: ExpenseCategory
  @ApiProperty() amount!: number
}

export class ProductSalesDto {
  @ApiProperty() productId!: string
  @ApiProperty() name!: string
  @ApiProperty({ enum: ProductUnit }) unit!: ProductUnit
  @ApiProperty({ description: 'Asosiy birlikda' }) qty!: number
  @ApiProperty() revenue!: number
  @ApiPropertyOptional({ description: 'Sotuvchi rolida yo‘q' }) profit?: number
}

export class SellerSalesDto {
  @ApiProperty({ nullable: true, type: String }) sellerId!: string | null
  @ApiProperty({ nullable: true, type: String }) name!: string | null
  @ApiProperty() count!: number
  @ApiProperty() revenue!: number
}

export class DeadStockItemDto {
  @ApiProperty() productId!: string
  @ApiProperty() name!: string
  @ApiProperty({ enum: ProductUnit }) unit!: ProductUnit
  @ApiProperty() stock!: number
  @ApiPropertyOptional({ description: 'Qoldiq × tannarx. Sotuvchi rolida yo‘q (undan tannarx tiklanadi)' }) stockValue?: number
}

export class DeadStockDto {
  @ApiPropertyOptional({ description: 'Faol tovarlar ombor qiymati (tannarxda). Sotuvchi rolida yo‘q' }) stockValue?: number
  @ApiPropertyOptional({ description: 'Davrda sotilmagan, qoldig‘i bor tovarlar qiymati. Sotuvchi rolida yo‘q' }) deadValue?: number
  @ApiProperty({ type: [DeadStockItemDto] }) items!: DeadStockItemDto[]
}

export class PeriodDto {
  @ApiProperty() from!: string
  @ApiProperty() to!: string
}

export class PnlDto {
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto
  @ApiProperty({ type: PeriodDto, description: 'Xuddi shu uzunlikdagi oldingi davr' }) previousPeriod!: PeriodDto
  @ApiProperty({ type: PnlTotalsDto }) current!: PnlTotalsDto
  @ApiProperty({ type: PnlTotalsDto }) previous!: PnlTotalsDto
  @ApiProperty({ type: PnlChangeDto }) change!: PnlChangeDto
  @ApiProperty({ enum: ['day', 'month'], description: '62 kundan uzun davr — oy bo‘yicha' }) granularity!: 'day' | 'month'
  @ApiProperty({ type: [TrendPointDto] }) trend!: TrendPointDto[]
  @ApiProperty({ type: PaymentMixDto }) payments!: PaymentMixDto
  @ApiProperty({ type: [CategoryAmountDto] }) expensesByCategory!: CategoryAmountDto[]
  @ApiProperty({ type: [ProductSalesDto] }) topProducts!: ProductSalesDto[]
  @ApiProperty({ type: [SellerSalesDto] }) sellers!: SellerSalesDto[]
  @ApiProperty({ type: DeadStockDto }) deadStock!: DeadStockDto
}

// ─────────────────────────────────────────────── analitika

export class AbcRowDto {
  @ApiProperty() productId!: string
  @ApiProperty() name!: string
  @ApiProperty() revenue!: number
  @ApiProperty({ description: 'Ulush, %' }) share!: number
  @ApiProperty({ description: 'Yig‘ma ulush, %' }) cumulative!: number
  @ApiProperty({ enum: ['A', 'B', 'C'], description: 'A ≤ 80%, B ≤ 95%, C — qolgani' }) class!: 'A' | 'B' | 'C'
}

export class CategoryRevenueDto {
  @ApiProperty({ nullable: true, type: String }) categoryId!: string | null
  @ApiProperty({ example: 'Sement va aralashmalar' }) name!: string
  @ApiProperty() revenue!: number
}

export class AnalyticsDto {
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto
  @ApiProperty() totalRevenue!: number
  @ApiProperty({ type: [TrendPointDto], description: 'Kunlik tushum (sotuvlar)' }) trend!: TrendPointDto[]
  @ApiProperty({ type: [CategoryRevenueDto] }) categories!: CategoryRevenueDto[]
  @ApiProperty({ type: PaymentMixDto }) payments!: PaymentMixDto
  @ApiProperty({ type: [AbcRowDto] }) abc!: AbcRowDto[]
}
