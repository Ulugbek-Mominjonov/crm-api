import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import {
  ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiOperation, ApiResponse, ApiTags,
} from '@nestjs/swagger'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { Idempotent } from '@/modules/idempotency/idempotent.decorator'
import {
  CreateAccrualDto, CreatePaymentDto, PayrollEntryDto, PayrollEntryPageDto, PayrollEntryQueryDto, PayrollRunResultDto,
  PayrollSheetDto, PayrollSheetQueryDto,
} from './dto/payroll.dto'
import { PayrollAccrualService } from './payroll-accrual.service'
import { PayrollService } from './payroll.service'

/** Maosh hisobi (T-142): oylik varaq, xodim yozuvlari, hisoblash va to'lov */
@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly accrual: PayrollAccrualService,
  ) {}

  @Get()
  @RequirePermission('payroll', 'view')
  @ApiOperation({
    summary: 'Oylik varaq (vedomost)',
    description: 'Har xodim: davr boshidagi qoldiq, hisoblangan maosh/bonus/mukofot/jarima, avans/to‘lov, davr oxiridagi qoldiq.',
  })
  @ApiOkResponse({ type: PayrollSheetDto })
  sheet(@Query() query: PayrollSheetQueryDto): Promise<PayrollSheetDto> {
    return this.payroll.sheet(query)
  }

  @Get('entries')
  @RequirePermission('payroll', 'view')
  @ApiOperation({ summary: 'Yozuvlar jurnali', description: 'Xodim varag‘i — `employeeId` bilan; `withDeleted=true` — o‘chirilganlari ham.' })
  @ApiOkResponse({ type: PayrollEntryPageDto })
  list(@Query() query: PayrollEntryQueryDto): Promise<Paged<PayrollEntryDto>> {
    return this.payroll.list(query)
  }

  @Post('accruals')
  @RequirePermission('payroll', 'accrue')
  @AuditedInService()
  @ApiOperation({
    summary: 'Hisoblash: maosh, bonus, mukofot yoki jarima',
    description: 'Ishlab topilganiga yoziladi, kassaga ta’sir qilmaydi; `penalty` ayiradi. Sana berilmasa — bugun.',
  })
  @ApiCreatedResponse({ type: PayrollEntryDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  accrue(@Body() dto: CreateAccrualDto): Promise<PayrollEntryDto> {
    return this.payroll.accrue(dto)
  }

  @Post('payments')
  @RequirePermission('payroll', 'pay')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'To‘lov: avans yoki maosh',
    description: '`method: cash` — kassadan chiqadi (ochiq smena shart, aks holda 423), `bank` — kassaga ta’sirsiz. Idempotent.',
  })
  @ApiCreatedResponse({ type: PayrollEntryDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiResponse({ status: 423, description: 'SHIFT_REQUIRED', type: ApiErrorDto })
  pay(@Body() dto: CreatePaymentDto): Promise<PayrollEntryDto> {
    return this.payroll.pay(dto)
  }

  @Post('run-due')
  @HttpCode(200)
  @RequirePermission('payroll', 'accrue')
  @AuditedInService()
  @ApiOperation({
    summary: 'Muddati kelgan xodimlarga o‘tgan oy maoshini hozir hisoblash',
    description: 'Tungi ish har kuni 00:10 da o‘zi ishlaydi; bu — qo‘lda. Xodim + davr bo‘yicha bir marta.',
  })
  @ApiOkResponse({ type: PayrollRunResultDto })
  async runDue(): Promise<PayrollRunResultDto> {
    return { created: await this.accrual.runDue() }
  }

  @Delete('entries/:id')
  @HttpCode(204)
  @RequirePermission('payroll', 'view')
  @AuditedInService()
  @ApiOperation({
    summary: 'Yozuvni o‘chirish',
    description: 'To‘lov — `payroll.pay`, hisoblash — `payroll.accrue` bilan. Naqd to‘lov puli kassaga qaytadi. O‘chirilgan avtomatik yozuv qayta hisoblanmaydi.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.payroll.remove(id)
  }

  @Post('entries/:id/restore')
  @HttpCode(200)
  @RequirePermission('payroll', 'view')
  @AuditedInService()
  @ApiOperation({ summary: 'O‘chirilgan yozuvni tiklash', description: 'Naqd to‘lov yana kassadan chiqadi (joriy smena).' })
  @ApiOkResponse({ type: PayrollEntryDto })
  @ApiForbiddenResponse({ type: ApiErrorDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<PayrollEntryDto> {
    return this.payroll.restore(id)
  }
}
