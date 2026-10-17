import { Injectable } from '@nestjs/common'
import { accrualPeriod, proratedSalary, salesBonus, workedDays, type PayrollPeriod } from '@crm/shared'
import { uuidv7 } from '@/common/ids'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'

/** Hisoblash kuni kelgan, shu davr uchun hali hisoblanmagan xodim */
interface Candidate {
  id: string
  salary: number
  salesBonusPct: number
  hiredAt: string
  /** Davr savdosi: sotuvlar − qaytarishlar (asl chek sotuvchisiga) */
  base: number
}

interface NewEntry {
  id: string
  employee_id: string
  type: 'salary' | 'bonus'
  amount: number
  base_amount: number
  rate: number | null
  note: string | null
}

/**
 * Avtomatik hisoblash (T-142): xodimning «hisoblash kuni» kelganda O'TGAN OY
 * uchun maosh (oy ichida ishga kirgan — kunlarga mutanosib) va savdodan
 * bonus (o'tgan oy sotuvlari − qaytarishlar × foiz). Yozuv sanasi — o'tgan
 * oyning oxiri: oy foydasiga shu oy xarajati sifatida tushadi.
 *
 * Davrga BIR marta (I21 kabi): qisman noyob indeks `(xodim, sana, tur) WHERE auto`
 * — parallel ikkinchi ishga tushirish `ON CONFLICT DO NOTHING` bilan hech
 * narsa yaratmaydi; o'chirilgan avtomatik yozuv ham qayta yaratilmaydi
 * (egasi ataylab o'chirgan). Hisob boshlanishidan (`payroll_from`) oldingi
 * oylar — yo'q.
 */
@Injectable()
export class PayrollAccrualService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Muddati kelgan xodimlar — JORIY tenant tranzaksiyasida. Yaratilgan yozuvlar soni qaytadi */
  async runDue(now: Date = new Date()): Promise<number> {
    const { tenantId } = requireTenantTx()
    const today = businessDate(now)
    const period = accrualPeriod(today)
    const dayOfMonth = Number(today.slice(8, 10))
    const candidates = await this.prisma.scoped.$queryRaw<Candidate[]>`
      WITH sold AS (
        -- Davr savdosi sotuvchi bo'yicha; qaytarish — asl chek sotuvchisidan ayriladi.
        -- Bonus foizli xodim bo'lmasa umuman hisoblanmaydi
        SELECT CASE WHEN s.type = 'return' THEN o.seller_id ELSE s.seller_id END AS seller_id,
               SUM(CASE WHEN s.type = 'sale' THEN s.total ELSE -s.total END) AS base
          FROM sales s
          LEFT JOIN sales o ON o.tenant_id = s.tenant_id AND o.id = s.related_sale_id
         WHERE s.tenant_id = ${tenantId}::uuid AND s.status <> 'cancelled' AND s.deleted_at IS NULL
           AND s.date BETWEEN ${period.start}::date AND ${period.end}::date
           AND EXISTS (SELECT 1 FROM employees b
                        WHERE b.tenant_id = ${tenantId}::uuid AND b.deleted_at IS NULL AND b.status = 'active'
                          AND b.sales_bonus_pct > 0)
         GROUP BY 1)
      SELECT e.id, e.salary::float8 AS salary, e.sales_bonus_pct::float8 AS "salesBonusPct",
             to_char(e.hired_at, 'YYYY-MM-DD') AS "hiredAt", COALESCE(b.base, 0)::float8 AS base
        FROM employees e
        LEFT JOIN sold b ON b.seller_id = e.id
       WHERE e.tenant_id = ${tenantId}::uuid AND e.deleted_at IS NULL AND e.status = 'active'
         AND (e.salary > 0 OR e.sales_bonus_pct > 0)
         AND e.salary_day <= ${dayOfMonth}
         AND e.payroll_from <= ${period.end}::date AND e.hired_at <= ${period.end}::date
         AND NOT EXISTS (SELECT 1 FROM payroll_entries p
                          WHERE p.tenant_id = e.tenant_id AND p.employee_id = e.id AND p.auto
                            AND p.date = ${period.end}::date)
       ORDER BY e.id`
    const entries = candidates.flatMap((c) => accrualEntries(c, period))
    if (entries.length === 0) return 0

    const created = await this.prisma.scoped.$executeRaw`
      INSERT INTO payroll_entries (id, tenant_id, employee_id, type, amount, date, auto, base_amount, rate, note)
      SELECT d.id, ${tenantId}::uuid, d.employee_id, d.type::"PayrollEntryType", d.amount, ${period.end}::date, true,
             d.base_amount, d.rate, d.note
        FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb)
          AS d(id uuid, employee_id uuid, type text, amount bigint, base_amount bigint, rate numeric, note text)
      ON CONFLICT (tenant_id, employee_id, date, type) WHERE auto DO NOTHING`
    if (created === 0) return 0

    await this.audit.log({
      action: 'payroll.run',
      entityType: 'payroll-entry',
      detail: `${period.key}: ${created} ta yozuv`,
      diff: {
        period: period.key,
        created,
        entries: entries.map((e) => ({ id: e.id, employeeId: e.employee_id, type: e.type, amount: e.amount })),
      },
    })
    return created
  }
}

/** Xodim uchun davr yozuvlari: maosh (bo'lsa) va bonus (bo'lsa) */
function accrualEntries(c: Candidate, period: PayrollPeriod): NewEntry[] {
  const entries: NewEntry[] = []
  const salary = proratedSalary(c.salary, c.hiredAt, period)
  if (salary > 0) {
    const days = workedDays(c.hiredAt, period)
    entries.push({
      id: uuidv7(),
      employee_id: c.id,
      type: 'salary',
      amount: salary,
      base_amount: c.salary,
      rate: null,
      note: days < period.days ? `${days}/${period.days} kun` : null,
    })
  }
  const bonus = salesBonus(c.base, c.salesBonusPct)
  if (bonus > 0) {
    entries.push({ id: uuidv7(), employee_id: c.id, type: 'bonus', amount: bonus, base_amount: c.base, rate: c.salesBonusPct, note: null })
  }
  return entries
}
