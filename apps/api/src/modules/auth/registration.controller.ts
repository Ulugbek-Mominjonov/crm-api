import { Body, Controller, Post, Req, Res } from '@nestjs/common'
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { setRefreshCookie } from './auth-cookies'
import { AuthService } from './auth.service'
import { Public } from './decorators/public.decorator'
import { LoginResponseDto } from './dto/auth-response.dto'
import { RegisterDto } from './dto/register.dto'
import { RefreshTokenService } from './refresh-token.service'

/** Yangi do'konni ro'yxatdan o'tkazish (T-124) — ochiq yo'l */
@ApiTags('auth')
@Controller('tenants')
export class RegistrationController {
  constructor(
    private readonly auth: AuthService,
    private readonly refresh: RefreshTokenService,
  ) {}

  @Public()
  // Ommaviy do'kon yaratishni to'sadi: bir IP dan soatiga 5 ta
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @Post('register')
  @ApiOperation({
    summary: 'Yangi do‘kon ochish',
    description:
      'Do‘kon, sozlama, sukut ombor, kategoriyalar va egasi (administrator) yaratiladi; javob — kirish bilan bir xil ' +
      '(access token + refresh cookie). Keyin mijoz sozlash sehrgarini ko‘rsatadi (`settings.onboarded = false`).',
  })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED — jumladan kuchsiz parol', type: ApiErrorDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const { response, refreshToken } = await this.auth.register(dto, { userAgent: req.get('user-agent'), ip: req.ip })
    setRefreshCookie(res, refreshToken, this.refresh.maxAgeMs)
    return response
  }
}
