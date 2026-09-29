import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { CustomerGroup, MessageTarget } from '@prisma/client'
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { Trim } from '@/common/validation/decorators'

/** Bitta SMS ko'pi bilan ~ 4 segment (kirill/lotin aralash matn uchun yetarli) */
export const MAX_MESSAGE_LENGTH = 600

export class MessageAudienceDto {
  @ApiProperty({ enum: MessageTarget, description: 'customer | group | debtors | all' })
  @IsIn(Object.values(MessageTarget))
  target!: MessageTarget

  @ApiPropertyOptional({ format: 'uuid', description: '`target=customer` da majburiy' })
  @ValidateIf((dto: MessageAudienceDto) => dto.target === MessageTarget.customer)
  @IsUUID()
  customerId?: string

  @ApiPropertyOptional({ enum: CustomerGroup, description: '`target=group` da majburiy' })
  @ValidateIf((dto: MessageAudienceDto) => dto.target === MessageTarget.group)
  @IsIn(Object.values(CustomerGroup))
  group?: CustomerGroup
}

export class SendMessageDto extends MessageAudienceDto {
  @ApiProperty({
    example: 'Hurmatli {name}, qarzingiz {debt} so‘m. {store}',
    description: 'O‘zgaruvchilar: {name}, {phone}, {debt}, {bonus}, {store}',
    maxLength: MAX_MESSAGE_LENGTH,
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  text!: string

  @ApiPropertyOptional({ example: 'debt-reminder', description: 'Qaysi shablondan (jurnal uchun)' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  template?: string
}

export class MessageQueryDto extends ListQueryDto {}

export class AudiencePreviewDto {
  @ApiProperty({ example: 42, description: 'Yetib boradiganlar' }) recipients!: number
  @ApiProperty({ example: 12, description: 'Shundan Telegram orqali (botga ulangan mijozlar) — qolgani SMS' }) telegram!: number
  @ApiProperty({ example: 5, description: 'Yetib bormaydiganlar: botga ulanmagan (yoki bloklagan) va SMS yo‘q — yuborilmaydi' })
  unreachable!: number
  @ApiProperty({ example: 'Qarzdorlar' }) label!: string
}

export class MessageStatsDto {
  @ApiProperty() queued!: number
  @ApiProperty() sent!: number
  @ApiProperty() failed!: number
  @ApiProperty({ description: 'Eski (demo rejimdagi) xabarlar: yuborilmagan, faqat jurnalga yozilgan' }) logged!: number
}

export class MessageDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: MessageTarget }) target!: MessageTarget
  @ApiProperty() recipientLabel!: string
  @ApiProperty() recipients!: number
  @ApiProperty() text!: string
  @ApiProperty({ nullable: true, type: String }) template!: string | null
  @ApiProperty({ example: 'queued', description: 'queued | sending | sent | partial | failed | logged' }) deliveryStatus!: string
  @ApiProperty({ example: 12, description: 'Shundan Telegram orqali — kunlik SMS chegarasiga kirmaydi' }) telegram!: number
  @ApiProperty({ example: 5, description: 'Yetib bormaganlar (botga ulanmagan, SMS yo‘q) — `recipients` ga kirmaydi' })
  unreachable!: number
  @ApiProperty({ type: MessageStatsDto }) stats!: MessageStatsDto
  @ApiProperty({ nullable: true, type: String }) userId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

export class MessagePageDto {
  @ApiProperty({ type: [MessageDto] }) items!: MessageDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
}
