import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { tryContext } from '@/common/context/request-context'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { redact } from '@/common/logging/redaction'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import type { PlatformAuditEntryDto, PlatformAuditQueryDto } from './dto/platform-audit.dto'

export interface PlatformAuditInput {
  action: string
  targetTenantId?: string
  entityType?: string
  entityId?: string
  diff?: Prisma.InputJsonValue
  /** Kontekstda egasi bo'lmaganda (kirish, bootstrap) aniq beriladi */
  adminId?: string | null
  ip?: string
}

const ENTRY_SELECT = {
  id: true, action: true, targetTenantId: true, entityType: true, entityId: true, diff: true, createdAt: true,
  admin: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PlatformAuditEntrySelect

type EntryRow = Prisma.PlatformAuditEntryGetPayload<{ select: typeof ENTRY_SELECT }>

/**
 * Egasi amallari jurnali (T-135) — global, faqat qo'shiladi (trigger).
 * Do'kon ichidagi amal (blok, tarif, parol) o'sha do'konning o'z
 * jurnaliga ham tushadi (`AuditService`, «Platforma» sifatida) — bu yerda
 * esa egasi uchun umumiy tarix. `tx` berilsa amal bilan birga saqlanadi.
 */
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: PlatformAuditInput, tx?: TenantTx): Promise<void> {
    const client = tx ?? this.prisma
    await client.platformAuditEntry.create({
      data: {
        adminId: input.adminId === undefined ? (tryContext()?.platformAdminId ?? null) : input.adminId,
        action: input.action,
        targetTenantId: input.targetTenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        diff: input.diff ? (redact(input.diff) as Prisma.InputJsonValue) : undefined,
        ip: input.ip,
      },
    })
  }

  async list(query: PlatformAuditQueryDto): Promise<Paged<PlatformAuditEntryDto>> {
    const where: Prisma.PlatformAuditEntryWhereInput = {
      ...(query.tenantId && { targetTenantId: query.tenantId }),
      ...(query.group && { action: { startsWith: `${query.group}.` } }),
    }
    const [rows, total] = await Promise.all([
      this.prisma.platformAuditEntry.findMany({ where, select: ENTRY_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageArgs(query) }),
      this.prisma.platformAuditEntry.count({ where }),
    ])
    const names = await this.tenantNames(rows)
    return toPaged(rows.map((r) => toDto(r, names)), total, query)
  }

  /** O'chirilgan do'kon nomi topilmaydi — `null` (id qoladi) */
  private async tenantNames(rows: EntryRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.flatMap((r) => (r.targetTenantId ? [r.targetTenantId] : [])))]
    if (ids.length === 0) return new Map()
    const tenants = await this.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    return new Map(tenants.map((t) => [t.id, t.name]))
  }
}

function toDto(row: EntryRow, names: Map<string, string>): PlatformAuditEntryDto {
  return {
    id: row.id,
    action: row.action,
    admin: row.admin,
    targetTenantId: row.targetTenantId,
    targetTenantName: row.targetTenantId ? (names.get(row.targetTenantId) ?? null) : null,
    entityType: row.entityType,
    entityId: row.entityId,
    diff: row.diff,
    createdAt: row.createdAt,
  }
}
