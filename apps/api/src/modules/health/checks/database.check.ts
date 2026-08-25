import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import type { ReadinessCheck } from '../health.types'

/** Baza javob berayotganini eng arzon so'rov bilan tekshiradi. */
@Injectable()
export class DatabaseCheck implements ReadinessCheck {
  readonly name = 'database'

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`
  }
}
