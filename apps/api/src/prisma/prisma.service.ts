import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, PrismaClient } from '@prisma/client'
import type { Env } from '@/config/env.schema'
import { tenantExtension } from './tenant.extension'
import { currentTenantTx, MissingTenantTransactionError, runInTenantTx, type AfterCommitHook } from './tenant-tx'

/**
 * Ulanishlar puli chegarasi.
 *
 * Postgres har ulanish uchun alohida jarayon ochadi — 512 MB xotirali
 * instansiyada 20 dan ortiq ulanish xotira muammosiga olib keladi.
 * Chegara URL'da berilmagan bo'lsa shu qiymat qo'yiladi.
 * (core/10-performance.md §10.8)
 */
const DEFAULT_CONNECTION_LIMIT = 10

/**
 * So'rov hodisalari yoqiladigan muhitlar: dev'da kuzatish uchun, testda
 * so'rov byudjetini sanash uchun (core/10-performance.md §10.10).
 * Production'da o'chiq — har so'rovga ortiqcha ish qo'shmasin.
 */
const QUERY_EVENT_ENVS: ReadonlySet<Env['NODE_ENV']> = new Set(['development', 'test'])

/** Tranzaksiya chegarasi: undan uzoq ushlangan qulflar boshqalarni to'sadi */
const DEFAULT_TX_TIMEOUT_MS = 10_000
/**
 * Puldan bo'sh ulanish kutish. Prisma sukuti (2 s) yuklama cho'qqisida
 * so'rovni keraksiz yiqitardi — so'rov tranzaksiyasi ulanishni butun
 * so'rov davomida ushlaydi.
 */
const DEFAULT_TX_MAX_WAIT_MS = 10_000

export interface TenantTxOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel
  timeout?: number
  maxWait?: number
}

