import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { OwnerNotifierService } from '@/modules/telegram/owner-notifier.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import { assertAdmin } from './account.service'
import type { AddRequestMessageDto, CreateTenantRequestDto, MessageAuthor, RequestStatus, RequestType, TenantRequestDto } from './dto/tenant-request.dto'

const MESSAGE_SELECT = { id: true, author: true, authorName: true, body: true, createdAt: true } satisfies Prisma.TenantRequestMessageSelect
const REQUEST_SELECT = {
  id: true, type: true, status: true, phone: true, createdAt: true, lastMessageAt: true, closedAt: true,
  messages: { select: MESSAGE_SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.TenantRequestSelect

type RequestRow = Prisma.TenantRequestGetPayload<{ select: typeof REQUEST_SELECT }>

/** Do'kon o'z tarixidan ko'radigan murojaatlar soni (eng yangilari) */
const HISTORY_LIMIT = 20
/** Do'kon 24 soatda yozadigan xabarlar chegarasi — spamga qarshi */
export const STORE_MESSAGES_PER_DAY = 5
const DAY_MS = 86_400_000

/**
 * Do'kon murojaati platforma egasiga (T-140): bloklangan do'kon telefonga
 * javob bo'lmasa ham tizim ichidan yozadi — xabar yo'qolmaydi, egasiga
 * Telegram orqali darhol yetadi, javob shu yerda ko'rinadi. Faqat
 * administrator; faqat-o'qish holatida ham ishlaydi (asosiy maqsad shu).
 * Bir vaqtda bitta yopilmagan murojaat (qisman noyob indeks) — qo'shimcha
 * gap o'shanga yoziladi. Egasi javobi va yopish — `PlatformRequestsService`.
 */
@Injectable()
export class TenantRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ownerNotifier: OwnerNotifierService,
  ) {}

  async list(user: AuthContext): Promise<TenantRequestDto[]> {
    assertAdmin(user)
    const rows = await this.prisma.scoped.tenantRequest.findMany({ select: REQUEST_SELECT, orderBy: { createdAt: 'desc' }, take: HISTORY_LIMIT })
    return rows.map(toDto)
  }

  async create(dto: CreateTenantRequestDto, user: AuthContext): Promise<TenantRequestDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    const tx = this.prisma.scoped
    const open = await tx.tenantRequest.findFirst({ where: { status: { not: 'closed' } }, select: { id: true } })
    if (open) throw openRequestError(open.id)
    await this.assertDailyLimit(tx)
    const authorName = await this.authorName(tx, user.userId)
    const id = uuidv7()
    // Oldindan tekshirish poygada ikkinchisini o'tkazib yuborishi mumkin — noyob indeks to'xtatadi
    const request = await tx.tenantRequest
      .create({ data: { id, tenantId, type: dto.type, phone: dto.phone ?? null }, select: { ...REQUEST_SELECT, messages: false } })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: 'Murojaat' }))
    const message = await tx.tenantRequestMessage.create({
      data: { id: uuidv7(), tenantId, requestId: id, author: 'store', authorName, body: dto.message },
      select: MESSAGE_SELECT,
    })
    await this.audit.log({ action: 'tenant.requestSent', entityType: 'tenantRequest', entityId: id, diff: { type: dto.type } })
    onCommit(() => this.ownerNotifier.requestCreated({ tenantId, type: dto.type, authorName, phone: dto.phone ?? null, message: dto.message }))
    return toDto({ ...request, messages: [message] })
  }

  /** Yopilmagan murojaatga qo'shimcha xabar — egasi yana kutayotganlar ro'yxatida ko'radi (`open`) */
  async addMessage(requestId: string, dto: AddRequestMessageDto, user: AuthContext): Promise<TenantRequestDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    const tx = this.prisma.scoped
    const request = await tx.tenantRequest.findFirst({ where: { id: requestId }, select: { status: true, type: true } })
    if (!request) throw new NotFoundError('Murojaat', requestId)
    if (request.status === 'closed') throw new DomainError('INVALID_STATUS_TRANSITION', 'Murojaat yopilgan — yangisini yuboring')
    await this.assertDailyLimit(tx)
    const authorName = await this.authorName(tx, user.userId)
    await tx.tenantRequestMessage.create({ data: { id: uuidv7(), tenantId, requestId, author: 'store', authorName, body: dto.message } })
    const row = await tx.tenantRequest.update({ where: { id: requestId }, data: { status: 'open', lastMessageAt: new Date() }, select: REQUEST_SELECT })
    onCommit(() => this.ownerNotifier.requestMessage({ tenantId, type: request.type as RequestType, authorName, message: dto.message }))
    return toDto(row)
  }

  private async assertDailyLimit(tx: TenantTx): Promise<void> {
    const used = await tx.tenantRequestMessage.count({ where: { author: 'store', createdAt: { gte: new Date(Date.now() - DAY_MS) } } })
    if (used < STORE_MESSAGES_PER_DAY) return
    throw new DomainError('MESSAGE_LIMIT_EXCEEDED', `Egasiga 24 soatda ko‘pi bilan ${STORE_MESSAGES_PER_DAY} ta xabar yoziladi`, [
      { code: 'MESSAGE_LIMIT_EXCEEDED', meta: { limit: STORE_MESSAGES_PER_DAY, used } },
    ])
  }

  /** Xabarda ism — yozilgan paytdagisi (hisob keyin o'chsa ham qoladi) */
  private async authorName(tx: TenantTx, userId: string): Promise<string> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { employee: { select: { name: true } } } })
    return user.employee.name
  }
}

function openRequestError(requestId: string): DomainError {
  return new DomainError('ALREADY_EXISTS', 'Ochiq murojaat bor — xabarni unga yozing', [{ code: 'ALREADY_EXISTS', meta: { requestId } }])
}

function toDto(row: RequestRow): TenantRequestDto {
  return {
    ...row,
    type: row.type as RequestType,
    status: row.status as RequestStatus,
    messages: row.messages.map((m) => ({ ...m, author: m.author as MessageAuthor })),
  }
}
