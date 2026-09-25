import { Injectable } from '@nestjs/common'
import { Prisma, type ExpenseCategory, type PayMethod, type RecurrencePeriod } from '@prisma/client'
import { isTemplateDue, periodKey } from '@crm/shared'
import { moneyFromDb } from '@/common/crud/convert'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { withCtes } from '@/common/db/sql'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { businessCalendarDate, businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { CashRegisterService } from '@/modules/cash/cash-register.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type {
  CreateExpenseTemplateDto, ExpenseTemplateDto, UpdateExpenseTemplateDto,
} from './dto/expense.dto'

const RESOURCE = 'Xarajat shabloni'
/** Haftalik shablon kuni: dushanba = 1 … yakshanba = 7 */
const WEEK_DAYS = 7

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  category: true,
  amount: true,
  method: true,
  period: true,
  dayOfPeriod: true,
  active: true,
  lastRunKey: true,
  note: true,
  createdAt: true,
} satisfies Prisma.ExpenseTemplateSelect

type TemplateRecord = Prisma.ExpenseTemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>

interface DueRow {
  id: string
  name: string
  category: ExpenseCategory
  amount: bigint
  method: PayMethod
  period: RecurrencePeriod
  dayOfPeriod: number
  active: boolean
  lastRunKey: string | null
  note: string | null
}

/**
 * Takrorlanuvchi xarajat shablonlari (T-063, I21): bir davrga (oy yoki
 * ISO hafta) BIR marta. Frontendda bu ilova ochilganda ishlardi; serverda —
 * cron (har kuni 00:05, Toshkent vaqti) va qo'lda ishga tushirish.
 */
