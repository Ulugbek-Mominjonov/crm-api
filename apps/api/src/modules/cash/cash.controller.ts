import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { Idempotent } from '@/modules/idempotency/idempotent.decorator'
import { CashMovementsService } from './cash-movements.service'
import {
  CashMovementDto, CashMovementInputDto, CashMovementPageDto, CashMovementQueryDto, CloseShiftDto, CurrentShiftDto,
  OpenShiftDto, ShiftDto, ShiftPageDto, ShiftQueryDto, ShiftReportDto,
} from './dto/cash.dto'
import { ShiftsService } from './shifts.service'

/** Kassa: smena, naqd kirim/chiqim, X/Z hisobot (04-api §5) — `finance` huquqi */
@ApiTags('cash')
@ApiBearerAuth()
@Controller('cash')
export class CashController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly movements: CashMovementsService,
  ) {}

  @Get('shifts/current')
  @RequirePermission('finance', 'view')
  @ApiOperation({ summary: 'Joriy smena va kassa balansi', description: '`shift: null` — smena ochilmagan' })
  @ApiOkResponse({ type: CurrentShiftDto })
  current(): Promise<CurrentShiftDto> {
    return this.shifts.current()
  }

  @Get('shifts')
  @RequirePermission('finance', 'view')
  @ApiOperation({ summary: 'Smenalar tarixi' })
  @ApiOkResponse({ type: ShiftPageDto })
  list(@Query() query: ShiftQueryDto): Promise<Paged<ShiftDto>> {
    return this.shifts.list(query)
  }

  @Post('shifts/open')
  @RequirePermission('finance', 'create')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({ summary: 'Smena ochish', description: 'Balans sanoqqa tenglashadi (I10). Bir vaqtda bitta smena (I8). Idempotent.' })
  @ApiCreatedResponse({ type: ShiftDto })
  @ApiConflictResponse({ description: 'SHIFT_ALREADY_OPEN', type: ApiErrorDto })
  open(@Body() dto: OpenShiftDto): Promise<ShiftDto> {
    return this.shifts.open(dto)
  }

  @Post('shifts/close')
  @HttpCode(200)
  @RequirePermission('finance', 'create')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({ summary: 'Smena yopish', description: 'Kutilgan, sanalgan va farq saqlanadi (I10). Idempotent.' })
  @ApiOkResponse({ type: ShiftDto })
  @ApiConflictResponse({ description: 'SHIFT_NOT_OPEN', type: ApiErrorDto })
  close(@Body() dto: CloseShiftDto): Promise<ShiftDto> {
    return this.shifts.close(dto)
  }

  @Get('shifts/:id/report')
  @RequirePermission('finance', 'view')
  @ApiOperation({ summary: 'X/Z hisobot', description: 'Barcha raqamlar bitta agregat so‘rovda; nasiya cheklar ham (I4).' })
  @ApiOkResponse({ type: ShiftReportDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  report(@Param('id', ParseUUIDPipe) id: string): Promise<ShiftReportDto> {
    return this.shifts.report(id)
  }

  @Post('movements')
  @RequirePermission('finance', 'create')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({ summary: 'Naqd kirim/chiqim', description: 'Faqat ochiq smenada (I8, I9); sabab majburiy. Idempotent.' })
  @ApiCreatedResponse({ type: CashMovementDto })
  @ApiResponse({ status: 423, description: 'SHIFT_REQUIRED', type: ApiErrorDto })
  createMovement(@Body() dto: CashMovementInputDto): Promise<CashMovementDto> {
    return this.movements.create(dto)
  }

  @Get('movements')
  @RequirePermission('finance', 'view')
  @ApiOperation({ summary: 'Smenadagi naqd harakatlar', description: '`shiftId` berilmasa — joriy smena' })
  @ApiOkResponse({ type: CashMovementPageDto })
  listMovements(@Query() query: CashMovementQueryDto): Promise<Paged<CashMovementDto>> {
    return this.movements.list(query)
  }
}
