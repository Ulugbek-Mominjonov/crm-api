import { setTimeout as sleep } from 'node:timers/promises'
import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { newRequestId, runWithContext } from '@/common/context/request-context'
import type { Env } from '@/config/env.schema'
import { TELEGRAM_CLIENT, TelegramApiError, type TelegramClient } from './telegram.client'
import { TelegramService } from './telegram.service'

/** Uzun so'rov (long polling): Telegram yangilanish bo'lmasa shuncha kutib javob beradi */
const POLL_TIMEOUT_SEC = 25
/** Tarmoq xatosidan keyin qayta urinish */
const POLL_RETRY_MS = 5_000

/**
 * Yangilanishlar manbai (Q116):
 * - `webhook` (production) — ishga tushganda `setWebhook` (manzil + sir);
 *   yangilanishlar `POST /telegram/webhook` ga keladi
 * - `polling` (lokal) — ochiq manzil yo'q: `getUpdates` sikli. Bot'da webhook
 *   o'rnatilgan bo'lsa Telegram rad etadi (409) — lokal uchun ALOHIDA bot kerak
 *   (production webhook'ini o'chirib qo'ymaslik uchun `deleteWebhook` chaqirilmaydi)
 */
@Injectable()
export class TelegramReceiver implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramReceiver.name)
  private readonly stop = new AbortController()
  private polling?: Promise<void>

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly telegram: TelegramService,
    @Optional() @Inject(TELEGRAM_CLIENT) private readonly client: TelegramClient | null,
  ) {}

  /** Webhook o'rnatish ishga tushishni kutdirmaydi: Telegram javob bermasa ham API ko'tariladi (avvalgisi amal qiladi) */
  onApplicationBootstrap(): void {
    const client = this.client
    if (!client) return
    if (this.config.get('TELEGRAM_UPDATES', { infer: true }) === 'polling') {
      this.polling = this.poll(client)
      return
    }
    const url = this.config.get('TELEGRAM_WEBHOOK_URL', { infer: true })
    const secret = this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true })
    if (!url || !secret) return
    client.setWebhook(url, secret).then(
      () => this.logger.log(`Telegram webhook o‘rnatildi: ${url}`),
      (err: unknown) => this.logger.error({ err }, 'Telegram webhook o‘rnatilmadi'),
    )
  }

  async onApplicationShutdown(): Promise<void> {
    this.stop.abort()
    await this.polling
  }

  private async poll(client: TelegramClient): Promise<void> {
    this.logger.log('Telegram: polling rejimi')
    let offset = 0
    while (!this.stop.signal.aborted) {
      try {
        const updates = await client.getUpdates(offset, POLL_TIMEOUT_SEC, this.stop.signal)
        for (const update of updates) {
          offset = update.update_id + 1
          await runWithContext({ requestId: newRequestId() }, () => this.telegram.receive(update))
        }
      } catch (err) {
        if (this.stop.signal.aborted) return
        // Token noto'g'ri, webhook o'rnatilgan (409) — qayta urinish befoyda
        if (err instanceof TelegramApiError && !err.retryable) {
          this.logger.error({ err }, 'Telegram polling to‘xtadi')
          return
        }
        this.logger.warn({ err }, 'Telegram getUpdates yiqildi — qayta urinish')
        // To'xtatilganda uyqu AbortError bilan uziladi — sikl shart bo'yicha tugaydi
        await sleep(POLL_RETRY_MS, undefined, { signal: this.stop.signal }).catch(() => undefined)
      }
    }
  }
}
