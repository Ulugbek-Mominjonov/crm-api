import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation,
  ApiResponse, ApiTags, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import type { CursorPage } from '@/common/crud/paging'
import { DomainError } from '@/common/errors/domain.error'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import type { Env } from '@/config/env.schema'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { Idempotent } from '@/modules/idempotency/idempotent.decorator'
import {
  CreateSaleDto, ReceiptDto, ReceiptQueryDto, ReturnSaleDto, SaleDto, SaleListItemDto, SalePageDto, SaleQueryDto,
} from './dto/sale.dto'
import { SalesQueriesService } from './sales-queries.service'
import { SalesService } from './sales.service'

/**
 * Sotuvlar (04-api §4). Summalarni server hisoblaydi — mijoz yuborgan
 * jami faqat solishtiriladi (04 §4.5).
 */
@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly queries: SalesQueriesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post()
  @RequirePermission('sales', 'create')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Sotuv (chek)',
    description:
      'Bitta tranzaksiya: qoldiq (qulf bilan), chek, ombor harakatlari, kassa, bonus, yetkazish, audit. ' +
      'Ochiq smena shart (I8). Idempotent.',
  })
  @ApiCreatedResponse({ type: SaleDto })
  @ApiResponse({ status: 423, description: 'SHIFT_REQUIRED', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({
    description:
      'STOCK_INSUFFICIENT | DISCOUNT_LIMIT | TOTAL_MISMATCH | PAYMENT_EXCEEDS_TOTAL | CREDIT_REQUIRES_CUSTOMER | ' +
      'CREDIT_LIMIT_EXCEEDED | CREDIT_OVERDUE | PRODUCT_ARCHIVED | WAREHOUSE_ARCHIVED | REFERENCE_NOT_FOUND',
    type: ApiErrorDto,
  })
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthContext): Promise<SaleDto> {
    return this.sales.create(dto, user.employeeId)
  }

  @Get()
  @RequirePermission('sales', 'view')
  @ApiOperation({
    summary: 'Cheklar ro‘yxati',
    description: 'Kursorli sahifalash (`nextCursor`). Har chekda qolgan qarz — bazada hisoblangan (I13).',
  })
  @ApiOkResponse({ type: SalePageDto })
  list(@Query() query: SaleQueryDto): Promise<CursorPage<SaleListItemDto>> {
    return this.queries.list(query)
  }

  @Get(':id')
  @RequirePermission('sales', 'view')
  @ApiOperation({ summary: 'Chek (qatorlari bilan)' })
  @ApiOkResponse({ type: SaleDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SaleDto> {
    return this.queries.get(id)
  }

  @Get(':id/receipt')
  @RequirePermission('sales', 'view')
  @ApiOperation({
    summary: 'Chop etish uchun chek',
    description: 'Do‘kon rekvizitlari bilan. `pdf` — faqat `PDF_ENABLED=true` serverda (09 §9.13).',
  })
  @ApiOkResponse({ type: ReceiptDto })
  @ApiResponse({ status: 501, description: 'FEATURE_DISABLED — PDF o‘chirilgan', type: ApiErrorDto })
  receipt(@Param('id', ParseUUIDPipe) id: string, @Query() query: ReceiptQueryDto): Promise<ReceiptDto> {
    if (query.format === 'pdf' && !this.config.get('PDF_ENABLED', { infer: true })) {
      throw new DomainError('FEATURE_DISABLED', 'PDF chek bu serverda o‘chirilgan — `format=json` bilan chop eting')
    }
    return this.queries.receipt(id)
  }

  @Post(':id/return')
  @RequirePermission('sales', 'create')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Qaytarish',
    description:
      'QQS asl chek foizi bo‘yicha (I6); ombor qoldig‘i bilan cheklanmaydi (I7). Nasiya chekda avval qarz yopiladi, ' +
      'qolgani naqd qaytariladi. Idempotent.',
  })
  @ApiCreatedResponse({ type: SaleDto, description: 'Qaytarish hujjati (`QAYT-…`)' })
  @ApiUnprocessableEntityResponse({ description: 'RETURN_EXCEEDS_SOLD | SALE_NOT_RETURNABLE', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'SALE_ALREADY_CANCELLED', type: ApiErrorDto })
  returnSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnSaleDto,
    @CurrentUser() user: AuthContext,
  ): Promise<SaleDto> {
    return this.sales.returnSale(id, dto, user.employeeId)
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('sales', 'delete')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Bekor qilish',
    description: 'Tovar AYNAN sotilgan omborga qaytadi (I24), naqd kassadan qaytariladi, bonus olib qo‘yiladi (I17).',
  })
  @ApiOkResponse({ type: SaleDto })
  @ApiConflictResponse({ description: 'SALE_ALREADY_CANCELLED | SALE_NOT_CANCELLABLE', type: ApiErrorDto })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<SaleDto> {
    return this.sales.cancel(id)
  }
}
