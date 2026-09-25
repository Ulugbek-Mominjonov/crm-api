import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { POStatus, PayMethod, type Prisma } from '@prisma/client'
import {
  IsBoolean,
  IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { byField, sortValues, type SortMap } from '@/common/crud/sort'
import { ToBoolean, Trim, TrimToNull } from '@/common/validation/decorators'
import { IsPhone } from '@/common/validation/phone'

export const SUPPLIER_SORT = {
  id: byField('id'),
  name: byField('name'),
  createdAt: byField('createdAt'),
} satisfies SortMap<Prisma.SupplierOrderByWithRelationInput>

/**
 * STIR (INN) — O'zbekistonda soliq to'lovchining 9 xonali raqami
 * (yuridik shaxs ham, yakka tadbirkor ham).
 */
const TIN_PATTERN = /^\d{9}$/
const MAX_TERM_DAYS = 365

export class SupplierDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Bekabad Sement' }) name!: string
  @ApiProperty({ example: '+998712001010' }) phone!: string
  @ApiProperty({ nullable: true, type: String, example: 'Rustam Aliyev' }) contactPerson!: string | null
  @ApiProperty({ nullable: true, type: String }) address!: string | null
  @ApiProperty({ nullable: true, type: String }) notes!: string | null
  @ApiProperty({ nullable: true, type: String }) email!: string | null
  @ApiProperty({ nullable: true, type: String, example: '201234567', description: 'STIR, 9 raqam' }) tin!: string | null
  @ApiProperty({ nullable: true, type: Number, example: 14, description: 'To‘lov muddati, kun' })
  paymentTermDays!: number | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: String, format: 'date-time', description: 'Versiya — tahrirda `If-Match` ga qo‘yiladi' })
  updatedAt!: Date
  @ApiProperty({ example: 14, description: 'Shu ta’minotchi mahsulotlari (o‘chirilmagan)' }) productCount!: number
}

/** Kartadagi buyurtma — qarzi bilan (I18) */
export class SupplierOrderSummaryDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'BUY-1001' }) number!: string
  @ApiProperty({ enum: POStatus }) status!: POStatus
  @ApiProperty() total!: number
  @ApiProperty() paid!: number
  @ApiProperty({ description: 'Faqat kelgan tovar uchun' }) outstanding!: number
  @ApiProperty() date!: string
  @ApiProperty({ nullable: true, type: String }) dueDate!: string | null
}

export class SupplierPaymentSummaryDto {
  @ApiProperty() id!: string
  @ApiProperty() poId!: string
  @ApiProperty() amount!: number
  @ApiProperty({ enum: PayMethod }) method!: PayMethod
  @ApiProperty() date!: string
}

/** Ta'minotchi kartasi (T-072): tarix, jami qarz, oxirgi to'lovlar */
export class SupplierCardDto extends SupplierDto {
  @ApiProperty({ description: 'Jami qarz — kelgan, to‘lanmagan tovar (I18)' }) debt!: number
  @ApiProperty({ description: 'Jami xarid — kelgan tovar qiymati (qisman qabul ham)' }) totalPurchased!: number
  @ApiProperty({ description: 'Ochiq buyurtmalar (kutilayotgan yoki qisman)' }) openOrders!: number
  @ApiProperty({ type: [SupplierOrderSummaryDto], description: 'Oxirgi buyurtmalar' }) orders!: SupplierOrderSummaryDto[]
  @ApiProperty({ type: [SupplierPaymentSummaryDto], description: 'Oxirgi to‘lovlar' }) payments!: SupplierPaymentSummaryDto[]
}

export class CreateSupplierDto {
  @ApiProperty({ example: 'Bekabad Sement', maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string

  @ApiProperty({ example: '+998 71 200 10 10' })
  @IsPhone()
  phone!: string

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(200)
  contactPerson?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(300)
  address?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'savdo@bekabad.uz' })
  @IsOptional()
  @TrimToNull()
  @IsEmail({}, { message: 'email formati noto‘g‘ri' })
  @MaxLength(254)
  email?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '201234567', description: 'STIR — aniq 9 raqam' })
  @IsOptional()
  @TrimToNull()
  @Matches(TIN_PATTERN, { message: 'STIR 9 ta raqamdan iborat bo‘lsin' })
  tin?: string | null

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: MAX_TERM_DAYS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_TERM_DAYS)
  paymentTermDays?: number | null
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class SupplierListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: sortValues(SUPPLIER_SORT), default: 'name' })
  @IsOptional()
  @IsIn(sortValues(SUPPLIER_SORT))
  sort?: string

  @ApiPropertyOptional({ description: 'Faqat qarzimiz bor (kelgan tovar uchun to‘lanmagan) ta’minotchilar' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  withDebt?: boolean
}

export class SupplierListItemDto extends SupplierDto {
  @ApiProperty({ example: 2_500_000, description: 'Kreditorlik: kelgan tovar uchun to‘lanmagan (I18)' }) debt!: number
}

export class SupplierSummaryDto {
  @ApiProperty({ example: 7_800_000, description: 'Barcha ta’minotchilarga jami qarz' }) debt!: number
  @ApiProperty({ example: 3, description: 'Qarzimiz bor ta’minotchilar soni' }) suppliersWithDebt!: number
}


