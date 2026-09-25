import { Controller, Get } from '@nestjs/common'
import {
  ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiPayloadTooLargeResponse, ApiTags,
} from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { ManualTransaction } from '@/prisma/tenant-transaction.interceptor'
import { BackupService } from './backup.service'
import { BackupDto } from './dto/backup.dto'

/** Do'kon zaxirasi (T-128). Faqat administrator — servis tekshiradi */
@ApiTags('backup')
@ApiBearerAuth()
@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('export')
  @ManualTransaction()
  @ApiOperation({
    summary: 'Do‘kon zaxirasi: butun ma’lumot JSON (gzip), havola 1 soat',
    description:
      'Brauzerdagi «Sozlamalar → Zaxira» shakli (`CrmSnapshot` + `settings`, parolsiz `users`) — ' +
      '`POST /migration/import` bilan boshqa do‘konga yuklanadi. Bitta izchil surat. ' +
      'To‘xtatilgan va o‘chirilayotgan do‘konda ham ishlaydi.',
  })
  @ApiOkResponse({ type: BackupDto })
  @ApiForbiddenResponse({ description: 'Faqat administrator', type: ApiErrorDto })
  @ApiPayloadTooLargeResponse({ description: 'STORAGE_QUOTA_EXCEEDED — fayllar hajmi tarif chegarasida', type: ApiErrorDto })
  export(@CurrentUser() user: AuthContext): Promise<BackupDto> {
    return this.backup.export(user)
  }
}
