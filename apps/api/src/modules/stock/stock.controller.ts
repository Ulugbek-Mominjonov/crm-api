import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse,
  ApiOperation, ApiTags, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import type { CursorPage } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { Idempotent } from '@/modules/idempotency/idempotent.decorator'
import { StockOperationsService } from './stock-operations.service'
import { StockQueriesService } from './stock-queries.service'
import {
  AdjustDto, AdjustResultDto, IntakeDto, MovementDto, MovementPageDto, MovementQueryDto,
  ReorderGroupDto, StockOperationResultDto, TransferDto, TransferResultDto, WriteoffDto,
} from './dto/stock.dto'

/**
 * Ombor amallari — katalog bilan bir huquqda (04-api §1: `products`).
 * Qoldiq FAQAT shu yerdan o'zgaradi (va sotuv/qaytarish orqali).
 */
@ApiTags('stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(
    private readonly operations: StockOperationsService,
    private readonly queries: StockQueriesService,
  ) {}

  @Post('intake')
  @RequirePermission('products', 'edit')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Kirim',
    description: 'Qoldiq ortadi; `unitCost` berilsa o‘rtacha tannarx qayta hisoblanadi (I11). Idempotent.',
  })
  @ApiCreatedResponse({ type: StockOperationResultDto })
  @ApiUnprocessableEntityResponse({ description: 'REFERENCE_NOT_FOUND | WAREHOUSE_ARCHIVED', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'IDEMPOTENCY_MISMATCH', type: ApiErrorDto })
  intake(@Body() dto: IntakeDto): Promise<StockOperationResultDto> {
    return this.operations.intake(dto)
  }

  @Post('writeoff')
  @RequirePermission('products', 'edit')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({ summary: 'Chiqim (hisobdan chiqarish)', description: 'Sabab majburiy. Qoldiqdan ko‘p — 422 STOCK_INSUFFICIENT (I2).' })
  @ApiCreatedResponse({ type: StockOperationResultDto })
  @ApiUnprocessableEntityResponse({ description: 'STOCK_INSUFFICIENT — qaysi omborda yetmagani bilan', type: ApiErrorDto })
  writeoff(@Body() dto: WriteoffDto): Promise<StockOperationResultDto> {
    return this.operations.writeoff(dto)
  }

  @Post('adjust')
  @RequirePermission('products', 'edit')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Inventarizatsiya',
    description: 'Sanalgan miqdor bilan farq bitta `adjustment` harakatiga yoziladi; farq 0 — harakat yo‘q.',
  })
  @ApiCreatedResponse({ type: AdjustResultDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED — masalan takror mahsulot', type: ApiErrorDto })
  adjust(@Body() dto: AdjustDto): Promise<AdjustResultDto> {
    return this.operations.adjust(dto)
  }

  @Post('transfer')
  @RequirePermission('products', 'edit')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Omborlar orasida ko‘chirish',
    description: 'Ikki harakat (`transfer_out` + `transfer_in`) bitta amalda; jami qoldiq o‘zgarmaydi.',
  })
  @ApiCreatedResponse({ type: TransferResultDto })
  @ApiUnprocessableEntityResponse({ description: 'WAREHOUSE_SAME | STOCK_INSUFFICIENT | WAREHOUSE_ARCHIVED', type: ApiErrorDto })
  transfer(@Body() dto: TransferDto): Promise<TransferResultDto> {
    return this.operations.transfer(dto)
  }

  @Get('movements')
  @RequirePermission('products', 'view')
  @ApiOperation({
    summary: 'Harakatlar jurnali',
    description: 'Kursorli sahifalash: javobdagi `nextCursor` keyingi so‘rovga `cursor` bo‘lib beriladi.',
  })
  @ApiOkResponse({ type: MovementPageDto })
  movements(@Query() query: MovementQueryDto): Promise<CursorPage<MovementDto>> {
    return this.queries.movements(query)
  }

  @Get('reorder-suggestions')
  @RequirePermission('products', 'view')
  @ApiOperation({
    summary: 'Buyurtma taklifi',
    description: 'Kam qolgan tovarlar ta’minotchi bo‘yicha: `max(minStock×2 − stock, minStock)` (shared).',
  })
  @ApiOkResponse({ type: [ReorderGroupDto] })
  reorderSuggestions(): Promise<ReorderGroupDto[]> {
    return this.queries.reorderSuggestions()
  }
}
