import { Prisma } from '@prisma/client'

/**
 * Davr xarajatlari — foyda hisoboti va bosh sahifa uchun BITTA ta'rif:
 * xarajatlar jurnali + hisoblangan maosh (T-142: maosh, bonus, mukofot;
 * jarima ayiradi) `salary` kategoriyasida. Xodimga to'lovlar (avans, maosh)
 * bu yerga kirmaydi — ular kassa harakati, xarajat hisoblanganda yozilgan.
 * Ustunlar: `date`, `category`, `amount`. Ikkala jadvalda `(tenant_id, date)` indeksi.
 */
export function periodCosts(tenantId: string, from: string, to: string): Prisma.Sql {
  return Prisma.sql`(
    SELECT date, category, amount FROM expenses
     WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
       AND date BETWEEN ${from}::date AND ${to}::date
    UNION ALL
    SELECT date, 'salary'::"ExpenseCategory", CASE WHEN type = 'penalty' THEN -amount ELSE amount END
      FROM payroll_entries
     WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
       AND type IN ('salary', 'bonus', 'award', 'penalty')
       AND date BETWEEN ${from}::date AND ${to}::date)`
}
