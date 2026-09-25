import { Body, Controller, Get, Patch } from '@nestjs/common'
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse,
  ApiOperation, ApiTags,
} from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { AuditAction } from '@/modules/audit/audit.decorator'
import { SettingsService } from './settings.service'
import { SettingsDto, UpdateSettingsDto } from './dto/settings.dto'

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /**
   * Huquq talab qilinmaydi (faqat autentifikatsiya): kassir ham QQS va
   * chegirma chegarasini bilishi kerak. Sozlamada maxfiy ma'lumot yo'q.
   */
  @Get()
  @ApiOperation({
    summary: 'Do‘kon sozlamalari',
    description: 'Barcha rollar o‘qiydi — kassa QQS va chegirma chegarasini shu yerdan oladi.',
  })
  @ApiOkResponse({ type: SettingsDto })
  get(): Promise<SettingsDto> {
    return this.settings.get()
  }

  @Patch()
  @RequirePermission('settings', 'edit')
  @AuditAction('settings.update')
  @ApiOperation({
    summary: 'Sozlamalarni o‘zgartirish',
    description: 'Faqat yuborilgan maydonlar o‘zgaradi. Foizlar 0–100 oralig‘ida.',
  })
  @ApiOkResponse({ type: SettingsDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'PERMISSION_DENIED', type: ApiErrorDto })
  update(@Body() dto: UpdateSettingsDto): Promise<SettingsDto> {
    return this.settings.update(dto)
  }
}
