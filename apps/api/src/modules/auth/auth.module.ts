import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { PasswordService } from './password.service'
import { RefreshTokenService } from './refresh-token.service'
import { TokenService } from './token.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    RefreshTokenService,
    // Global guard — himoyani unutish mumkin emas
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [PasswordService, TokenService, RefreshTokenService, AuthService],
})
export class AuthModule {}
