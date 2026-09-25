import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse,
  ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { clearRefreshCookie, readRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './auth-cookies'
import { AllowReadOnlyTenant } from '@/modules/tenants/read-only.interceptor'
import { AuthService } from './auth.service'
import { RefreshTokenService } from './refresh-token.service'
import { LoginDto } from './dto/login.dto'
import { AuthUserDto, LoginResponseDto } from './dto/auth-response.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { Public } from './decorators/public.decorator'
import { CurrentUser, type AuthContext } from './decorators/current-user.decorator'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly refresh: RefreshTokenService,
  ) {}

  @Public()
  // Parol tanlashga urinishni sekinlashtiradi: daqiqasiga 10 urinish.
  // Bu argon2 ning o'zi bergan sekinlik ustiga qo'shimcha to'siq.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @ApiOperation({
    summary: 'Tizimga kirish',
    description:
      'Access token javobda, refresh token esa httpOnly cookie’da qaytadi. ' +
      'Bir email bir nechta do‘konda bo‘lsa AUTH_TENANT_REQUIRED qaytadi — ' +
      'so‘rovni `tenantId` bilan takrorlang.',
  })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'AUTH_INVALID_CREDENTIALS', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'AUTH_TENANT_REQUIRED', type: ApiErrorDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const { response, refreshToken } = await this.auth.login(dto.email, dto.password, {
      tenantId: dto.tenantId,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    })
    setRefreshCookie(res, refreshToken, this.refresh.maxAgeMs)
    return response
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('refresh')
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Access tokenni yangilash',
    description:
      'Eski refresh token bekor qilinadi (rotatsiya). Bekor qilingan token ' +
      'qayta ishlatilsa barcha sessiyalar yopiladi.',
  })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'AUTH_INVALID_REFRESH | AUTH_TOKEN_REUSE', type: ApiErrorDto })
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const raw = readRefreshCookie(req)
    const { response, refreshToken } = await this.auth.refreshTokens(raw, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    })
    setRefreshCookie(res, refreshToken, this.refresh.maxAgeMs)
    return response
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Joriy qurilmadan chiqish' })
  @ApiCreatedResponse({ schema: { example: { ok: true } } })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined
    await this.auth.logout(raw)
    clearRefreshCookie(res)
    return { ok: true }
  }

  @Post('logout-all')
  @AllowReadOnlyTenant()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Barcha qurilmalardan chiqish' })
  @ApiCreatedResponse({ schema: { example: { revoked: 3 } } })
  async logoutAll(
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ revoked: number }> {
    const revoked = await this.auth.logoutAll(user.userId)
    clearRefreshCookie(res)
    return { revoked }
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Joriy foydalanuvchi' })
  @ApiOkResponse({ type: AuthUserDto })
  async me(@CurrentUser() user: AuthContext): Promise<AuthUserDto> {
    return this.auth.me(user.userId)
  }

  @Post('change-password')
  @AllowReadOnlyTenant()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Parolni o‘zgartirish',
    description: 'Muvaffaqiyatli bo‘lsa BARCHA sessiyalar yopiladi.',
  })
  @ApiCreatedResponse({ schema: { example: { ok: true } } })
  @ApiUnauthorizedResponse({ description: 'AUTH_INVALID_CREDENTIALS', type: ApiErrorDto })
  async changePassword(
    @CurrentUser() user: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword)
    clearRefreshCookie(res)
    return { ok: true }
  }
}
