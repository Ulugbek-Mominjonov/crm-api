import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { DeliveryStatus } from '@prisma/client'
import {
  IsBoolean, IsIn, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength,
} from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { IsDateOnly, IsMoney, ToBoolean, Trim } from '@/common/validation/decorators'

export class CreateDeliveryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Chekka bog‘langan yetkazish — narx chekdan (D3)' })
  @IsOptional()
  @IsUUID()
  saleId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string

  @ApiProperty({ example: 'Toshkent, Chilonzor 7' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address!: string

  @ApiProperty({ example: '+998901234567' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string

  @ApiProperty({ example: '2026-09-24' })
  @IsDateOnly()
  scheduledDate!: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Haydovchi — xodim' })
  @IsOptional()
  @IsUUID()
  driverId?: string

  @ApiPropertyOptional({ example: 20_000, description: 'Faqat chekSIZ (alohida xizmat) yetkazishda' })
  @IsOptional()
  @IsMoney()
  fee?: number

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string

  @ApiPropertyOptional({ example: 41.31 })
  @IsOptional()
  @IsLatitude()
  lat?: number

  @ApiPropertyOptional({ example: 69.24 })
  @IsOptional()
  @IsLongitude()
  lng?: number
}

export class UpdateDeliveryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateOnly()
  scheduledDate?: string

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String, description: '`null` — haydovchi olib tashlanadi' })
  @IsOptional()
  @IsUUID()
  driverId?: string | null

  @ApiPropertyOptional({ description: 'Faqat chekSIZ yetkazishda' })
  @IsOptional()
  @IsMoney()
  fee?: number

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string | null

  @ApiPropertyOptional({ nullable: true, type: Number, description: '`null` — joylashuv tozalanadi' })
  @IsOptional()
  @IsLatitude()
  lat?: number | null

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsLongitude()
  lng?: number | null
}

export class DeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus, description: 'pending → on_way → delivered; faol holatdan — cancelled' })
  @IsIn(Object.values(DeliveryStatus))
  status!: DeliveryStatus
}

export class DeliveryQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsIn(Object.values(DeliveryStatus))
  status?: DeliveryStatus

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  driverId?: string

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string

  @ApiPropertyOptional({ description: 'Faqat muddati o‘tgan faol yetkazishlar' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  overdue?: boolean
}

export class RouteQueryDto {
  @ApiPropertyOptional({ example: '2026-09-24', description: 'Berilmasa — bugun' })
  @IsOptional()
  @IsDateOnly()
  date?: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Berilmasa — joriy foydalanuvchining o‘zi' })
  @IsOptional()
  @IsUUID()
  driverId?: string
}

export class DeliveryPartyDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
}

export class DeliveryDto {
  @ApiProperty() id!: string
  @ApiProperty({ nullable: true, type: String }) saleId!: string | null
  @ApiProperty({ nullable: true, type: String, example: 'CHEK-1042' }) saleNumber!: string | null
  @ApiProperty({ type: DeliveryPartyDto, nullable: true }) customer!: DeliveryPartyDto | null
  @ApiProperty() address!: string
  @ApiProperty() phone!: string
  @ApiProperty({ description: 'Chekli — chekdagi yetkazish narxi (D3), aks holda alohida narx' }) fee!: number
  @ApiProperty({ type: DeliveryPartyDto, nullable: true }) driver!: DeliveryPartyDto | null
  @ApiProperty({ enum: DeliveryStatus }) status!: DeliveryStatus
  @ApiProperty() scheduledDate!: string
  @ApiProperty({ description: 'Rejalangan kun o‘tgan, hali yetkazilmagan' }) overdue!: boolean
  @ApiProperty({ nullable: true, type: String }) note!: string | null
  @ApiProperty({ nullable: true, type: Number }) lat!: number | null
  @ApiProperty({ nullable: true, type: Number }) lng!: number | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) deliveredAt!: Date | null
}

export class DriverLoadDto {
  @ApiProperty({ type: DeliveryPartyDto, nullable: true, description: 'null — haydovchi biriktirilmagan' }) driver!: DeliveryPartyDto | null
  @ApiProperty({ example: 3, description: 'Faol (kutilmoqda + yo‘lda) yetkazishlar' }) count!: number
}

export class DeliverySummaryDto {
  @ApiProperty() pending!: number
  @ApiProperty() onWay!: number
  @ApiProperty() delivered!: number
  @ApiProperty({ description: 'Yetkazilganlar narxi (chekli — chekdagi, D3)' }) feeRevenue!: number
  @ApiProperty({ type: [DriverLoadDto], description: 'Haydovchilar yuki — kattasi birinchi' }) workload!: DriverLoadDto[]
}

export class DeliveryPageDto {
  @ApiProperty({ type: [DeliveryDto] }) items!: DeliveryDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
}

export class RouteStopDto extends DeliveryDto {
  @ApiProperty({ example: 1 }) sequence!: number
  @ApiProperty({ description: 'Mijozdan olinadigan pul — chekning qolgan qarzi' }) collect!: number
}

export class RouteSheetDto {
  @ApiProperty() date!: string
  @ApiProperty({ type: DeliveryPartyDto, nullable: true }) driver!: DeliveryPartyDto | null
  @ApiProperty({ type: [RouteStopDto] }) stops!: RouteStopDto[]
  @ApiProperty({ description: 'Jami olinadigan pul' }) collectTotal!: number
}
