import { Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { BillingModule } from '@/modules/billing/billing.module'
import { TelegramModule } from '@/modules/telegram/telegram.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { PlatformAdminsController } from './platform-admins.controller'
import { PlatformAdminsService } from './platform-admins.service'
import { PlatformAuthController } from './platform-auth.controller'
import { PlatformAuthGuard } from './platform-auth.guard'
import { PlatformAuthService } from './platform-auth.service'
import { PlatformBillingService } from './platform-billing.service'
import { PlatformBootstrapService } from './platform-bootstrap.service'
import { PlatformController } from './platform.controller'
import { PlatformCoreModule } from './platform-core.module'
import { PlatformRequestsController } from './platform-requests.controller'
import { PlatformRequestsService } from './platform-requests.service'
import { PlatformSessionService } from './platform-session.service'
import { PlatformStatsService } from './platform-stats.service'
import { PlatformTenantsController } from './platform-tenants.controller'
import { PlatformTenantsService } from './platform-tenants.service'

/**
 * Platforma egasi paneli (T-135): do'konlar ustidan nazorat — ro'yxat,
 * ochish, bloklash, tarif va qo'lda to'lov, o'chirish, hisoblar, jurnal.
 * O'z identifikatsiyasi (`platform_admins`), o'z guard'i; tenant konteksti
 * faqat do'kon ichidagi amal uchun va faqat servis ichida. Hisoblar va
 * operatorlar, TOTP, Telegram ulanishi, sozlama — T-137…T-139; do'kon
 * murojaatlari — T-140.
 */
@Module({
  imports: [AuthModule, TenantsModule, BillingModule, TelegramModule, PlatformCoreModule],
  controllers: [PlatformAuthController, PlatformTenantsController, PlatformRequestsController, PlatformAdminsController, PlatformController],
  providers: [
    PlatformAuthGuard,
    PlatformAuthService,
    PlatformSessionService,
    PlatformTenantsService,
    PlatformRequestsService,
    PlatformBillingService,
    PlatformStatsService,
    PlatformAdminsService,
    PlatformBootstrapService,
  ],
})
export class PlatformModule {}
