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
import { PlanService } from '@/modules/tenants/plan.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import type { AudiencePreviewDto, MessageAudienceDto, MessageDto, MessageQueryDto, SendMessageDto } from './dto/message.dto'
import { renderTemplate } from './message-template'
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
}

interface MessageRow {
  id: string
  target: MessageTarget
  recipientLabel: string
  recipients: number
  text: string
  template: string | null
  deliveryStatus: string
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
 * Provayder `none` — faqat jurnal (demo rejim).
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
  ) {}

  async preview(dto: MessageAudienceDto): Promise<AudiencePreviewDto> {
    const recipients = await this.recipients(dto)
    return { recipients: recipients.length, label: await this.label(dto) }
  }

  /**
   * Xabar va uning qabul qiluvchilari — BITTA so'rov. Kunlik chegara
   * (T-078) yozishdan oldin: bugungi jami + yangi > chegara — 429.
   */
  async send(dto: SendMessageDto): Promise<MessageDto> {
    const { tenantId } = requireTenantTx()
    const recipients = await this.recipients(dto)
    if (recipients.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Qabul qiluvchi yo‘q (telefoni bor mijoz topilmadi)', [
        { field: 'target', code: 'VALIDATION_FAILED' },
      ])
    }
    await this.assertDailyLimit(recipients.length)

    const [settings, label] = await Promise.all([this.settings.get(), this.label(dto)])
    const status = this.provider ? 'queued' : 'logged'
    const id = uuidv7()
    const rows = recipients.map((r) => ({
      id: uuidv7(),
      client_id: r.id,
      phone: r.phone,
      text: renderTemplate(dto.text, {
        name: r.name,
        phone: r.phone,
        debt: r.debt.toNumber(),
        bonus: Number(r.bonus),
        store: settings.storeName,
      }),
    }))
    await this.prisma.scoped.$executeRaw(
      withCtes(
        [
          Prisma.sql`message AS (
            INSERT INTO messages (id, tenant_id, target, recipient_label, recipients, text, template, delivery_status, user_id)
            VALUES (${id}::uuid, ${tenantId}::uuid, ${dto.target}::"MessageTarget", ${label}, ${rows.length}, ${dto.text},
                    ${dto.template ?? null}, ${status}, ${currentContext().userId ?? null}::uuid)
            RETURNING 1)`,
          Prisma.sql`queued AS (
            INSERT INTO message_recipients (id, tenant_id, message_id, client_id, phone, text, status)
            SELECT r.id, ${tenantId}::uuid, ${id}::uuid, r.client_id, r.phone, r.text, ${status}
              FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(id uuid, client_id uuid, phone text, text text)
            RETURNING 1)`,
        ],
        Prisma.sql`SELECT 1`,
      ),
    )
    await this.audit.log({
      action: 'message.send',
      entityType: 'message',
      entityId: id,
      diff: { target: dto.target, recipients: rows.length, provider: this.provider?.name ?? 'none' },
    })
    // Ishchi darhol uyg'onadi — navbatdagi qatorlar COMMIT'dan keyin ko'rinadi
    if (this.provider) onCommit(() => this.queue.add('sms-dispatch'))
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
               m.delivery_status AS "deliveryStatus", m.user_id AS "userId", m.created_at AS "createdAt",
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

  /**
   * Qabul qiluvchilar — bitta so'rov: telefoni bor, o'chirilmagan mijozlar;
   * qarz `client_balances` dan (o'zgaruvchi `{debt}` va `debtors` uchun).
   */
  private async recipients(dto: MessageAudienceDto): Promise<RecipientRow[]> {
    const { tenantId } = requireTenantTx()
    const audience =
      dto.target === 'customer' ? Prisma.sql`AND c.id = ${dto.customerId}::uuid`
        : dto.target === 'group' ? Prisma.sql`AND c."group" = ${dto.group}::"CustomerGroup"`
          : dto.target === 'debtors' ? Prisma.sql`AND b.debt > 0`
            : Prisma.empty
    return this.prisma.scoped.$queryRaw<RecipientRow[]>`
      SELECT c.id, c.name, c.phone, c.bonus_points AS bonus, COALESCE(b.debt, 0) AS debt
        FROM clients c
        LEFT JOIN client_balances b ON b.tenant_id = c.tenant_id AND b.customer_id = c.id
       WHERE c.tenant_id = ${tenantId}::uuid AND c.deleted_at IS NULL AND c.phone <> '' ${audience}
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

  /** Bugungi (Toshkent kuni) yuborilgan + yangi > chegara — 429. Chegara — tarif (T-125) va provayder cheklovi (env) dan kichigi */
  private async assertDailyLimit(requested: number): Promise<void> {
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

/** Bugun (Toshkent kuni) navbatga qo'yilgan SMS soni — chegara va tarif sahifasi uchun */
export async function smsUsedToday(tx: TenantTx, tenantId: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ used: bigint }[]>`
    SELECT COALESCE(SUM(recipients), 0)::bigint AS used
      FROM messages
     WHERE tenant_id = ${tenantId}::uuid
       AND created_at >= (date_trunc('day', now() AT TIME ZONE ${BUSINESS_TIME_ZONE}) AT TIME ZONE ${BUSINESS_TIME_ZONE})`
  return Number(row!.used)
}
