import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { Trim } from '@/common/validation/decorators'
import { IsPhone } from '@/common/validation/phone'

/** Murojaat turi: egasi panelida filtr va Telegram xabarida sarlavha */
export const REQUEST_TYPES = ['unblock', 'billing', 'other'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]

/** `open` — do'kon yozdi, egasi javobini kutadi; `answered` — egasi javob berdi; `closed` — yopilgan */
export const REQUEST_STATUSES = ['open', 'answered', 'closed'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const MESSAGE_AUTHORS = ['store', 'platform'] as const
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number]

/** Bitta xabar — qisqa va aniq; uzun hujjat uchun joy emas */
export const MAX_REQUEST_MESSAGE_LENGTH = 1000

const TYPE_DESCRIPTION = '`unblock` — blokdan chiqarish, `billing` — to‘lov masalasi, `other` — boshqa'
const STATUS_DESCRIPTION = '`open` — egasi javobini kutmoqda; `answered` — egasi javob berdi; `closed` — yopilgan (yangi xabar yozilmaydi)'

export class CreateTenantRequestDto {
  @ApiProperty({ enum: REQUEST_TYPES, description: TYPE_DESCRIPTION })
  @IsIn(REQUEST_TYPES)
  type!: RequestType

  @ApiProperty({ maxLength: MAX_REQUEST_MESSAGE_LENGTH, example: 'To‘lovni kecha o‘tkazdik, blokni olib tashlang' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_REQUEST_MESSAGE_LENGTH)
  message!: string

  @ApiPropertyOptional({ example: '+998901234567', description: 'Aloqa telefoni — egasi qo‘ng‘iroq qilishi uchun (ixtiyoriy)' })
  @IsOptional()
  @IsPhone()
  phone?: string
}

export class AddRequestMessageDto {
  @ApiProperty({ maxLength: MAX_REQUEST_MESSAGE_LENGTH })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_REQUEST_MESSAGE_LENGTH)
  message!: string
}

export class TenantRequestMessageDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: MESSAGE_AUTHORS, description: '`store` — do‘kon administratori, `platform` — egasi yoki operator' })
  author!: MessageAuthor
  @ApiProperty({ example: 'Ali Valiyev', description: 'Yozilgan paytdagi ism' }) authorName!: string
  @ApiProperty() body!: string
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

/** Murojaat va uning barcha xabarlari (eskisi birinchi) */
export class TenantRequestDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: REQUEST_TYPES, description: TYPE_DESCRIPTION }) type!: RequestType
  @ApiProperty({ enum: REQUEST_STATUSES, description: STATUS_DESCRIPTION }) status!: RequestStatus
  @ApiProperty({ nullable: true, type: String, description: 'Administrator ko‘rsatgan aloqa telefoni' }) phone!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: String, format: 'date-time', description: 'So‘nggi xabar vaqti (ikkala tomondan)' }) lastMessageAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) closedAt!: Date | null
  @ApiProperty({ type: [TenantRequestMessageDto] }) messages!: TenantRequestMessageDto[]
}
