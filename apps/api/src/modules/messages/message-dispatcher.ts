import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import type { Env } from '@/config/env.schema'
import { JobQueue } from '@/modules/queue/job-queue'
import { TELEGRAM_CLIENT, TelegramApiError, type TelegramClient } from '@/modules/telegram/telegram.client'
import { markTelegramBlocked } from '@/modules/telegram/telegram.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { SMS_PROVIDER, SmsSendError, type SmsProvider } from './sms/sms.provider'

/** Bir aylanishda bir tenantdan olinadigan qatorlar (provayder cheklovi) */
const BATCH_SIZE = 50
/** Urinishlar: 1 — darhol, keyin 1 va 5 daqiqadan so'ng; undan keyin — `failed` */
export const MAX_ATTEMPTS = 3
const RETRY_DELAYS_SEC = [60, 300] as const
/** Yuborilayotgan qator "ijarasi": ishchi o'lsa, shundan keyin boshqasi oladi */
const LEASE_SEC = 300

interface Claimed {
  id: string
  messageId: string
  channel: 'sms' | 'telegram'
  phone: string
  chatId: bigint | null
  text: string
  attempts: number
}

interface Outcome {
  id: string
  status: 'sent' | 'queued' | 'failed'
  provider_id: string | null
  error: string | null
  retry_in: number
}

export interface DispatchResult {
  sent: number
  retried: number
  failed: number
}

/**
 * Xabar navbati ishchisi (T-077): bazadagi navbatdan (`message_recipients`)
 * oladi, qator kanaliga ko'ra SMS provayderiga yoki Telegram botga (Q116)
 * yuboradi, xatoda keyinroq qayta uradi.
 *
 * - Olish — qisqa tranzaksiyada `FOR UPDATE SKIP LOCKED` bilan va "ijara"
 *   (`next_attempt_at`) qo'yiladi: bir necha instansiya bir qatorni ikki
 *   marta yubormaydi, ishchi o'lsa qator ijara tugagach qaytadi
 * - Yuborish — tranzaksiyadan TASHQARIDA (tashqi HTTP qulf ushlamaydi)
 * - Natija — yana qisqa tranzaksiyada; xabarning umumiy holati yangilanadi
 * - Faqat navbatida ishi bor tenantlar aylanadi (`tenants_with_due_messages`)
 * - Faqat sozlangan kanal qatorlari olinadi: o'chiq kanalniki navbatda kutadi
 * - Telegram'da mijoz botni bloklagan bo'lsa — "bloklagan" deb belgilanadi (keyingisi SMS'ga, bo'lsa)
 */
