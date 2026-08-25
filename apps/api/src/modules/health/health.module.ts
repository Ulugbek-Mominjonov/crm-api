import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'
import { DatabaseCheck } from './checks/database.check'
import { StorageCheck } from './checks/storage.check'
import { READINESS_CHECK, type ReadinessCheck } from './health.types'

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    DatabaseCheck,
    StorageCheck,
    {
      // Tekshiruvlar ro'yxati — yangi bog'liqlik shu yerga qo'shiladi
      provide: READINESS_CHECK,
      inject: [DatabaseCheck, StorageCheck],
      useFactory: (...checks: ReadinessCheck[]): ReadinessCheck[] => checks,
    },
  ],
})
export class HealthModule {}
