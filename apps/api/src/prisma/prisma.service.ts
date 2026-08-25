import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import type { Env } from '@/config/env.schema'

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

  async onModuleInit(): Promise<void> {
    await this.$connect()
    this.logger.log('Bazaga ulanildi')
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
