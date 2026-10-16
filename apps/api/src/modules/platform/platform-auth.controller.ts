import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common'
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { clearRefreshCookie, PLATFORM_COOKIE, readRefreshCookie, setRefreshCookie } from '@/modules/auth/auth-cookies'
import { CurrentAdmin, type PlatformContext } from '@/modules/auth/decorators/platform.decorator'
import { Public } from '@/modules/auth/decorators/public.decorator'
import { PlatformAdminDto, PlatformLoginDto, PlatformLoginResponseDto } from './dto/platform-auth.dto'
import { PlatformAuthService } from './platform-auth.service'
import { PlatformRoute } from './platform-route.decorator'
import { PlatformSessionService } from './platform-session.service'

/** Egasi kirishi (T-135) — do'kon auth'i bilan bir xil oqim, alohida cookie (`platform_refresh`) */
@PlatformRoute()
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly sessions: PlatformSessionService,
  ) {}

  @Public()
  // Egasi hisobi bitta — parol tanlashga urinish yanada qattiq cheklanadi
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  @ApiOperation({
    summary: 'Egasi paneliga kirish',
    description: 'Access token javobda (`kind: platform` — do‘kon yo‘llarida o‘tmaydi), refresh token `platform_refresh` httpOnly cookie’da.',
  })
  @ApiCreatedResponse({ type: PlatformLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'AUTH_INVALID_CREDENTIALS', type: ApiErrorDto })
  async login(@Body() dto: PlatformLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<PlatformLoginResponseDto> {
    const { response, refreshToken } = await this.auth.login(dto.email, dto.password, { userAgent: req.get('user-agent'), ip: req.ip })
    setRefreshCookie(res, refreshToken, this.sessions.maxAgeMs, PLATFORM_COOKIE)
    return response
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('refresh')
  @ApiCookieAuth(PLATFORM_COOKIE.name)
  @ApiOperation({ summary: 'Egasi access tokenini yangilash', description: 'Rotatsiya: eski cookie bekor, yangisi beriladi; bekor qilingani qayta ishlatilsa barcha sessiyalar yopiladi.' })
  @ApiCreatedResponse({ type: PlatformLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'AUTH_INVALID_REFRESH | AUTH_TOKEN_REUSE', type: ApiErrorDto })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<PlatformLoginResponseDto> {
    const raw = readRefreshCookie(req, PLATFORM_COOKIE)
    const { response, refreshToken } = await this.auth.refresh(raw, { userAgent: req.get('user-agent'), ip: req.ip })
    setRefreshCookie(res, refreshToken, this.sessions.maxAgeMs, PLATFORM_COOKIE)
    return response
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Egasi panelidan chiqish' })
  @ApiCreatedResponse({ schema: { example: { ok: true } } })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    await this.auth.logout(req.cookies?.[PLATFORM_COOKIE.name] as string | undefined)
    clearRefreshCookie(res, PLATFORM_COOKIE)
    return { ok: true }
  }

  @Get('me')
  @ApiOperation({ summary: 'Joriy egasi' })
  @ApiOkResponse({ type: PlatformAdminDto })
  async me(@CurrentAdmin() admin: PlatformContext): Promise<PlatformAdminDto> {
    return (await this.auth.forAdmin(admin.adminId))!
  }
}
