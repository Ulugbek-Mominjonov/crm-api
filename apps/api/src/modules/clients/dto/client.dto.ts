import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { ClientStatus, ClientType, CustomerGroup, type Prisma } from '@prisma/client'
import {
  IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { byField, sortValues, type SortMap } from '@/common/crud/sort'
import { IsMoney, Trim } from '@/common/validation/decorators'
import { IsPhone } from '@/common/validation/phone'

export const CLIENT_SORT = {
  id: byField('id'),
  name: byField('name'),
  createdAt: byField('createdAt'),
  bonusPoints: byField('bonusPoints'),
} satisfies SortMap<Prisma.ClientOrderByWithRelationInput>

/** Nasiya to'lov muddati — ko'pi bilan bir yil */
const MAX_TERM_DAYS = 365
/** Bo'sh satr ham ruxsat (frontend `isEmail` bilan bir xil) */
const OPTIONAL_EMAIL = /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class ClientDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Alisher Qodirov' }) name!: string
  @ApiProperty({ enum: ClientType }) type!: ClientType
  @ApiProperty({ example: '+998901234567' }) phone!: string
  @ApiProperty({ example: '' }) email!: string
  @ApiProperty({ enum: ClientStatus }) status!: ClientStatus
  @ApiProperty({ enum: CustomerGroup, description: 'Narx darajasi' }) group!: CustomerGroup
  @ApiProperty({ example: 1200, description: 'Sodiqlik ballari — faqat sotuvda o‘zgaradi (I17)' })
  bonusPoints!: number
  @ApiProperty({ nullable: true, type: Number, example: 30_000_000, description: 'Nasiya limiti, so‘m; null — cheklanmagan' })
  creditLimit!: number | null
  @ApiProperty({ nullable: true, type: Number, example: 21, description: 'Nasiya to‘lov muddati, kun' })
  paymentTermDays!: number | null
  @ApiProperty({ example: 'Instagram' }) source!: string
  @ApiProperty({ nullable: true, type: String }) company!: string | null
  @ApiProperty({ nullable: true, type: String }) notes!: string | null
  @ApiProperty({ example: 12, description: 'Sotuv cheklari soni (qaytarishsiz)' }) salesCount!: number
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: String, format: 'date-time', description: 'Versiya — tahrirda `If-Match` ga qo‘yiladi' })
  updatedAt!: Date
}

export class CreateClientDto {
  @ApiProperty({ example: 'Alisher Qodirov', maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string

  @ApiProperty({ example: '+998 90 123-45-67', description: 'Saqlashda raqamlar va boshidagi `+` qoladi' })
  @IsPhone()
  phone!: string

  @ApiPropertyOptional({ enum: ClientType, default: ClientType.individual })
  @IsOptional()
  @IsIn(Object.values(ClientType))
  type?: ClientType

  @ApiPropertyOptional({ example: 'ali@mail.uz' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(254)
  @Matches(OPTIONAL_EMAIL, { message: 'email formati noto‘g‘ri' })
  email?: string

  @ApiPropertyOptional({ enum: ClientStatus, default: ClientStatus.lead })
  @IsOptional()
  @IsIn(Object.values(ClientStatus))
  status?: ClientStatus

  @ApiPropertyOptional({ enum: CustomerGroup, default: CustomerGroup.retail })
  @IsOptional()
  @IsIn(Object.values(CustomerGroup))
  group?: CustomerGroup

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Nasiya limiti, butun so‘m; null yoki 0 — cheklanmagan' })
  @IsOptional()
  @IsMoney()
  creditLimit?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: MAX_TERM_DAYS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_TERM_DAYS)
  paymentTermDays?: number | null

  @ApiPropertyOptional({ example: 'Instagram', maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  source?: string

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  company?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null
}

export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class ClientListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: sortValues(CLIENT_SORT), default: '-createdAt' })
  @IsOptional()
  @IsIn(sortValues(CLIENT_SORT))
  sort?: string

  @ApiPropertyOptional({ enum: ClientStatus })
  @IsOptional()
  @IsIn(Object.values(ClientStatus))
  status?: ClientStatus

  @ApiPropertyOptional({ enum: CustomerGroup })
  @IsOptional()
  @IsIn(Object.values(CustomerGroup))
  group?: CustomerGroup

  @ApiPropertyOptional({ enum: ClientType })
  @IsOptional()
  @IsIn(Object.values(ClientType))
  type?: ClientType

  @ApiPropertyOptional({
    example: '+998901234567',
    description: 'ANIQ moslik (kassada mijozni topish) — `(tenant_id, phone)` indeksi ishlatiladi',
  })
  @IsOptional()
  @IsPhone()
  phone?: string
}

export class ClientStatsDto {
  @ApiProperty({ example: 12_500_000, description: 'Sof xarid: sotuvlar − qaytarishlar (bekor qilinganlarsiz)' }) totalSpent!: number
  @ApiProperty({ example: 350_000, description: 'To‘lanmagan nasiya (I13)' }) debt!: number
  @ApiProperty({ example: 0, description: 'Shundan muddati o‘tgani' }) overdue!: number
  @ApiProperty({ type: String, nullable: true, format: 'date', description: 'Oxirgi xarid kuni' }) lastPurchase!: string | null
}
