import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { decodeCursor, keysetWhere, toCursorPage, type CursorPage } from '@/common/crud/paging'
import { addDays, businessDayStart } from '@/common/time'
import { PrismaService } from '@/prisma/prisma.service'
import type { AuditEntryDto, AuditQueryDto } from './dto/audit.dto'

const ENTRY_SELECT = {
  id: true, createdAt: true, action: true, detail: true, entityType: true, entityId: true, diff: true,
  user: { select: { id: true, employee: { select: { name: true } } } },
} satisfies Prisma.AuditEntrySelect

type EntryRow = Prisma.AuditEntryGetPayload<{ select: typeof ENTRY_SELECT }>

/**
 * Audit jurnalini o'qish (04 §2: `/audit`, `users` huquqi). Kalitli sahifa
 * `(created_at DESC, id DESC)` — indeks `(tenant_id, created_at)`; jurnal
 * cheksiz o'sadi, chuqur sahifada ham tezlik bir xil (10 §10.5).
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQueryDto): Promise<CursorPage<AuditEntryDto>> {
    const and: Prisma.AuditEntryWhereInput[] = []
    if (query.userId) and.push({ userId: query.userId })
    if (query.group) and.push({ action: { startsWith: `${query.group}.` } })
    if (query.entityId) and.push({ entityId: query.entityId })
    if (query.dateFrom) and.push({ createdAt: { gte: businessDayStart(query.dateFrom) } })
    if (query.dateTo) and.push({ createdAt: { lt: businessDayStart(addDays(query.dateTo, 1)) } })
    if (query.q) {
      and.push({ OR: [{ action: { contains: query.q, mode: 'insensitive' } }, { detail: { contains: query.q, mode: 'insensitive' } }] })
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor)
      and.push(keysetWhere<Prisma.AuditEntryWhereInput>('createdAt', 'desc', new Date(cursor.v), cursor.id))
    }
    const rows = await this.prisma.scoped.auditEntry.findMany({
      where: { AND: and },
      select: ENTRY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    })
    return toCursorPage(rows.map(toEntryDto), query.limit, (e) => ({ v: e.createdAt.toISOString(), id: e.id }))
  }
}

function toEntryDto({ user, diff, ...row }: EntryRow): AuditEntryDto {
  return {
    ...row,
    diff: diff as Record<string, unknown> | null,
    user: user ? { id: user.id, name: user.employee.name } : null,
  }
}
