import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { Idempotent } from '@/modules/idempotency/idempotent.decorator'
import {
  DebtPageDto, DebtPaymentDto, DebtPaymentInputDto, DebtPaymentPageDto, DebtPaymentQueryDto, DebtPaymentResultDto,
  DebtQueryDto,
} from './dto/debt.dto'
import { DebtsService } from './debts.service'

/** Qarzlar (04-api §6) — `finance` huquqi */
@ApiTags('debts')
@ApiBearerAuth()
@Controller('debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @Get()
  @RequirePermission('finance', 'view')
  @ApiOperation({
    summary: 'Qarzdorlar',
    description: '`view=customers` — mijoz bo‘yicha (`client_balances`), `receipts` — cheklar. Eskirish 30/60/60+, muddati o‘tgan.',
  })
  @ApiOkResponse({ type: DebtPageDto })
  list(@Query() query: DebtQueryDto): Promise<DebtPageDto> {
    return this.debts.list(query)
  }

  @Get('payments')
  @RequirePermission('finance', 'view')
  @ApiOperation({ summary: 'Qarz to‘lovlari tarixi' })
  @ApiOkResponse({ type: DebtPaymentPageDto })
  payments(@Query() query: DebtPaymentQueryDto): Promise<Paged<DebtPaymentDto>> {
    return this.debts.payments(query)
  }

  @Post('payments')
  @RequirePermission('finance', 'create')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Qarz to‘lovi',
    description: 'Qarzdan oshmaydi (I14); to‘liq to‘langanda chek `completed`. Naqd — kassaga (smena shart). Idempotent.',
  })
  @ApiCreatedResponse({ type: DebtPaymentResultDto })
  @ApiUnprocessableEntityResponse({ description: 'PAYMENT_EXCEEDS_DEBT | REFERENCE_NOT_FOUND', type: ApiErrorDto })
  @ApiResponse({ status: 423, description: 'SHIFT_REQUIRED (naqd)', type: ApiErrorDto })
  pay(@Body() dto: DebtPaymentInputDto): Promise<DebtPaymentResultDto> {
    return this.debts.pay(dto)
  }
}
