import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { currentTenantId } from '@/common/context/request-context'
import { dateFromDb, mapNullable, moneyFromDb, moneyToDb } from '@/common/crud/convert'
import { crudDelegate, SoftDeleteCrudService, type CrudDelegate } from '@/common/crud/crud.service'
import { DomainError } from '@/common/errors/domain.error'
import { businessDate } from '@/common/time'
import { PrismaService } from '@/prisma/prisma.service'
import {
  CLIENT_SORT,
  type ClientDto,
  type ClientListQueryDto,
  type ClientStatsDto,
  type CreateClientDto,
  type TelegramStatus,
  type UpdateClientDto,
} from './dto/client.dto'

const CLIENT_SELECT = {
  id: true,
  name: true,
  type: true,
  phone: true,
  email: true,
  status: true,
  group: true,
  bonusPoints: true,
  creditLimit: true,
  paymentTermDays: true,
  source: true,
  company: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  // Chat id tashqariga chiqmaydi — faqat holat (Q116)
  telegramChatId: true,
  telegramBlockedAt: true,
  // Ro'yxatdagi "cheklar soni" — sahifa qatorlari uchun shu so'rovning o'zida
  _count: { select: { sales: { where: { type: 'sale', deletedAt: null } } } },
} satisfies Prisma.ClientSelect

type ClientRow = Prisma.ClientGetPayload<{ select: typeof CLIENT_SELECT }>

/** `telegramStatus` filtri — `toDto` dagi holat bilan bir xil ta'rif */
const TELEGRAM_FILTER: Readonly<Record<TelegramStatus, Prisma.ClientWhereInput>> = {
  none: { telegramChatId: null },
  linked: { telegramChatId: { not: null }, telegramBlockedAt: null },
  blocked: { telegramChatId: { not: null }, telegramBlockedAt: { not: null } },
}

/** `q` da shuncha raqam bo'lsa telefon bo'yicha ham qidiriladi */
const MIN_PHONE_SEARCH_DIGITS = 3

/**
 * Mijozlar.
 *
 * Bonus ballari bu yerda O'ZGARMAYDI — faqat sotuv/qaytarish orqali (I17),
 * aks holda sodiqlik hisobi tekshirib bo'lmaydigan bo'lib qoladi.
 */
@Injectable()
export class ClientsService extends SoftDeleteCrudService<
  ClientRow,
  ClientDto,
  CreateClientDto,
  UpdateClientDto,
  ClientListQueryDto
