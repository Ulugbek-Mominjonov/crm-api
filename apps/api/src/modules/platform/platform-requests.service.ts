import { Injectable } from '@nestjs/common'
import { withTenant } from '@/common/context/request-context'
import { toPaged, type Paged } from '@/common/crud/paging'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import type { MessageAuthor, RequestStatus, RequestType, TenantRequestMessageDto } from '@/modules/account/dto/tenant-request.dto'
import type { PlatformContext } from '@/modules/auth/decorators/platform.decorator'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import type { CloseRequestDto, PlatformRequestDetailDto, PlatformRequestDto, PlatformRequestsQueryDto, ReplyRequestDto } from './dto/platform-request.dto'
import type { TenantStatusName } from './dto/platform-tenant.dto'
import { PlatformAuditService } from './platform-audit.service'

/** `platform_requests()` qatori */
interface RequestRow {
  id: string
  tenantId: string
  tenantName: string
  tenantStatus: string
  type: string
  status: string
  phone: string | null
  authorName: string | null
  message: string | null
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  closedAt: Date | null
  total: bigint
}

interface MessageRow {
  id: string
  author: string
  authorName: string
  body: string
  createdAt: Date
}

/**
 * Egasi paneli — do'kon murojaatlari (T-140). Ro'yxat va xabarlar —
 * SECURITY DEFINER funksiyalar (RLS ostidagi jadvaldan tenantlararo
 * o'qish); javob va yopish — o'sha do'konning tranzaksiyasida (blok kabi):
 * xabar, holat, egasi jurnali va realtime hodisa birga saqlanadi.
 * Operator ham javob beradi — murojaat bilan ishlash kundalik ish.
 */
@Injectable()
export class PlatformRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
    private readonly events: DomainEvents,
  ) {}

  async list(query: PlatformRequestsQueryDto): Promise<Paged<PlatformRequestDto>> {
    const rows = await this.rows(null, query, query.pageSize, (query.page - 1) * query.pageSize)
    const total = rows.length > 0 ? Number(rows[0]!.total) : await this.countWhenPageEmpty(query)
    return toPaged(rows.map(toDto), total, query)
  }

  async get(id: string): Promise<PlatformRequestDetailDto> {
    const row = await this.require(id)
    const messages = await this.prisma.$queryRaw<MessageRow[]>`
      SELECT id, author, author_name AS "authorName", body, created_at AS "createdAt" FROM platform_request_messages(${id}::uuid)`
    return { ...toDto(row), messages: messages.map(toMessageDto) }
  }

  /** Javob: do'kon `answered` ko'radi; yana yozsa — `open` */
  async reply(id: string, dto: ReplyRequestDto, admin: PlatformContext): Promise<PlatformRequestDetailDto> {
    const row = await this.requireOpen(id)
    await this.inTenant(row.tenantId, async (tx) => {
      await this.addMessage(tx, row, dto.message, admin)
      await tx.tenantRequest.update({ where: { id }, data: { status: 'answered', lastMessageAt: new Date() } })
      await this.platformAudit.log({ action: 'request.reply', targetTenantId: row.tenantId, entityType: 'tenantRequest', entityId: id, diff: { type: row.type } }, tx)
      this.events.publish('tenant.request', { requestId: id, status: 'answered' })
    })
    return this.get(id)
  }

  /** Yopish (ixtiyoriy yakuniy javob bilan): do'kon unga yozolmaydi, yangisini ochadi */
  async close(id: string, dto: CloseRequestDto, admin: PlatformContext): Promise<PlatformRequestDetailDto> {
    const row = await this.requireOpen(id)
    await this.inTenant(row.tenantId, async (tx) => {
      const now = new Date()
      if (dto.message) await this.addMessage(tx, row, dto.message, admin)
      await tx.tenantRequest.update({ where: { id }, data: { status: 'closed', closedAt: now, ...(dto.message && { lastMessageAt: now }) } })
      await this.platformAudit.log({
        action: 'request.close', targetTenantId: row.tenantId, entityType: 'tenantRequest', entityId: id, diff: { type: row.type, withMessage: !!dto.message },
      }, tx)
      this.events.publish('tenant.request', { requestId: id, status: 'closed' })
    })
    return this.get(id)
  }

  private async addMessage(tx: TenantTx, row: RequestRow, body: string, admin: PlatformContext): Promise<void> {
    await tx.tenantRequestMessage.create({
      data: { id: uuidv7(), tenantId: row.tenantId, requestId: row.id, author: 'platform', authorName: admin.name, body },
    })
  }

  private async requireOpen(id: string): Promise<RequestRow> {
    const row = await this.require(id)
    if (row.status === 'closed') throw new DomainError('INVALID_STATUS_TRANSITION', 'Murojaat allaqachon yopilgan')
    return row
  }

  private async require(id: string): Promise<RequestRow> {
    const [row] = await this.rows(id, {}, 1, 0)
    if (!row) throw new NotFoundError('Murojaat', id)
    return row
  }

  private rows(id: string | null, filter: Pick<PlatformRequestsQueryDto, 'tenantId' | 'status' | 'type'>, limit: number, offset: number): Promise<RequestRow[]> {
    return this.prisma.$queryRaw<RequestRow[]>`
      SELECT id, tenant_id AS "tenantId", tenant_name AS "tenantName", tenant_status AS "tenantStatus", type, status, phone,
             author_name AS "authorName", message, message_count AS "messageCount", last_message_at AS "lastMessageAt",
             created_at AS "createdAt", closed_at AS "closedAt", total
        FROM platform_requests(${id}::uuid, ${filter.tenantId ?? null}::uuid, ${filter.status ?? null}, ${filter.type ?? null},
                               ${limit}::int, ${offset}::int)`
  }

  /** Sahifa bo'sh (chegaradan tashqari) — `total` oynali funksiyadan kelmaydi, birinchi sahifadan olinadi */
  private async countWhenPageEmpty(query: PlatformRequestsQueryDto): Promise<number> {
    if (query.page === 1) return 0
    const [first] = await this.rows(null, query, 1, 0)
    return first ? Number(first.total) : 0
  }

  /** Do'kon ichidagi amal: o'sha do'kon konteksti + tranzaksiyasi */
  private inTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(tenantId, () => this.prisma.inTenantTransaction(tenantId, fn))
  }
}

function toDto({ total: _total, ...row }: RequestRow): PlatformRequestDto {
  return {
    ...row,
    tenantStatus: row.tenantStatus as TenantStatusName,
    type: row.type as RequestType,
    status: row.status as RequestStatus,
    authorName: row.authorName ?? '',
    message: row.message ?? '',
  }
}

function toMessageDto(row: MessageRow): TenantRequestMessageDto {
  return { ...row, author: row.author as MessageAuthor }
}