@Injectable()
export class MessageDispatcher implements OnApplicationBootstrap {
  private readonly logger = new Logger(MessageDispatcher.name)
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly queue: JobQueue,
    @Optional() @Inject(SMS_PROVIDER) private readonly provider: SmsProvider | null,
    @Optional() @Inject(TELEGRAM_CLIENT) private readonly telegram: TelegramClient | null,
  ) {}

  /** Yuborish navbat orqali darhol uyg'otadi; interval — qayta urinishlar va zaxira uchun */
  onApplicationBootstrap(): void {
    const every = this.config.get('SMS_DISPATCH_INTERVAL_MS', { infer: true })
    if ((!this.provider && !this.telegram) || every === 0) return
    this.queue.register('sms-dispatch', () => this.tick())
    this.scheduler.addInterval('sms-dispatch', setInterval(() => void this.tick(), every))
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.dispatch()
    } catch (err) {
      this.logger.error({ err }, 'Xabar navbati aylanishi yiqildi')
    } finally {
      this.running = false
    }
  }

  async dispatch(): Promise<DispatchResult> {
    const total: DispatchResult = { sent: 0, retried: 0, failed: 0 }
    if (!this.provider && !this.telegram) return total
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT tenants_with_due_messages() AS id`
    for (const { id } of tenants) {
      const result = await this.dispatchTenant(id)
      total.sent += result.sent
      total.retried += result.retried
      total.failed += result.failed
    }
    return total
  }

  private async dispatchTenant(tenantId: string): Promise<DispatchResult> {
    // Ikkala kanal sozlangan bo'lsa — filtr yo'q; aks holda faqat sozlangani
    const channelFilter = this.provider && this.telegram ? Prisma.empty : Prisma.sql`AND channel = ${this.provider ? 'sms' : 'telegram'}`
    const claimed = await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.$queryRaw<Claimed[]>`
        UPDATE message_recipients r
           SET status = 'sending', attempts = r.attempts + 1,
               next_attempt_at = now() + make_interval(secs => ${LEASE_SEC})
         WHERE r.id IN (
                 SELECT id FROM message_recipients
                  WHERE tenant_id = ${tenantId}::uuid AND status IN ('queued', 'sending') AND next_attempt_at <= now()
                        ${channelFilter}
                  ORDER BY next_attempt_at
                  LIMIT ${BATCH_SIZE}
                    FOR UPDATE SKIP LOCKED)
        RETURNING r.id, r.message_id AS "messageId", r.channel, r.phone, r.chat_id AS "chatId", r.text, r.attempts`,
    )
    if (claimed.length === 0) return { sent: 0, retried: 0, failed: 0 }

    const outcomes: Outcome[] = []
    const blocked: bigint[] = []
    for (const row of claimed) {
      try {
        outcomes.push({ id: row.id, status: 'sent', provider_id: await this.deliver(row), error: null, retry_in: 0 })
      } catch (err) {
        outcomes.push(this.failure(row, err))
        if (err instanceof TelegramApiError && err.unreachable && row.chatId !== null) blocked.push(row.chatId)
      }
    }

    await this.prisma.inTenantTransaction(tenantId, async (tx) => {
      await tx.$executeRaw`
        UPDATE message_recipients r
           SET status = o.status, provider_id = COALESCE(o.provider_id, r.provider_id), error = o.error,
               sent_at = CASE WHEN o.status = 'sent' THEN now() ELSE r.sent_at END,
               next_attempt_at = now() + make_interval(secs => o.retry_in)
          FROM jsonb_to_recordset(${JSON.stringify(outcomes)}::jsonb)
            AS o(id uuid, status text, provider_id text, error text, retry_in int)
         WHERE r.tenant_id = ${tenantId}::uuid AND r.id = o.id`
      await this.refreshMessages(tx, tenantId, [...new Set(claimed.map((c) => c.messageId))])
      // Mijoz botni bloklagan yoki chat yo'q — xodim ko'radi; keyingi xabarlar SMS'ga (bo'lsa)
      if (blocked.length > 0) await markTelegramBlocked(tx, tenantId, blocked)
    })
    return {
      sent: outcomes.filter((o) => o.status === 'sent').length,
      retried: outcomes.filter((o) => o.status === 'queued').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
    }
  }

  /**
   * Qator kanalida yuboradi; provayderdagi xabar identifikatori qaytadi. Kanal sozlanganligini
   * olish filtri kafolatlaydi. Telegram qatori matni — tayyor HTML karta (`MessagesService`)
   */
  private async deliver(row: Claimed): Promise<string> {
    if (row.channel === 'telegram') {
      const { message_id } = await this.telegram!.sendMessage(Number(row.chatId), row.text, { html: true })
      return String(message_id)
    }
    return (await this.provider!.send(row.phone, row.text)).providerId
  }

  /** Xato: vaqtinchalik bo'lsa va urinish qolgan bo'lsa — keyinroq qayta; aks holda `failed` */
  private failure(row: Claimed, err: unknown): Outcome {
    const retryable = !(err instanceof SmsSendError || err instanceof TelegramApiError) || err.retryable
    const error = err instanceof Error ? err.message.slice(0, 500) : String(err)
    if (retryable && row.attempts < MAX_ATTEMPTS) {
      return { id: row.id, status: 'queued', provider_id: null, error, retry_in: RETRY_DELAYS_SEC[row.attempts - 1] ?? 0 }
    }
    this.logger.warn({ recipient: row.id, channel: row.channel, attempts: row.attempts }, `Xabar yuborilmadi: ${error}`)
    return { id: row.id, status: 'failed', provider_id: null, error, retry_in: 0 }
  }

  /** Xabarning umumiy holati qatorlaridan: yuborilmoqda / yuborildi / qisman / xato */
  private async refreshMessages(tx: TenantTx, tenantId: string, messageIds: string[]): Promise<void> {
    await tx.$executeRaw`
      UPDATE messages m
         SET delivery_status = CASE
               WHEN s.pending > 0 THEN 'sending'
               WHEN s.failed = 0 THEN 'sent'
               WHEN s.sent = 0 THEN 'failed'
               ELSE 'partial' END
        FROM (SELECT message_id,
                     COUNT(*) FILTER (WHERE status IN ('queued', 'sending')) AS pending,
                     COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                     COUNT(*) FILTER (WHERE status = 'sent') AS sent
                FROM message_recipients
               WHERE tenant_id = ${tenantId}::uuid
                 AND message_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(messageIds)}::jsonb)::uuid)
               GROUP BY message_id) s
       WHERE m.tenant_id = ${tenantId}::uuid AND m.id = s.message_id`
  }
}
