import { randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PermissionDeniedError } from '@/common/errors/domain.error'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { PasswordService } from '@/modules/auth/password.service'
import { FILE_RULES, MAGIC_HEAD_BYTES, matchesMagic } from '@/modules/files/file-rules'
import { FilesService } from '@/modules/files/files.service'
import { PlanService } from '@/modules/tenants/plan.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type { MigrationDto, MigrationReportDto, MigrationResultDto, TemporaryPasswordDto } from './dto/migration.dto'
import { insertRows } from './migration.writer'
import {
  counterFloors, planImport, TABLE_ORDER, type ImportPlan, type Issue, type PlanContext, type UniqueKind,
} from './snapshot-plan'

/** Vaqtinchalik parol: 12 belgi, adashtiradigan belgilarsiz (0/O, 1/l) */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const PASSWORD_LENGTH = 12
const DATA_URL = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/

/**
 * localStorage → server migratsiyasi (E14, 07). Tekshirish (dry-run) va
 * import bir xil rejadan (`planImport`) — hisobot aynan yoziladigan
 * narsani ko'rsatadi. Import — BITTA tranzaksiya (yarim ko'chgan do'kon
 * yo'q), jadval uchun bitta ommaviy `INSERT`. Faqat administrator.
 */
@Injectable()
export class MigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly plans: PlanService,
  ) {}

  /** Yozmaydi: nechta yozuv, nima o'tkaziladi/tuzatiladi, serverda nima bor (T-109) */
  async validate(dto: MigrationDto, user: AuthContext): Promise<MigrationReportDto> {
    assertAdmin(user)
    const plan = planImport(dto, await this.context())
    return this.report(plan, await this.existing())
  }

  /**
   * Import (T-108): tartib — spravochnik → hujjat → harakat; qayta
   * yuborish ikkilanmaydi (deterministik id). Keyin rasmlar (T-111) va
   * invariantlarni tiklash (T-110). Import to'xtamaydi — muammo hisobotda;
   * faqat tarif chegarasidan oshsa (foydalanuvchi, ombor) — 402, hech narsa yozilmaydi.
   */
  async import(dto: MigrationDto, user: AuthContext): Promise<MigrationResultDto> {
    assertAdmin(user)
    const existing = await this.existing()
    const plan = planImport(dto, await this.context())
    const tx = this.prisma.scoped
    const { tenantId } = requireTenantTx()
    const usage = await this.plans.lockUsage()

    const credentials = await this.createUsers(tx, plan)
    if (plan.defaultWarehouse) await this.mergeDefaultWarehouse(tx, tenantId, plan.defaultWarehouse)
    for (const table of TABLE_ORDER) {
      // Ketma-ket ATAYLAB: tashqi kalitlar tartibi (07 §7.4) — bir tranzaksiyada
      // eslint-disable-next-line no-await-in-loop
      await insertRows(tx, table, plan.tables[table])
    }
    await this.plans.assertGrowthWithin(usage)
    if (plan.settings && Object.keys(plan.settings).length > 0) await this.applySettings(tx, tenantId, plan)
    await this.reconcile(tx, tenantId, plan)
    await this.migrateImages(plan)

    await this.audit.log({
      action: 'migration.import',
      entityType: 'tenant',
      entityId: tenantId,
      diff: { version: dto.version, exportedAt: dto.exportedAt ?? null, counts: plan.counts, issues: plan.issues.length },
    })
    return { ...this.report(plan, existing), users: credentials }
  }

  // ── Import qadamlari ──────────────────────────────────────────────

  /** Foydalanuvchi + xodim; parol — vaqtinchalik, faqat shu javobda (07 §7.3) */
  private async createUsers(tx: TenantTx, plan: ImportPlan): Promise<TemporaryPasswordDto[]> {
    if (plan.users.length === 0) return []
    const credentials = plan.users.map((u) => ({ email: u.email, password: temporaryPassword() }))
    const hashes = await Promise.all(credentials.map((c) => this.passwords.hash(c.password)))
    await insertRows(tx, 'employees', plan.users.map((u) => u.employee))
    await tx.$executeRaw`
      INSERT INTO users (id, tenant_id, employee_id, email, password_hash, role)
      SELECT u.id, u.tenant_id, u.employee_id, u.email, u.password_hash, u.role
        FROM jsonb_to_recordset(${JSON.stringify(
          plan.users.map((u, i) => ({
            id: u.userId, tenant_id: u.employee.tenant_id, employee_id: u.employee.id, email: u.email,
            password_hash: hashes[i], role: u.role,
          })),
        )}::jsonb) AS u(id uuid, tenant_id uuid, employee_id uuid, email text, password_hash text, role "Role")
      ON CONFLICT DO NOTHING`
    return credentials
  }

  /** Nusxadagi sukut ombor — mavjud sukut omborning nomi/manzili (bitta sukut ombor) */
  private async mergeDefaultWarehouse(tx: TenantTx, tenantId: string, w: NonNullable<ImportPlan['defaultWarehouse']>): Promise<void> {
    await tx.$executeRaw`
      UPDATE warehouses SET name = ${w.name as string}, address = ${w.address as string | null}
       WHERE tenant_id = ${tenantId}::uuid AND is_default
         AND NOT EXISTS (SELECT 1 FROM warehouses o
                          WHERE o.tenant_id = ${tenantId}::uuid AND o.name = ${w.name as string} AND NOT o.is_default)`
  }

  private async applySettings(tx: TenantTx, tenantId: string, plan: ImportPlan): Promise<void> {
    const s = plan.settings!
    const set = Prisma.join(Object.entries(s).map(([column, value]) => Prisma.sql`${Prisma.raw(`"${column}"`)} = ${value}`))
    await tx.$executeRaw`UPDATE settings SET ${set} WHERE tenant_id = ${tenantId}::uuid`
  }

  /**
   * Invariantlarni tiklash (T-110, 07 §7.4): I1 va I2 rejada (qoldiq
   * omborlar bo'yicha, manfiysi 0); I12 — hisoblagich eng katta raqamdan;
   * I8/I9 — ochiq smena va kassa (serverda ochiq smena yo'q bo'lsagina).
   */
  private async reconcile(tx: TenantTx, tenantId: string, plan: ImportPlan): Promise<void> {
    const floors = Object.entries(counterFloors(plan)).map(([prefix, lastNo]) => ({ prefix, last_no: lastNo }))
    await tx.$executeRaw`
      INSERT INTO doc_counters (tenant_id, prefix, last_no)
      SELECT ${tenantId}::uuid, f.prefix, f.last_no
        FROM jsonb_to_recordset(${JSON.stringify(floors)}::jsonb) AS f(prefix text, last_no bigint)
      ON CONFLICT (tenant_id, prefix) DO UPDATE SET last_no = GREATEST(doc_counters.last_no, EXCLUDED.last_no)`
    await tx.$executeRaw`
      UPDATE tenant_state
         SET cash_balance = ${plan.cashBalance}::bigint, active_shift_id = ${plan.activeShiftId}::uuid
       WHERE tenant_id = ${tenantId}::uuid AND active_shift_id IS NULL`
  }

  /**
   * Rasmlar (T-111, 09 §9.14): `dataURL` → S3 (`putDirect`: kvota,
   * takroriylik). Noto'g'ri, katta yoki boshqa tarkibli rasm — o'tkaziladi
   * va hisobotga yoziladi; migratsiya to'xtamaydi.
   */
  private async migrateImages(plan: ImportPlan): Promise<void> {
    const rule = FILE_RULES.product_image
    for (const image of plan.images) {
      const match = DATA_URL.exec(image.dataUrl)
      const mime = match?.[1]
      const body = match ? Buffer.from(match[2]!, 'base64') : undefined
      const reason = !mime || !body ? 'dataURL emas'
        : !rule.mimes.includes(mime) ? `${mime} ruxsat etilmagan`
          : body.length > rule.maxBytes ? `${body.length} bayt — chegaradan katta`
            : !matchesMagic(body.subarray(0, MAGIC_HEAD_BYTES), mime) ? `tarkib ${mime} emas` : undefined
      if (reason) {
        plan.issues.push({ severity: 'warning', entity: 'product', id: image.legacyId, code: 'IMAGE_SKIPPED', detail: reason })
        continue
      }
      // Ketma-ket ATAYLAB: har rasm — S3 yozuvi, bir vaqtda bittadan (xotira)
      // eslint-disable-next-line no-await-in-loop
      const file = await this.files.putDirect('product_image', mime!, body!, `${image.legacyId}.${mime!.split('/')[1]}`)
      // eslint-disable-next-line no-await-in-loop
      await this.prisma.scoped.product.updateMany({ where: { id: image.productId, imageFileId: null }, data: { imageFileId: file.id } })
    }
  }

  // ── Kontekst va hisobot ───────────────────────────────────────────

  private async context(): Promise<PlanContext> {
    const { tenantId } = requireTenantTx()
    const tx = this.prisma.scoped
    const [warehouse, categories, users, state, taken] = await Promise.all([
      tx.warehouse.findFirstOrThrow({ where: { isDefault: true }, select: { id: true } }),
      tx.category.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
      tx.user.findMany({ select: { email: true } }),
      tx.tenantState.findUniqueOrThrow({ where: { tenantId }, select: { activeShiftId: true } }),
      tx.$queryRaw<{ kind: UniqueKind; value: string; id: string }[]>`
        SELECT 'warehouseName' AS kind, name AS value, id FROM warehouses WHERE tenant_id = ${tenantId}::uuid
        UNION ALL SELECT 'sku', sku, id FROM products WHERE tenant_id = ${tenantId}::uuid
        UNION ALL SELECT 'barcode', barcode, id FROM products
                   WHERE tenant_id = ${tenantId}::uuid AND barcode IS NOT NULL AND deleted_at IS NULL
        UNION ALL SELECT 'saleNumber', number, id FROM sales WHERE tenant_id = ${tenantId}::uuid
        UNION ALL SELECT 'quoteNumber', number, id FROM quotes WHERE tenant_id = ${tenantId}::uuid
        UNION ALL SELECT 'poNumber', number, id FROM purchase_orders WHERE tenant_id = ${tenantId}::uuid`,
    ])
    const byKind = Object.fromEntries(
      (['warehouseName', 'sku', 'barcode', 'saleNumber', 'quoteNumber', 'poNumber'] as const).map((k) => [k, new Map<string, string>()]),
    ) as Record<UniqueKind, Map<string, string>>
    for (const t of taken) byKind[t.kind].set(t.value, t.id)
    return {
      tenantId,
      defaultWarehouseId: warehouse.id,
      categories: new Map(categories.map((c) => [c.name, c.id])),
      emails: new Set(users.map((u) => u.email.toLowerCase())),
      taken: byKind,
      openShiftId: state.activeShiftId,
      today: businessDate(),
    }
  }

  /** Serverda allaqachon bor ma'lumot — sehrgar takroriy importdan ogohlantiradi (07 §7.8) */
  private async existing(): Promise<Record<string, number>> {
    const tx = this.prisma.scoped
    const [products, clients, sales] = await Promise.all([tx.product.count(), tx.client.count(), tx.sale.count()])
    return { products, clients, sales }
  }

  private report(plan: ImportPlan, existing: Record<string, number>): MigrationReportDto {
    return {
      valid: !plan.issues.some((i: Issue) => i.severity === 'error'),
      counts: plan.counts,
      accepted: Object.fromEntries(TABLE_ORDER.map((t) => [t, plan.tables[t].length]).filter(([, n]) => n !== 0)),
      existing,
      issues: plan.issues,
    }
  }
}

function assertAdmin(user: AuthContext): void {
  if (user.role !== 'admin') throw new PermissionDeniedError('Ma’lumotni ko‘chirish — faqat administrator')
}

function temporaryPassword(): string {
  const bytes = randomBytes(PASSWORD_LENGTH)
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('')
}
