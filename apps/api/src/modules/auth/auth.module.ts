import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PlatformCoreModule } from '@/modules/platform/platform-core.module'
import { RolesModule } from '@/modules/roles/roles.module'
import { TelegramModule } from '@/modules/telegram/telegram.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { AuthController } from './auth.controller'
import { RegistrationController } from './registration.controller'
import { AuthService } from './auth.service'
import { PasswordService } from './password.service'
import { RefreshTokenJobs } from './refresh-token.jobs'
import { RefreshTokenService } from './refresh-token.service'
import { TokenService } from './token.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { PermissionsGuard } from './guards/permissions.guard'

@Module({
  // PlatformCoreModule — ro'yxatdan o'tish ochiq/yopiq sozlamasi (T-138); TelegramModule — egasiga xabar (T-137)
  imports: [JwtModule.register({}), TenantsModule, RolesModule, PlatformCoreModule, TelegramModule],
  controllers: [AuthController, RegistrationController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    RefreshTokenService,
    RefreshTokenJobs,
    // Global guard'lar — himoyani unutish mumkin emas.
    // Tartib muhim: avval kim ekanini aniqlaymiz, keyin nimaga haqli ekanini.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PasswordService, TokenService, RefreshTokenService, AuthService],
})
export class AuthModule {}
