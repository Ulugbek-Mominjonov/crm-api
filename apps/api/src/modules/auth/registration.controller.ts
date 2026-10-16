import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common'
import { ApiBadRequestResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { DomainError } from '@/common/errors/domain.error'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { PlatformSettingsService } from '@/modules/platform/platform-settings.service'
import { setRefreshCookie } from './auth-cookies'
import { AuthService } from './auth.service'
import { Public } from './decorators/public.decorator'
import { LoginResponseDto } from './dto/auth-response.dto'
import { RegisterDto, RegistrationInfoDto } from './dto/register.dto'
import { RefreshTokenService } from './refresh-token.service'

/** Yangi do'konni ro'yxatdan o'tkazish (T-124) — ochiq yo'l; egasi yopib qo'yishi mumkin (T-138) */
@ApiTags('auth')
@Controller('tenants')
export class RegistrationController {
  constructor(
    private readonly auth: AuthService,
    private readonly refresh: RefreshTokenService,
    private readonly settings: PlatformSettingsService,
  ) {}

  @Public()
  @Get('registration')
  @ApiOperation({
    summary: 'Ro‘yxatdan o‘tish ochiqmi',
    description: 'Kirish sahifasi «Do‘kon ochish» havolasini shunga qarab ko‘rsatadi. `closed` — platforma egasi yopgan, do‘konni u ochadi.',
  })
  @ApiOkResponse({ type: RegistrationInfoDto })
  async registration(): Promise<RegistrationInfoDto> {
    return { mode: await this.settings.registrationMode() }
  }

  @Public()
  // Ommaviy do'kon yaratishni to'sadi: bir IP dan soatiga 5 ta
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @Post('register')
  @ApiOperation({
    summary: 'Yangi do‘kon ochish',
    description:
      'Do‘kon, sozlama, sukut ombor, kategoriyalar va egasi (administrator) yaratiladi; javob — kirish bilan bir xil ' +
      '(access token + refresh cookie). Keyin mijoz sozlash sehrgarini ko‘rsatadi (`settings.onboarded = false`). ' +
      'Platforma egasi ro‘yxatdan o‘tishni yopgan bo‘lsa — 403 `REGISTRATION_CLOSED` (`GET /tenants/registration`).',
  })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED — jumladan kuchsiz parol', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'REGISTRATION_CLOSED — ro‘yxatdan o‘tish yopiq', type: ApiErrorDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    if ((await this.settings.registrationMode()) === 'closed') {
      throw new DomainError('REGISTRATION_CLOSED', 'Yangi do‘kon ochish vaqtincha yopiq — platforma egasiga murojaat qiling')
    }
    const { response, refreshToken } = await this.auth.register(dto, { userAgent: req.get('user-agent'), ip: req.ip })
    setRefreshCookie(res, refreshToken, this.refresh.maxAgeMs)
    return response
  }
}
