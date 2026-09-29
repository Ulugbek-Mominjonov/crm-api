import { Inject, Injectable, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, type CustomerGroup, type MessageTarget } from '@prisma/client'
import { currentContext } from '@/common/context/request-context'
import { toPaged, pageArgs, type Paged } from '@/common/crud/paging'
import { withCtes } from '@/common/db/sql'
import { DomainError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { BUSINESS_TIME_ZONE } from '@/common/time'
import type { Env } from '@/config/env.schema'
import { AuditService } from '@/modules/audit/audit.service'
import { JobQueue } from '@/modules/queue/job-queue'
import { SettingsService } from '@/modules/settings/settings.service'
import { TELEGRAM_CLIENT, type TelegramClient } from '@/modules/telegram/telegram.client'
import { storeMessage } from '@/modules/telegram/telegram-texts'
import { unreachableError } from '@/modules/telegram/telegram.service'
import { PlanService } from '@/modules/tenants/plan.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import type { AudiencePreviewDto, MessageAudienceDto, MessageDto, MessageQueryDto, SendMessageDto } from './dto/message.dto'
import { renderTelegram, renderTemplate } from './message-template'
import { SMS_PROVIDER, type SmsProvider } from './sms/sms.provider'

/** Guruh nomlari jurnal yorlig'i uchun (frontend o'z tilida ko'rsatadi) */
const GROUP_LABELS: Readonly<Record<CustomerGroup, string>> = {
  retail: 'Chakana',
  wholesale: 'Ulgurji',
  vip: 'VIP',
}

interface RecipientRow {
  id: string
  name: string
  phone: string
  bonus: bigint
  debt: Prisma.Decimal
  /** Shaxsiy havola orqali botga ulangan mijoz (Q116) */
  chatId: bigint | null
  /** Botni bloklagan — Telegram'da yetib bormaydi */
  blocked: boolean
}

type Channel = 'telegram' | 'sms'

/** Auditoriya kanal bo'yicha: yetib boradiganlar (kanali bilan) va yetib bormaydiganlar */
interface Audience {
  reachable: (RecipientRow & { channel: Channel })[]
  unreachable: RecipientRow[]
}

interface MessageRow {
  id: string
  target: MessageTarget
  recipientLabel: string
  recipients: number
  text: string
  template: string | null
  deliveryStatus: string
  telegram: number
  unreachable: number
  userId: string | null
  createdAt: Date
  queued: bigint
  sent: bigint
  failed: bigint
  logged: bigint
}

/**
 * Xabarlar (T-076…T-078). Qabul qiluvchilar SERVERDA hisoblanadi
 * (mijoz / guruh / qarzdorlar / hammasi), shablon har biri uchun
 * almashtiriladi. Yuborish so'rovni bloklamaydi: qatorlar navbatga
 * (`message_recipients`) yoziladi, ishchi (`MessageDispatcher`) yuboradi.
 *
 * Kanal har qabul qiluvchi uchun (Q116): botga ulangan mijozga — Telegram
 * (bepul, kunlik SMS chegarasiga kirmaydi); aks holda SMS provayderi bo'lsa —
 * SMS; aks holda yetib bormaydi. Bitta mijozga yetib bo'lmasa — 422 (sababi
 * bilan), guruhda — yetib boradiganlarga yuboriladi, qolganlari soni saqlanadi.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly queue: JobQueue,
    private readonly plans: PlanService,
    @Optional() @Inject(SMS_PROVIDER) private readonly provider: SmsProvider | null,
    @Optional() @Inject(TELEGRAM_CLIENT) private readonly telegram: TelegramClient | null,
  ) {}

  async preview(dto: MessageAudienceDto): Promise<AudiencePreviewDto> {
    const { reachable, unreachable } = await this.audience(dto)
    return {
      recipients: reachable.length,
      telegram: reachable.filter((r) => r.channel === 'telegram').length,
      unreachable: unreachable.length,
      label: await this.label(dto),
    }
  }

  /**
   * Xabar va uning qabul qiluvchilari — BITTA so'rov. Kunlik chegara
   * (T-078) yozishdan oldin: bugungi jami + yangi > chegara — 429.
   */
  async send(dto: SendMessageDto): Promise<MessageDto> {
    const { tenantId } = requireTenantTx()
    const { reachable, unreachable } = await this.audience(dto)
    if (reachable.length === 0) throw this.nobodyReachable(dto, unreachable)
    const telegram = reachable.filter((r) => r.channel === 'telegram').length
    await this.assertDailyLimit(reachable.length - telegram)

    const [settings, label] = await Promise.all([this.settings.get(), this.label(dto)])
    const id = uuidv7()
    const rows = reachable.map((r) => {
      const vars = { name: r.name, phone: r.phone, debt: r.debt.toNumber(), bonus: Number(r.bonus), store: settings.storeName }
      const base = { id: uuidv7(), client_id: r.id, phone: r.phone, channel: r.channel }
      // Telegram qatori — tayyor HTML karta (do'kon sarlavhasi, qalin qiymatlar, aloqa): ishchi o'zgartirmay yuboradi
      return r.channel === 'telegram'
        ? { ...base, chat_id: String(r.chatId), text: storeMessage(settings, renderTelegram(dto.text, vars)) }
        : { ...base, chat_id: null, text: renderTemplate(dto.text, vars) }
    })
    await this.prisma.scoped.$executeRaw(
      withCtes(
        [
          Prisma.sql`message AS (
            INSERT INTO messages (id, tenant_id, target, recipient_label, recipients, telegram_recipients,
                                  unreachable_recipients, text, template, delivery_status, user_id)
            VALUES (${id}::uuid, ${tenantId}::uuid, ${dto.target}::"MessageTarget", ${label}, ${rows.length}, ${telegram},
                    ${unreachable.length}, ${dto.text}, ${dto.template ?? null}, 'queued', ${currentContext().userId ?? null}::uuid)
            RETURNING 1)`,
          // chat_id — matn sifatida: JSON'da katta butun son aniqligini yo'qotmasin
          Prisma.sql`queued AS (
            INSERT INTO message_recipients (id, tenant_id, message_id, client_id, phone, channel, chat_id, text, status)
            SELECT r.id, ${tenantId}::uuid, ${id}::uuid, r.client_id, r.phone, r.channel, r.chat_id::bigint, r.text, 'queued'
              FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
                AS r(id uuid, client_id uuid, phone text, channel text, chat_id text, text text)
            RETURNING 1)`,
        ],
        Prisma.sql`SELECT 1`,
      ),
    )
    await this.audit.log({
      action: 'message.send',
      entityType: 'message',
      entityId: id,
      diff: { target: dto.target, recipients: rows.length, telegram, unreachable: unreachable.length, provider: this.provider?.name ?? 'none' },
    })
    // Ishchi darhol uyg'onadi — navbatdagi qatorlar COMMIT'dan keyin ko'rinadi
    onCommit(() => this.queue.add('sms-dispatch'))
    return (await this.page({ page: 1, pageSize: 1 }, id)).items[0]!
  }

  async list(query: MessageQueryDto): Promise<Paged<MessageDto>> {
    return this.page(query)
  }

  /** Xabarlar holat statistikasi bilan — ro'yxat + soni: 2 so'rov */
  private async page(query: { page: number; pageSize: number }, onlyId?: string): Promise<Paged<MessageDto>> {
    const { tenantId } = requireTenantTx()
    const { skip, take } = pageArgs(query)
    const filter = onlyId ? Prisma.sql`AND m.id = ${onlyId}::uuid` : Prisma.empty
    const [rows, [count]] = await Promise.all([
      this.prisma.scoped.$queryRaw<MessageRow[]>`
        SELECT m.id, m.target, m.recipient_label AS "recipientLabel", m.recipients, m.text, m.template,
               m.delivery_status AS "deliveryStatus", m.telegram_recipients AS telegram,
               m.unreachable_recipients AS unreachable, m.user_id AS "userId", m.created_at AS "createdAt",
               COUNT(r.id) FILTER (WHERE r.status IN ('queued', 'sending')) AS queued,
               COUNT(r.id) FILTER (WHERE r.status = 'sent') AS sent,
               COUNT(r.id) FILTER (WHERE r.status = 'failed') AS failed,
               COUNT(r.id) FILTER (WHERE r.status = 'logged') AS logged
          FROM messages m
          LEFT JOIN message_recipients r ON r.tenant_id = m.tenant_id AND r.message_id = m.id
         WHERE m.tenant_id = ${tenantId}::uuid ${filter}
         GROUP BY m.id
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ${take} OFFSET ${skip}`,
      this.prisma.scoped.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM messages m WHERE m.tenant_id = ${tenantId}::uuid ${filter}`,
    ])
    return toPaged(
      rows.map(({ queued, sent, failed, logged, ...m }) => ({
        ...m,
        stats: { queued: Number(queued), sent: Number(sent), failed: Number(failed), logged: Number(logged) },
      })),
      Number(count!.total),
      query,
    )
  }

  /** Auditoriya kanal bo'yicha (Q116) */
  private async audience(dto: MessageAudienceDto): Promise<Audience> {
    const audience: Audience = { reachable: [], unreachable: [] }
    for (const r of await this.recipients(dto)) {
      const channel = this.channelOf(r)
      if (channel) audience.reachable.push({ ...r, channel })
      else audience.unreachable.push(r)
    }
    return audience
  }

  /** Botga ulangan (bloklamagan) — Telegram; aks holda SMS (provayder va telefon bo'lsa); aks holda — yetib bormaydi */
  private channelOf(r: RecipientRow): Channel | null {
    if (this.telegram && r.chatId !== null && !r.blocked) return 'telegram'
    if (this.provider && r.phone !== '') return 'sms'
    return null
  }

  /**
   * Hech kimga yetib bo'lmaydi. Auditoriya bo'sh — 400 (mijoz topilmadi); aks holda 422
   * `RECIPIENT_UNREACHABLE`: bitta mijozda sababi (botga ulanmagan / bloklagan), guruhda — soni
   */
  private nobodyReachable(dto: MessageAudienceDto, unreachable: RecipientRow[]): DomainError {
    if (unreachable.length === 0) {
      return new DomainError('VALIDATION_FAILED', 'Qabul qiluvchi yo‘q (mijoz topilmadi)', [{ field: 'target', code: 'VALIDATION_FAILED' }])
    }
    if (!this.telegram) return unreachableError('no_channel', undefined, { unreachable: unreachable.length })
    if (dto.target === 'customer') return unreachableError(unreachable[0]!.blocked ? 'blocked' : 'not_linked')
    return unreachableError('not_linked', 'Tanlangan mijozlarning hech biri botga ulanmagan', { unreachable: unreachable.length })
  }

  /**
   * Auditoriya — bitta so'rov: o'chirilmagan mijozlar (telefonsizi ham — botga ulangan
   * bo'lishi mumkin); qarz `client_balances` dan (o'zgaruvchi `{debt}` va `debtors` uchun).
   */
  private async recipients(dto: MessageAudienceDto): Promise<RecipientRow[]> {
    const { tenantId } = requireTenantTx()
    const audience =
      dto.target === 'customer' ? Prisma.sql`AND c.id = ${dto.customerId}::uuid`
        : dto.target === 'group' ? Prisma.sql`AND c."group" = ${dto.group}::"CustomerGroup"`
          : dto.target === 'debtors' ? Prisma.sql`AND b.debt > 0`
            : Prisma.empty
    return this.prisma.scoped.$queryRaw<RecipientRow[]>`
      SELECT c.id, c.name, c.phone, c.bonus_points AS bonus, COALESCE(b.debt, 0) AS debt,
             c.telegram_chat_id AS "chatId", c.telegram_blocked_at IS NOT NULL AS blocked
        FROM clients c
        LEFT JOIN client_balances b ON b.tenant_id = c.tenant_id AND b.customer_id = c.id
       WHERE c.tenant_id = ${tenantId}::uuid AND c.deleted_at IS NULL ${audience}
       ORDER BY c.id`
  }

  private async label(dto: MessageAudienceDto): Promise<string> {
    switch (dto.target) {
      case 'customer': {
        const client = await this.prisma.scoped.client.findFirst({ where: { id: dto.customerId }, select: { name: true } })
        return client?.name ?? '—'
      }
      case 'group':
        return `Guruh: ${GROUP_LABELS[dto.group!]}`
      case 'debtors':
        return 'Qarzdorlar'
      case 'all':
        return 'Barcha mijozlar'
    }
  }

  /**
   * Bugungi (Toshkent kuni) SMS + yangi SMS > chegara — 429. Chegara — tarif (T-125) va provayder
   * cheklovi (env) dan kichigi. Faqat Telegram'ga ketadigan xabar tekshirilmaydi
   */
  private async assertDailyLimit(requested: number): Promise<void> {
    if (requested === 0) return
    const { tenantId } = requireTenantTx()
    const { limits } = await this.plans.current()
    const limit = Math.min(this.config.get('SMS_DAILY_LIMIT', { infer: true }), limits.smsPerDay)
    const used = await smsUsedToday(this.prisma.scoped, tenantId)
    if (used + requested > limit) {
      throw new DomainError('MESSAGE_LIMIT_EXCEEDED', `Kunlik chegara ${limit} ta: bugun ${used} ta yuborilgan`, [
        { field: 'target', code: 'MESSAGE_LIMIT_EXCEEDED', meta: { limit, used, requested } },
      ])
    }
  }
}

/** Bugun (Toshkent kuni) navbatga qo'yilgan SMS soni (Telegram'dagilarsiz) — chegara va tarif sahifasi uchun */
export async function smsUsedToday(tx: TenantTx, tenantId: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ used: bigint }[]>`
    SELECT COALESCE(SUM(recipients - telegram_recipients), 0)::bigint AS used
      FROM messages
     WHERE tenant_id = ${tenantId}::uuid
       AND created_at >= (date_trunc('day', now() AT TIME ZONE ${BUSINESS_TIME_ZONE}) AT TIME ZONE ${BUSINESS_TIME_ZONE})`
  return Number(row!.used)
}
