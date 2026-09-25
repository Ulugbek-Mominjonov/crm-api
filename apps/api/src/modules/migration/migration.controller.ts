import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { ApiPlanLimit } from '@/modules/tenants/api-plan-limit.decorator'
import { TransactionTimeout } from '@/prisma/tenant-transaction.interceptor'
import { MigrationDto, MigrationReportDto, MigrationResultDto } from './dto/migration.dto'
import { MigrationService } from './migration.service'

/** Katta do'kon (~10 000 yozuv, rasmlar bilan) bitta tranzaksiyada — 07 §7.4 dagi chegara */
const IMPORT_TIMEOUT_MS = 300_000

/**
 * Brauzerdagi (localStorage) ma'lumotni serverga ko'chirish (E14, 07).
 * Faqat administrator — servis tekshiradi (every-route-guarded oq ro'yxati).
 */
@ApiTags('migration')
@ApiBearerAuth()
@Controller('migration')
export class MigrationController {
  constructor(private readonly migration: MigrationService) {}

  @Post('validate')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({
    summary: 'Tekshirish (dry-run)',
    description:
      'Yozmaydi: nechta yozuv ko‘chadi, nimasi o‘tkazib yuboriladi (`error`) yoki tuzatiladi (`warning`), serverda ' +
      'allaqachon nima bor (`existing` — takroriy importdan ogohlantirish).',
  })
  @ApiOkResponse({ type: MigrationReportDto })
  @ApiForbiddenResponse({ description: 'Faqat administrator', type: ApiErrorDto })
  validate(@Body() dto: MigrationDto, @CurrentUser() user: AuthContext): Promise<MigrationReportDto> {
    return this.migration.validate(dto, user)
  }

  @Post('import')
  @HttpCode(200)
  @AuditedInService()
  @TransactionTimeout(IMPORT_TIMEOUT_MS)
  @ApiOperation({
    summary: 'Import',
    description:
      'Bitta tranzaksiyada, tashqi kalitlar tartibida. Qayta yuborish ikkilanmaydi (id — eski id’dan deterministik). ' +
      'Buzilgan havola va invariantlar tiklanadi, rasmlar S3’ga ko‘chadi; muammolar `issues` da. Foydalanuvchilar ' +
      'uchun vaqtinchalik parollar faqat SHU javobda.',
  })
  @ApiOkResponse({ type: MigrationResultDto })
  @ApiForbiddenResponse({ description: 'Faqat administrator', type: ApiErrorDto })
  @ApiPlanLimit()
  import(@Body() dto: MigrationDto, @CurrentUser() user: AuthContext): Promise<MigrationResultDto> {
    return this.migration.import(dto, user)
  }
}
