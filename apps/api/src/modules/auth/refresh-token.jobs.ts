import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { BUSINESS_TIME_ZONE } from '@/common/time'
import { PrismaService } from '@/prisma/prisma.service'
import { RefreshTokenService } from './refresh-token.service'

/**
 * Muddati o'tgan refresh tokenlarni tozalash — har kuni 03:40 (Toshkent).
 * Har yangilanish yangi qator yozadi (rotatsiya): tozalanmasa jadval
 * sessiyalar soniga qarab cheksiz o'sadi. Global jadvallar (tenantsiz),
 * bitta DELETE — `expires_at` indeksi bilan.
 */
@Injectable()
export class RefreshTokenJobs {
  private readonly logger = new Logger(RefreshTokenJobs.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly refresh: RefreshTokenService,
  ) {}

  @Cron('40 3 * * *', { name: 'refresh-tokens-purge', timeZone: BUSINESS_TIME_ZONE })
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const [store, platform] = await Promise.all([
      this.refresh.purgeExpired(now),
      this.prisma.platformRefreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    ])
    const removed = store + platform.count
    if (removed > 0) this.logger.log({ store, platform: platform.count }, 'Muddati o‘tgan sessiyalar tozalandi')
    return removed
  }
}
