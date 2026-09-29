import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { Public } from '@/modules/auth/decorators/public.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { TelegramStatusDto } from './dto/telegram.dto'
import type { TelegramUpdate } from './telegram.client'
import { TelegramService } from './telegram.service'

/**
 * Telegram bot (Q116): holat — xodimga (frontend Telegram tugmalarini shunga
 * qarab ko'rsatadi); webhook — faqat Telegram'ga (sir sarlavhada). Mijozning
 * shaxsiy havolasi — `POST /clients/:id/telegram-link`, chek — `POST /sales/:id/receipt/telegram`.
 */
@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get()
  @ApiBearerAuth()
  @RequirePermission('customers', 'view')
  @ApiOperation({
    summary: 'Telegram bot holati',
    description: '`enabled: false` — serverda bot sozlanmagan: «Telegram’ga ulash» va «Chekni Telegram’ga» tugmalarini ko‘rsatmang.',
  })
  @ApiOkResponse({ type: TelegramStatusDto })
  status(): Promise<TelegramStatusDto> {
    return this.telegram.status()
  }

  @Public()
  // Jurnal — servisda (`client.telegramLinked`)
  @AuditedInService()
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Telegram webhook',
    description:
      'Faqat Telegram chaqiradi: `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`, aks holda 401. ' +
      'Qayta ishlash xatosida ham 200 — Telegram yangilanishni qayta-qayta yubormasin.',
  })
  // Tana DTO emas: Telegram Update'da maydonlar ko'p va o'zgarib turadi (`forbidNonWhitelisted` rad etardi).
  // Manba sir bilan tasdiqlanadi, servis faqat kerakli maydonlarni o'qiydi
  @ApiBody({ schema: { type: 'object', description: 'Telegram Update — core.telegram.org/bots/api#update' } })
  async webhook(@Body() update: TelegramUpdate, @Headers('x-telegram-bot-api-secret-token') secret?: string): Promise<void> {
    this.telegram.assertWebhookSecret(secret)
    await this.telegram.receive(update)
  }
}
