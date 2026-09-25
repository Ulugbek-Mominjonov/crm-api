import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { BUSINESS_TIME_ZONE, businessDate } from '@/common/time'
import { JobQueue } from '@/modules/queue/job-queue'
import { PrismaService } from '@/prisma/prisma.service'
import { ReportCache } from './report-cache.service'

/**
 * Kunlik hisobot ko'rinishlarini yangilash (T-080) — har kecha 03:30
 * (Toshkent), navbat orqali (T-096): kunlik kalit bilan — bir nechta
 * instansiya cron'i bitta ishga aylanadi. `refresh_report_views()` egasi
 * huquqi bilan ishlaydi va qulf oladi (navbatsiz ham ikki marta yangilanmaydi).
 */
@Injectable()
export class ReportViewJobs implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportViewJobs.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ReportCache,
    private readonly queue: JobQueue,
  ) {}

  onApplicationBootstrap(): void {
    this.queue.register('refresh-report-views', () => this.refresh())
  }

  @Cron('30 3 * * *', { name: 'refresh-report-views', timeZone: BUSINESS_TIME_ZONE })
  schedule(): Promise<void> {
    return this.queue.add('refresh-report-views', {}, { dedupeKey: `refresh-report-views-${businessDate()}` })
  }

  /** `true` — yangilandi; `false` — boshqa instansiya yangilayapti yoki xato */
  async refresh(): Promise<boolean> {
    try {
      const [row] = await this.prisma.$queryRaw<{ refreshed: boolean }[]>`SELECT refresh_report_views() AS refreshed`
      if (!row?.refreshed) {
        this.logger.log('Hisobot ko‘rinishlarini boshqa instansiya yangilayapti — o‘tkazib yuborildi')
        return false
      }
      // Ko'rinishlar o'zgardi — barcha tenant hisobot keshi eskirdi
      this.cache.bumpEpoch()
      return true
    } catch (err) {
      // Monitoringga (Sentry, T-122) log orqali tushadi; hisobot jonli qism bilan to'g'ri qoladi
      this.logger.error({ err }, 'Hisobot ko‘rinishlari yangilanmadi')
      return false
    }
  }
}
