import { ApiProperty } from '@nestjs/swagger'

/** Bot holati — frontend Telegram tugmalarini shunga qarab ko'rsatadi */
export class TelegramStatusDto {
  @ApiProperty({ description: 'Bot sozlanganmi (serverda `TELEGRAM_BOT_TOKEN`)' }) enabled!: boolean
  @ApiProperty({ nullable: true, type: String, example: 'dokon_xabar_bot' }) botUsername!: string | null
}

/** Mijozning shaxsiy havolasi — frontend undan QR kod chizadi */
export class TelegramLinkDto {
  @ApiProperty({
    example: 'https://t.me/dokon_xabar_bot?start=Xq3v9Kp2LmN8rT5wYz1AbC',
    description: 'Mijoz ochib Start bosadi — shu mijozga bog‘lanadi. Bir martalik; yangisi eskisini bekor qiladi',
  })
  link!: string

  @ApiProperty({ type: String, format: 'date-time', description: 'Shu vaqtgacha amal qiladi (7 kun)' })
  expiresAt!: Date
}