/** URL'da `connection_limit` bo'lmasa qo'shadi, bo'lsa tegmaydi. */
export function withConnectionLimit(url: string, limit: number): string {
  if (url.includes('connection_limit=')) return url
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${limit}`
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name)

  constructor(config: ConfigService<Env, true>) {
    const url = withConnectionLimit(
      config.get('DATABASE_URL', { infer: true }),
      DEFAULT_CONNECTION_LIMIT,
    )
    super({
      datasources: { db: { url } },
      log: QUERY_EVENT_ENVS.has(config.get('NODE_ENV', { infer: true }))
        ? [{ emit: 'event', level: 'query' }]
        : [],
    })
  }

  /**
   * JORIY tenant tranzaksiyasidagi mijoz: tenant filtri (2-qatlam) va
   * `app.tenant_id` (3-qatlam, RLS) bilan.
   *
   * BARCHA domen so'rovlari SHU orqali bajariladi. HTTP so'rovida
   * tranzaksiyani `TenantTransactionInterceptor` ochadi; fon ishlarida —
   * `inTenantTransaction`. Tranzaksiya bo'lmasa XATO: production'da
   * (`crm_app`) bunday so'rov RLS tufayli jimgina bo'sh natija berardi.
   *
   * `this` (xom klient) faqat tenantdan tashqari ishlar uchun: migratsiya,
   * sog'liq tekshiruvi, global jadvallar (`tenants`, `refresh_tokens`).
   */
  get scoped(): TenantTx {
    const state = currentTenantTx()
    if (!state) throw new MissingTenantTransactionError()
    return state.tx as TenantTx
  }

  /** Kengaytma qo'llangan mijoz — tranzaksiyalar SHU ustida ochiladi */
  private get extended(): ScopedClient {
    this.extendedClient ??= buildScoped(this)
    return this.extendedClient
  }

  private extendedClient?: ScopedClient

  async onModuleInit(): Promise<void> {
    await this.$connect()
    this.logger.log('Bazaga ulanildi')
  }

  /**
   * Tenant kontekstidagi TRANZAKSIYA.
   *
   * `SET LOCAL app.tenant_id` qo'yiladi — shundan keyin RLS siyosatlari
   * ishlaydi va ilova kodidagi xato ham boshqa tenant qatoriga tegolmaydi.
   *
   * NEGA aynan tranzaksiya: ulanishlar puli ulashiladi, `SET` (LOCAL'siz)
   * esa ulanishda qolib ketib, keyingi so'rovga o'tib ketardi. `SET LOCAL`
   * tranzaksiya tugashi bilan bekor bo'ladi.
   *
   * Tranzaksiya kengaytirilgan mijoz ustida ochiladi: ichkarida ham
   * `tenantId` avtomatik qo'shiladi (2-qatlam), ya'ni uch qatlam birga.
   *
   * Tashqi tranzaksiya (HTTP so'rovi) bo'lsa — unga QO'SHILADI: Prisma
   * ichma-ich tranzaksiyani qo'llamaydi, amal esa baribir so'rov bilan
   * birga saqlanishi yoki bekor bo'lishi kerak. Bu holda `options`
   * e'tiborsiz — tashqi tranzaksiyaniki amal qiladi.
   */
  async inTenantTransaction<T>(
    tenantId: string,
    fn: (tx: TenantTx) => Promise<T>,
    options?: TenantTxOptions,
  ): Promise<T> {
    const outer = currentTenantTx()
    if (outer) {
      if (outer.tenantId !== tenantId) {
        throw new Error('Boshqa tenant tranzaksiyasi ichida — bu dasturchi xatosi')
      }
      return fn(outer.tx as TenantTx)
    }

    const afterCommit: AfterCommitHook[] = []
    const result = await this.extended.$transaction(
      async (tx) => {
        // Parametrlashtirilgan: `SET LOCAL` o'zgaruvchi qabul qilmaydi,
        // shuning uchun `set_config` funksiyasi ishlatiladi (SQL in'yeksiyasidan xoli)
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
        // `async` MUHIM: `fn` kechiktirilgan PrismaPromise qaytarishi mumkin —
        // u shu ALS doirasi ICHIDA kutilishi kerak (aks holda tenant yo'qoladi)
        return runInTenantTx({ tenantId, tx, afterCommit }, async () => fn(tx))
      },
      {
        // Berilmasa Postgres sukuti (READ COMMITTED): aniq qiymat Prisma'ni
        // har tranzaksiyada ortiqcha `SET TRANSACTION` yuborishga majbur qiladi
        isolationLevel: options?.isolationLevel,
        timeout: options?.timeout ?? DEFAULT_TX_TIMEOUT_MS,
        maxWait: options?.maxWait ?? DEFAULT_TX_MAX_WAIT_MS,
      },
    )
    this.runAfterCommit(tenantId, afterCommit)
    return result
  }

  /**
   * COMMIT'dan keyingi amallar javobni KUTDIRMAYDI va uni yiqitmaydi:
   * ma'lumot allaqachon saqlangan, xabar berish — ikkilamchi. Xato loglanadi.
   */
  private runAfterCommit(tenantId: string, hooks: readonly AfterCommitHook[]): void {
    for (const hook of hooks) {
      Promise.resolve()
        .then(hook)
        .catch((err: unknown) => this.logger.error({ err, tenantId }, 'COMMIT’dan keyingi amal yiqildi'))
    }
  }

  /**
   * Fon ishi har do'kon uchun: ALOHIDA tenant tranzaksiyasi (RLS ostida
   * boshqa tenant ma'lumoti ko'rinmaydi). Ketma-ket ATAYLAB — tunlik
   * ishlar bazani cho'qqi yuk bilan to'ldirmasin. Bitta do'kondagi xato
   * qolganlarini to'xtatmaydi: xatolar yig'ilib, oxirida qaytariladi.
   */
  async forEachTenant(
    fn: (tx: TenantTx, tenantId: string) => Promise<void>,
  ): Promise<{ tenantId: string; error: unknown }[]> {
    const tenants = await this.tenant.findMany({ select: { id: true }, orderBy: { id: 'asc' } })
    const failures: { tenantId: string; error: unknown }[] = []
    for (const { id } of tenants) {
      try {
        await this.inTenantTransaction(id, (tx) => fn(tx, id))
      } catch (error) {
        failures.push({ tenantId: id, error })
      }
    }
    return failures
  }

  /**
   * Ulanishlar yopilishi SHART: aks holda `SIGTERM` dan keyin jarayon
   * osilib qoladi va deploy paytida eski instansiya o'chmaydi.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
    this.logger.log('Baza ulanishi yopildi')
  }
}

/** Kengaytma qo'llangan mijoz — tip chiqarish uchun alohida funksiya */
function buildScoped(client: PrismaClient) {
  return client.$extends(tenantExtension)
}

export type ScopedClient = ReturnType<typeof buildScoped>

/** `inTenantTransaction` ichidagi mijoz: tenant filtri + RLS konteksti bilan */
export type TenantTx = Parameters<Parameters<ScopedClient['$transaction']>[0]>[0]
