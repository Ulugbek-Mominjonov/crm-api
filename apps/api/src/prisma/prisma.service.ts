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

/**
 * Ulanishlar puli chegarasi.
 *
 * Postgres har ulanish uchun alohida jarayon ochadi — 512 MB xotirali
 * instansiyada 20 dan ortiq ulanish xotira muammosiga olib keladi.
 * Chegara URL'da berilmagan bo'lsa shu qiymat qo'yiladi.
 * (core/10-performance.md §10.8)
 */
const DEFAULT_CONNECTION_LIMIT = 10

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
      log:
        config.get('NODE_ENV', { infer: true }) === 'development'
          ? [{ emit: 'event', level: 'query' }]
          : [],
    })
  }

  /**
   * Tenant filtri qo'shilgan mijoz.
   *
   * BARCHA domen so'rovlari SHU orqali bajarilishi kerak. `this` (xom
   * klient) faqat migratsiya, sog'liq tekshiruvi va tizim ishlari uchun.
   */
  get scoped(): ReturnType<typeof buildScoped> {
    this.scopedClient ??= buildScoped(this)
    return this.scopedClient
  }

  private scopedClient?: ReturnType<typeof buildScoped>

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
   * Moliyaviy amallar baribir tranzaksiya talab qiladi — ular RLS'ni
   * qo'shimcha xarajatsiz oladi.
   */
  async inTenantTransaction<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      // Parametrlashtirilgan: `SET LOCAL` o'zgaruvchi qabul qilmaydi,
      // shuning uchun `set_config` funksiyasi ishlatiladi (SQL in'yeksiyasidan xoli)
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      return fn(tx)
    }, { isolationLevel: options?.isolationLevel ?? 'ReadCommitted', timeout: options?.timeout ?? 10_000 })
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
