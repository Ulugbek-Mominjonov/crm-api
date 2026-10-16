import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { PLATFORM_KEY } from '@/modules/auth/decorators/platform.decorator'
import { PlatformAuthGuard } from './platform-auth.guard'

/**
 * Egasi paneli controller'i: global guard bu yo'llarni `PlatformAuthGuard`
 * ga qoldiradi (do'kon tokeni rad etiladi), Swagger'da bitta `platform` bo'limi.
 */
export const PlatformRoute = (): ClassDecorator =>
  applyDecorators(
    SetMetadata(PLATFORM_KEY, true),
    UseGuards(PlatformAuthGuard),
    ApiTags('platform'),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'AUTH_INVALID_CREDENTIALS — egasi tokeni yo‘q, yaroqsiz yoki do‘kon tokeni', type: ApiErrorDto }),
  )
