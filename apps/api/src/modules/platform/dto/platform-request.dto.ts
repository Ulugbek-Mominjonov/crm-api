import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/common/crud/list-query.dto'
import { Trim } from '@/common/validation/decorators'
import {
  MAX_REQUEST_MESSAGE_LENGTH, REQUEST_STATUSES, REQUEST_TYPES, TenantRequestMessageDto, type RequestStatus, type RequestType,
} from '@/modules/account/dto/tenant-request.dto'
import { TENANT_STATUSES, type TenantStatusName } from './platform-tenant.dto'

export class PlatformRequestsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE

  @ApiPropertyOptional({ format: 'uuid', description: 'Bitta do‘kon murojaatlari (do‘kon kartasi)' })
  @IsOptional()
  @IsUUID()
  tenantId?: string

  @ApiPropertyOptional({ enum: REQUEST_STATUSES, description: '`open` — javob kutayotganlar (sukut: hammasi, yopilmaganlar birinchi)' })
  @IsOptional()
  @IsIn(REQUEST_STATUSES)
  status?: RequestStatus

  @ApiPropertyOptional({ enum: REQUEST_TYPES })
  @IsOptional()
  @IsIn(REQUEST_TYPES)
  type?: RequestType
}

/** Ro'yxat qatori: do'kon, holat va birinchi xabar (qisqacha) */
export class PlatformRequestDto {
  @ApiProperty() id!: string
  @ApiProperty() tenantId!: string
  @ApiProperty({ example: 'Qurilish Mollari' }) tenantName!: string
  @ApiProperty({ enum: TENANT_STATUSES, description: 'Do‘konning joriy holati — `blocked` bo‘lsa yonida «Blokdan chiqarish»' })
  tenantStatus!: TenantStatusName
  @ApiProperty({ enum: REQUEST_TYPES }) type!: RequestType
  @ApiProperty({ enum: REQUEST_STATUSES, description: '`open` — egasi javobini kutmoqda; `answered` — javob berilgan; `closed` — yopilgan' })
  status!: RequestStatus
  @ApiProperty({ nullable: true, type: String, description: 'Administrator ko‘rsatgan aloqa telefoni' }) phone!: string | null
  @ApiProperty({ example: 'Ali Valiyev', description: 'Murojaatni yuborgan administrator' }) authorName!: string
  @ApiProperty({ description: 'Birinchi xabar matni (ro‘yxatda qisqartirib ko‘rsating)' }) message!: string
  @ApiProperty({ description: 'Xabarlar soni (ikkala tomon)' }) messageCount!: number
  @ApiProperty({ type: String, format: 'date-time' }) lastMessageAt!: Date
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) closedAt!: Date | null
}

export class PlatformRequestDetailDto extends PlatformRequestDto {
  @ApiProperty({ type: [TenantRequestMessageDto], description: 'Barcha xabarlar, eskisi birinchi' })
  messages!: TenantRequestMessageDto[]
}

export class ReplyRequestDto {
  @ApiProperty({ maxLength: MAX_REQUEST_MESSAGE_LENGTH, example: 'To‘lov keldi, blokni olib tashladik' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_REQUEST_MESSAGE_LENGTH)
  message!: string
}

export class CloseRequestDto {
  @ApiPropertyOptional({ maxLength: MAX_REQUEST_MESSAGE_LENGTH, description: 'Yakuniy javob (ixtiyoriy) — do‘kon ko‘radi' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_REQUEST_MESSAGE_LENGTH)
  message?: string
}
