import { Body, Controller, Delete, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { clearRefreshCookie, PLATFORM_COOKIE, readRefreshCookie, setRefreshCookie } from '@/modules/auth/auth-cookies'
import { CurrentAdmin, type PlatformContext } from '@/modules/auth/decorators/platform.decorator'
import { Public } from '@/modules/auth/decorators/public.decorator'
import { TelegramLinkDto } from '@/modules/telegram/dto/telegram.dto'
import { TelegramService } from '@/modules/telegram/telegram.service'
import { PlatformAdminDto, PlatformLoginDto, PlatformLoginResponseDto, TotpCodeDto, TotpSetupDto } from './dto/platform-auth.dto'
import { PlatformAuthService } from './platform-auth.service'
import { PlatformRoute } from './platform-route.decorator'
import { PlatformSessionService } from './platform-session.service'

const TOTP_422 = { status: 422, description: 'INVALID_STATUS_TRANSITION — holat bunga yo‘l qo‘ymaydi (yoqilgan/yoqilmagan)', type: ApiErrorDto }

/** Egasi kirishi (T-135) — do'kon auth'i bilan bir xil oqim, alohida cookie (`platform_refresh`) */
@PlatformRoute()
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly sessions: PlatformSessionService,
    private readonly telegram: TelegramService,
  ) {}

  @Public()
  // Egasi hisoblari sanoqli — parol tanlashga urinish yanada qattiq cheklanadi
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  @ApiOperation({
    summary: 'Egasi paneliga kirish',
    description:
      'Access token javobda (`kind: platform` — do‘kon yo‘llarida o‘tmaydi), refresh token `platform_refresh` httpOnly cookie’da. ' +
      'Ikki bosqichli kirish yoqilgan hisobda `totpCode` majburiy: kodsiz — 401 `AUTH_TOTP_REQUIRED` (parol to‘g‘ri, kod maydonini ko‘rsating), noto‘g‘ri kod — 401 `AUTH_TOTP_INVALID`.',
  })
  @ApiCreatedResponse({ type: PlatformLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'AUTH_INVALID_CREDENTIALS | AUTH_TOTP_REQUIRED | AUTH_TOTP_INVALID', type: ApiErrorDto })
  async login(@Body() dto: PlatformLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<PlatformLoginResponseDto> {
    const { response, refreshToken } = await this.auth.login(dto.email, dto.password, dto.totpCode, { userAgent: req.get('user-agent'), ip: req.ip })
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
  @ApiOperation({ summary: 'Joriy egasi', description: 'Rol, ikki bosqichli kirish va Telegram holati ham shu yerda (profil sahifasi).' })
  @ApiOkResponse({ type: PlatformAdminDto })
  async me(@CurrentAdmin() admin: PlatformContext): Promise<PlatformAdminDto> {
    return (await this.auth.forAdmin(admin.adminId))!
  }

  @Post('totp/setup')
  @ApiOperation({
    summary: 'Ikki bosqichli kirishni sozlashni boshlash',
    description: 'Yangi sir: QR (`otpauthUrl`) yoki qo‘lda `secret`. Kirishga hali ta’sir qilmaydi — `totp/enable` da ilovadagi kod bilan tasdiqlanadi. Qayta chaqirish — yangi sir.',
  })
  @ApiCreatedResponse({ type: TotpSetupDto })
  @ApiResponse(TOTP_422)
  totpSetup(@CurrentAdmin() admin: PlatformContext): Promise<TotpSetupDto> {
    return this.auth.totpSetup(admin.adminId)
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('totp/enable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ikki bosqichli kirishni yoqish', description: 'Ilovadagi kod sozlangan sirga mos kelsa yoqiladi; keyingi kirishdan `totpCode` majburiy.' })
  @ApiOkResponse({ type: PlatformAdminDto })
  @ApiUnauthorizedResponse({ description: 'AUTH_TOTP_INVALID', type: ApiErrorDto })
  @ApiResponse(TOTP_422)
  totpEnable(@Body() dto: TotpCodeDto, @CurrentAdmin() admin: PlatformContext): Promise<PlatformAdminDto> {
    return this.auth.totpEnable(admin.adminId, dto.code)
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('totp/disable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ikki bosqichli kirishni o‘chirish', description: 'Ham ilovadagi kod bilan — o‘g‘irlangan sessiya himoyani olib tashlay olmaydi. Qurilma yo‘qolgan bo‘lsa — boshqa egasi `POST /platform/admins/:id/totp/reset`.' })
  @ApiOkResponse({ type: PlatformAdminDto })
  @ApiUnauthorizedResponse({ description: 'AUTH_TOTP_INVALID', type: ApiErrorDto })
  @ApiResponse(TOTP_422)
  totpDisable(@Body() dto: TotpCodeDto, @CurrentAdmin() admin: PlatformContext): Promise<PlatformAdminDto> {
    return this.auth.totpDisable(admin.adminId, dto.code)
  }

  @Post('telegram-link')
  @ApiOperation({
    summary: 'Telegram botga ulanish havolasi',
    description: 'Mijozlar kabi shaxsiy havola: ochib Start bosilsa shu hisobga bog‘lanadi va egasi xabarlari (yangi do‘kon, onlayn to‘lov, o‘chirish so‘rovi) shu chatga keladi. Bir martalik, 7 kun.',
  })
  @ApiCreatedResponse({ type: TelegramLinkDto })
  @ApiResponse({ status: 422, description: 'RECIPIENT_UNREACHABLE (`reason: no_channel`) — bot sozlanmagan', type: ApiErrorDto })
  telegramLink(@CurrentAdmin() admin: PlatformContext): Promise<TelegramLinkDto> {
    return this.telegram.createPlatformLink(admin.adminId)
  }

  @Delete('telegram-link')
  @HttpCode(204)
  @ApiOperation({ summary: 'Telegram ulanishini olib tashlash', description: 'Xabarlar to‘xtaydi; qayta ulash — yangi havola.' })
  @ApiResponse({ status: 204, description: 'Ulanish olib tashlandi (bo‘lmasa ham 204)' })
  async telegramUnlink(@CurrentAdmin() admin: PlatformContext): Promise<void> {
    await this.telegram.unlinkPlatformAdmin(admin.adminId)
  }
}
