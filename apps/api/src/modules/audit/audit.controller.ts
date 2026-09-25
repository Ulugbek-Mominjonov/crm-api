import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { AuditLogService } from './audit-log.service'
import { AuditPageDto, AuditQueryDto } from './dto/audit.dto'

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly log: AuditLogService) {}

  @Get()
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'Amallar jurnali', description: 'Yangisi birinchi; kalitli sahifa (`nextCursor`). Diff’da maxfiy maydonlar yo‘q.' })
  @ApiOkResponse({ type: AuditPageDto })
  list(@Query() query: AuditQueryDto): Promise<AuditPageDto> {
    return this.log.list(query)
  }
}