@Injectable()
export class ExpenseTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly register: CashRegisterService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ExpenseTemplateDto[]> {
    const rows = await this.prisma.scoped.expenseTemplate.findMany({
      where: { deletedAt: null },
      select: TEMPLATE_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
    return rows.map(toTemplateDto)
  }

  async create(dto: CreateExpenseTemplateDto): Promise<ExpenseTemplateDto> {
    const { tenantId } = requireTenantTx()
    assertDay(dto.period, dto.dayOfPeriod)
    const row = await this.prisma.scoped.expenseTemplate
      .create({
        data: {
          tenantId,
          name: dto.name,
          category: dto.category,
          amount: BigInt(dto.amount),
          method: dto.method,
          period: dto.period,
          dayOfPeriod: dto.dayOfPeriod,
          active: dto.active ?? true,
          note: dto.note ?? null,
        },
        select: TEMPLATE_SELECT,
      })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE }))
    await this.audit.log({ action: 'expense-template.create', entityType: 'expense-template', entityId: row.id })
    return toTemplateDto(row)
  }

  async update(id: string, dto: UpdateExpenseTemplateDto): Promise<ExpenseTemplateDto> {
    const current = await this.prisma.scoped.expenseTemplate.findFirst({ where: { id, deletedAt: null }, select: TEMPLATE_SELECT })
    if (!current) throw new NotFoundError(RESOURCE, id)
    assertDay(dto.period ?? current.period, dto.dayOfPeriod ?? current.dayOfPeriod)
    const row = await this.prisma.scoped.expenseTemplate
      .update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.amount !== undefined && { amount: BigInt(dto.amount) }),
          ...(dto.method !== undefined && { method: dto.method }),
          ...(dto.period !== undefined && { period: dto.period }),
          ...(dto.dayOfPeriod !== undefined && { dayOfPeriod: dto.dayOfPeriod }),
          ...(dto.active !== undefined && { active: dto.active }),
          ...(dto.note !== undefined && { note: dto.note }),
        },
        select: TEMPLATE_SELECT,
      })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE, id }))
    await this.audit.log({ action: 'expense-template.update', entityType: 'expense-template', entityId: id })
    return toTemplateDto(row)
  }

  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.scoped.expenseTemplate.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), active: false },
    })
    if (count === 0) throw new NotFoundError(RESOURCE, id)
    await this.audit.log({ action: 'expense-template.delete', entityType: 'expense-template', entityId: id })
  }

  /**
   * Muddati kelgan shablonlar bo'yicha xarajat — JORIY tenant
   * tranzaksiyasida. Yaratilganlar soni qaytadi.
   *
   * I21: shablon qatorlari `FOR UPDATE` bilan qulflanadi — parallel ikkinchi
   * ishga tushirish birinchisi tugashini kutadi va yangilangan `lastRunKey`
   * ni ko'rib, hech narsa yaratmaydi. Qulf tartibi (Q33): registr → shablonlar.
   * Naqd ta'sir faqat ochiq smenada (I9): smena yo'q bo'lsa xarajat yoziladi,
   * kassa o'zgarmaydi (tungi cron vaqtida kassa yopiq — frontend qoidasi).
   */
  async runDue(now: Date = new Date()): Promise<number> {
    const { tenantId } = requireTenantTx()
    const register = await this.register.lock()
    const templates = await this.prisma.scoped.$queryRaw<DueRow[]>`
      SELECT id, name, category, amount, method, period, day_of_period AS "dayOfPeriod", active,
             last_run_key AS "lastRunKey", note
        FROM expense_templates
       WHERE tenant_id = ${tenantId}::uuid AND active AND deleted_at IS NULL
       ORDER BY id
         FOR UPDATE`
    const today = businessCalendarDate(now)
    const due = templates.filter((t) => isTemplateDue({ ...t, lastRunKey: t.lastRunKey ?? undefined }, today))
    if (due.length === 0) return 0

    const shiftId = register.activeShiftId
    const cashTotal = due.reduce((sum, t) => sum + (t.method === 'cash' ? t.amount : 0n), 0n)
    const rows = due.map((t) => ({
      id: uuidv7(),
      template_id: t.id,
      run_key: periodKey(t, today),
      category: t.category,
      amount: String(t.amount),
      method: t.method,
      note: t.note ? `${t.name} — ${t.note}` : t.name,
      shift_id: t.method === 'cash' ? shiftId : null,
    }))
    await this.prisma.scoped.$executeRaw(
      withCtes(
        [
          Prisma.sql`due AS (
            SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
              AS d(id uuid, template_id uuid, run_key text, category text, amount bigint, method text, note text,
                   shift_id uuid))`,
          Prisma.sql`created AS (
            INSERT INTO expenses (id, tenant_id, category, amount, method, date, note, template_id, shift_id)
            SELECT d.id, ${tenantId}::uuid, d.category::"ExpenseCategory", d.amount, d.method::"PayMethod",
                   ${businessDate(now)}::date, d.note, d.template_id, d.shift_id
              FROM due d
            RETURNING 1)`,
          Prisma.sql`marked AS (
            UPDATE expense_templates t SET last_run_key = d.run_key
              FROM due d
             WHERE t.tenant_id = ${tenantId}::uuid AND t.id = d.template_id
            RETURNING 1)`,
          ...(shiftId && cashTotal > 0n ? this.register.cashCtes(shiftId, -cashTotal) : []),
        ],
        Prisma.sql`SELECT 1`,
      ),
    )
    await this.audit.log({
      action: 'expense.recurring',
      entityType: 'expense-template',
      diff: { created: due.length, templates: rows.map((r) => ({ id: r.template_id, period: r.run_key })) },
    })
    return due.length
  }
}

/** Oylik: 1–28 (DTO), haftalik: 1–7 — baza CHECK'i bilan bir xil (I21) */
function assertDay(period: RecurrencePeriod, day: number): void {
  if (period === 'weekly' && day > WEEK_DAYS) {
    throw new DomainError('VALIDATION_FAILED', 'Haftalik shablon kuni 1–7 (dushanba = 1)', [
      { field: 'dayOfPeriod', code: 'VALIDATION_FAILED' },
    ])
  }
}

function toTemplateDto(r: TemplateRecord): ExpenseTemplateDto {
  return { ...r, amount: moneyFromDb(r.amount) }
}