> {
  protected readonly resource = 'Mijoz'
  protected readonly select = CLIENT_SELECT
  protected readonly sortMap = CLIENT_SORT
  protected readonly defaultSort = '-createdAt'

  constructor(private readonly prisma: PrismaService) {
    super()
  }

  protected delegate(): CrudDelegate<ClientRow> {
    return crudDelegate(this.prisma.scoped.client)
  }

  protected toDto({ _count, telegramChatId, telegramBlockedAt, ...row }: ClientRow): ClientDto {
    return {
      ...row,
      salesCount: _count.sales,
      telegramStatus: telegramChatId === null ? 'none' : telegramBlockedAt ? 'blocked' : 'linked',
      bonusPoints: moneyFromDb(row.bonusPoints),
      creditLimit: mapNullable(row.creditLimit, moneyFromDb) ?? null,
    }
  }

  /**
   * `q` — nom va kompaniya bo'yicha qism (`clients_name_trgm`), raqamlar
   * bo'lsa telefon bo'yicha ham. `phone` — ANIQ moslik: kassada mijozni
   * raqami bilan topish `(tenant_id, phone)` indeksidan foydalanadi.
   */
  protected filters(query: ClientListQueryDto): Prisma.ClientWhereInput {
    const q = query.q
    const digits = q?.replace(/\D/g, '') ?? ''
    return {
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          ...(digits.length >= MIN_PHONE_SEARCH_DIGITS ? [{ phone: { contains: digits } }] : []),
        ],
      }),
      ...(query.phone && { phone: query.phone }),
      ...(query.status && { status: query.status }),
      ...(query.group && { group: query.group }),
      ...(query.type && { type: query.type }),
      ...(query.telegramStatus && TELEGRAM_FILTER[query.telegramStatus]),
    }
  }

  protected createData(dto: CreateClientDto): Omit<Prisma.ClientUncheckedCreateInput, 'tenantId'> {
    return {
      name: dto.name,
      phone: dto.phone,
      type: dto.type,
      email: dto.email ?? '',
      status: dto.status,
      group: dto.group,
      creditLimit: mapNullable(dto.creditLimit, moneyToDb) ?? null,
      paymentTermDays: dto.paymentTermDays ?? null,
      source: dto.source ?? '',
      company: dto.company ?? null,
      notes: dto.notes ?? null,
    }
  }

  protected updateData(dto: UpdateClientDto): Prisma.ClientUncheckedUpdateInput {
    return {
      name: dto.name,
      phone: dto.phone,
      type: dto.type,
      email: dto.email,
      status: dto.status,
      group: dto.group,
      creditLimit: mapNullable(dto.creditLimit, moneyToDb),
      paymentTermDays: dto.paymentTermDays,
      source: dto.source,
      company: dto.company,
      notes: dto.notes,
    }
  }

  /**
   * Mijoz kartasi raqamlari — BITTA agregat so'rov (`sales` ning
   * `(tenant_id, customer_id)` indeksi): brauzer endi cheklarni sanamaydi.
   */
  async stats(id: string): Promise<ClientStatsDto> {
    await this.get(id)
    const tenantId = currentTenantId()
    const [row] = await this.prisma.scoped.$queryRaw<{ spent: bigint; debt: bigint; overdue: bigint; last: Date | null }[]>`
      SELECT COALESCE(SUM(CASE WHEN type = 'sale' THEN total ELSE -total END) FILTER (WHERE status <> 'cancelled'), 0)::bigint AS spent,
             COALESCE(SUM(outstanding) FILTER (WHERE type = 'sale' AND status = 'pending'), 0)::bigint AS debt,
             COALESCE(SUM(outstanding) FILTER (WHERE type = 'sale' AND status = 'pending' AND due_date < ${businessDate()}::date), 0)::bigint AS overdue,
             MAX(date) FILTER (WHERE type = 'sale' AND status <> 'cancelled') AS last
        FROM sales
       WHERE tenant_id = ${tenantId}::uuid AND customer_id = ${id}::uuid AND deleted_at IS NULL`
    return {
      totalSpent: moneyFromDb(row!.spent),
      debt: moneyFromDb(row!.debt),
      overdue: moneyFromDb(row!.overdue),
      lastPurchase: row!.last ? dateFromDb(row!.last) : null,
    }
  }

  /**
   * Qarzi bor mijoz o'chmaydi: nasiya cheki egasiz qolsa qarzni undirib
   * bo'lmaydi. Qarz — I13 formulasi bilan, `sales_open_debt` indeksi bo'yicha.
   */
  protected override async assertDeletable(id: string): Promise<void> {
    const tenantId = currentTenantId()
    const [row] = await this.prisma.scoped.$queryRaw<{ debt: bigint | null }[]>`
      SELECT SUM(total - (paid_cash + paid_card + paid_transfer + debt_paid))::bigint AS debt
        FROM sales
       WHERE tenant_id = ${tenantId}::uuid
         AND customer_id = ${id}::uuid
         AND type = 'sale' AND status = 'pending' AND deleted_at IS NULL`
    const debt = row?.debt ?? 0n
    if (debt > 0n) {
      throw new DomainError('CLIENT_HAS_DEBT', `To‘lanmagan qarz: ${debt} so‘m`, [
        { field: 'id', code: 'CLIENT_HAS_DEBT', meta: { debt: moneyFromDb(debt) } },
      ])
    }
  }
}
