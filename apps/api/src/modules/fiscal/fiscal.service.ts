import { Inject, Injectable, Optional } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { uuidv7 } from '@/common/ids'
import { JobQueue } from '@/modules/queue/job-queue'
import { onCommit } from '@/prisma/tenant-tx'
import { FISCAL_PROVIDER, type FiscalProvider } from './fiscal.provider'

/**
 * Fiskal navbatga qo'yish (T-129, 08 §8.9). Chek bilan BITTA so'rovda —
 * navbat qatori chek bilan birga saqlanadi yoki birga bekor bo'ladi;
 * OFD ga murojaat esa COMMIT'dan keyin, navbat ishchisida.
 */
@Injectable()
export class FiscalService {
  constructor(
    private readonly queue: JobQueue,
    @Optional() @Inject(FISCAL_PROVIDER) private readonly provider: FiscalProvider | null,
  ) {}

  /** Chek yozuvi CTE'lariga qo'shiladi; `OFD_ENABLED=false` — hech narsa */
  outbox(tenantId: string, saleId: string): Prisma.Sql[] {
    if (!this.provider) return []
    onCommit(() => this.queue.add('fiscalize'))
    return [
      Prisma.sql`fiscal_row AS (
        INSERT INTO fiscal_receipts (id, tenant_id, sale_id) VALUES (${uuidv7()}::uuid, ${tenantId}::uuid, ${saleId}::uuid)
        RETURNING 1)`,
    ]
  }
}
