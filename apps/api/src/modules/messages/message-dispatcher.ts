import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import type { Env } from '@/config/env.schema'
import { JobQueue } from '@/modules/queue/job-queue'
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
  phone: string
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
 * SMS navbati ishchisi (T-077): bazadagi navbatdan (`message_recipients`)
 * oladi, provayderga yuboradi, xatoda keyinroq qayta uradi.
 *
 * - Olish — qisqa tranzaksiyada `FOR UPDATE SKIP LOCKED` bilan va "ijara"
 *   (`next_attempt_at`) qo'yiladi: bir necha instansiya bir qatorni ikki
 *   marta yubormaydi, ishchi o'lsa qator ijara tugagach qaytadi
 * - Yuborish — tranzaksiyadan TASHQARIDA (tashqi HTTP qulf ushlamaydi)
 * - Natija — yana qisqa tranzaksiyada; xabarning umumiy holati yangilanadi
 * - Faqat navbatida ishi bor tenantlar aylanadi (`tenants_with_due_messages`)
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
  ) {}

  /** Yuborish navbat orqali darhol uyg'otadi; interval — qayta urinishlar va zaxira uchun */
  onApplicationBootstrap(): void {
    const every = this.config.get('SMS_DISPATCH_INTERVAL_MS', { infer: true })
    if (!this.provider || every === 0) return
    this.queue.register('sms-dispatch', () => this.tick())
    this.scheduler.addInterval('sms-dispatch', setInterval(() => void this.tick(), every))
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.dispatch()
    } catch (err) {
      this.logger.error({ err }, 'SMS navbati aylanishi yiqildi')
    } finally {
      this.running = false
    }
  }

  async dispatch(): Promise<DispatchResult> {
    const total: DispatchResult = { sent: 0, retried: 0, failed: 0 }
    if (!this.provider) return total
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT tenants_with_due_messages() AS id`
    for (const { id } of tenants) {
      const result = await this.dispatchTenant(id, this.provider)
      total.sent += result.sent
      total.retried += result.retried
      total.failed += result.failed
    }
    return total
  }

  private async dispatchTenant(tenantId: string, provider: SmsProvider): Promise<DispatchResult> {
    const claimed = await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.$queryRaw<Claimed[]>`
        UPDATE message_recipients r
           SET status = 'sending', attempts = r.attempts + 1,
               next_attempt_at = now() + make_interval(secs => ${LEASE_SEC})
         WHERE r.id IN (
                 SELECT id FROM message_recipients
                  WHERE tenant_id = ${tenantId}::uuid AND status IN ('queued', 'sending') AND next_attempt_at <= now()
                  ORDER BY next_attempt_at
                  LIMIT ${BATCH_SIZE}
                    FOR UPDATE SKIP LOCKED)
        RETURNING r.id, r.message_id AS "messageId", r.phone, r.text, r.attempts`,
    )
    if (claimed.length === 0) return { sent: 0, retried: 0, failed: 0 }

    const outcomes: Outcome[] = []
    for (const row of claimed) outcomes.push(await this.sendOne(provider, row))

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
    })
    return {
      sent: outcomes.filter((o) => o.status === 'sent').length,
      retried: outcomes.filter((o) => o.status === 'queued').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
    }
  }

  private async sendOne(provider: SmsProvider, row: Claimed): Promise<Outcome> {
    try {
      const { providerId } = await provider.send(row.phone, row.text)
      return { id: row.id, status: 'sent', provider_id: providerId, error: null, retry_in: 0 }
    } catch (err) {
      const retryable = !(err instanceof SmsSendError) || err.retryable
      const error = err instanceof Error ? err.message.slice(0, 500) : String(err)
      if (retryable && row.attempts < MAX_ATTEMPTS) {
        return { id: row.id, status: 'queued', provider_id: null, error, retry_in: RETRY_DELAYS_SEC[row.attempts - 1] ?? 0 }
      }
      this.logger.warn({ recipient: row.id, attempts: row.attempts }, `SMS yuborilmadi: ${error}`)
      return { id: row.id, status: 'failed', provider_id: null, error, retry_in: 0 }
    }
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
