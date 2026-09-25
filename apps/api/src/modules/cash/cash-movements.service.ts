import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { currentContext } from '@/common/context/request-context'
import { moneyFromDb } from '@/common/crud/convert'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { withCtes } from '@/common/db/sql'
import { uuidv7 } from '@/common/ids'
import { AuditService } from '@/modules/audit/audit.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import { CashRegisterService } from './cash-register.service'
import type { CashMovementDto, CashMovementInputDto, CashMovementQueryDto } from './dto/cash.dto'

const MOVEMENT_SELECT = {
  id: true, shiftId: true, direction: true, amount: true, reason: true, userId: true, createdAt: true,
} satisfies Prisma.CashMovementSelect

/**
 * Qo'lda naqd kirim/chiqim (T-060): faqat ochiq smenada (I8, I9), sabab
 * majburiy. Harakat, smena kirim/chiqimi va kassa balansi — bitta so'rov.
 */
@Injectable()
export class CashMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly register: CashRegisterService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CashMovementInputDto): Promise<CashMovementDto> {
    const { tenantId } = requireTenantTx()
    const shiftId = this.register.requireOpenShift(await this.register.lock())
    const id = uuidv7()
    const userId = currentContext().userId ?? null
    const delta = BigInt(dto.direction === 'in' ? dto.amount : -dto.amount)

    const [row] = await this.prisma.scoped.$queryRaw<{ createdAt: Date }[]>(
      withCtes(
        [
          Prisma.sql`movement AS (
            INSERT INTO cash_movements (id, tenant_id, shift_id, direction, amount, reason, user_id)
            VALUES (${id}::uuid, ${tenantId}::uuid, ${shiftId}::uuid, ${dto.direction}::"CashDirection",
                    ${dto.amount}::bigint, ${dto.reason}, ${userId}::uuid)
            RETURNING created_at)`,
          ...this.register.cashCtes(shiftId, delta),
        ],
        Prisma.sql`SELECT created_at AS "createdAt" FROM movement`,
      ),
    )
    await this.audit.log({
      action: dto.direction === 'in' ? 'cash.in' : 'cash.out',
      entityType: 'shift',
      entityId: shiftId,
      detail: dto.reason,
      diff: { amount: dto.amount },
    })
    return { id, shiftId, direction: dto.direction, amount: dto.amount, reason: dto.reason, userId, createdAt: row!.createdAt }
  }

  /** Smena harakatlari; `shiftId` berilmasa — joriy smena (yo'q bo'lsa — bo'sh) */
  async list(query: CashMovementQueryDto): Promise<Paged<CashMovementDto>> {
    const { tenantId } = requireTenantTx()
    const shiftId =
      query.shiftId ??
      (await this.prisma.scoped.tenantState.findUniqueOrThrow({ where: { tenantId }, select: { activeShiftId: true } }))
        .activeShiftId
    if (!shiftId) return toPaged([], 0, query)
    const where: Prisma.CashMovementWhereInput = { shiftId }
    const [rows, total] = await Promise.all([
      this.prisma.scoped.cashMovement.findMany({
        where,
        select: MOVEMENT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.scoped.cashMovement.count({ where }),
    ])
    return toPaged(rows.map((r) => ({ ...r, amount: moneyFromDb(r.amount) })), total, query)
  }
}
