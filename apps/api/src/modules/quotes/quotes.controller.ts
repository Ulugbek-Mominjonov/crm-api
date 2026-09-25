import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiOperation, ApiTags, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { Idempotent } from '@/modules/idempotency/idempotent.decorator'
import { SaleDto } from '@/modules/sales/dto/sale.dto'
import {
  ConvertQuoteDto, CreateQuoteDto, QuoteDto, QuotePageDto, QuoteQueryDto, QuoteSummaryDto, UpdateQuoteDto,
} from './dto/quote.dto'
import { QuotesService } from './quotes.service'

/** Takliflar (smeta) — 04-api §6 */
@ApiTags('quotes')
@ApiBearerAuth()
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  @RequirePermission('quotes', 'view')
  @ApiOperation({ summary: 'Takliflar ro‘yxati', description: '`expired` — amal muddati o‘tgan ochiq taklif' })
  @ApiOkResponse({ type: QuotePageDto })
  list(@Query() query: QuoteQueryDto): Promise<Paged<QuoteDto>> {
    return this.quotes.list(query)
  }

  @Get('summary')
  @RequirePermission('quotes', 'view')
  @ApiOperation({ summary: 'Takliflar xulosasi', description: 'Jami, qabul qilingan va javob kutilayotgan summa — bitta so‘rov.' })
  @ApiOkResponse({ type: QuoteSummaryDto })
  summary(): Promise<QuoteSummaryDto> {
    return this.quotes.summary()
  }

  @Get(':id')
  @RequirePermission('quotes', 'view')
  @ApiOperation({ summary: 'Taklif (qatorlari bilan)' })
  @ApiOkResponse({ type: QuoteDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<QuoteDto> {
    return this.quotes.get(id)
  }

  @Post()
  @RequirePermission('quotes', 'create')
  @AuditedInService()
  @ApiOperation({ summary: 'Taklif yaratish', description: 'Raqam `TKLF-…` (I12); summalar sotuv bilan bir xil qoidada.' })
  @ApiCreatedResponse({ type: QuoteDto })
  @ApiUnprocessableEntityResponse({ description: 'DISCOUNT_LIMIT | PRODUCT_ARCHIVED | REFERENCE_NOT_FOUND', type: ApiErrorDto })
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: AuthContext): Promise<QuoteDto> {
    return this.quotes.create(dto, user.employeeId)
  }

  @Patch(':id')
  @RequirePermission('quotes', 'edit')
  @AuditedInService()
  @ApiOperation({ summary: 'Taklifni tahrirlash', description: 'Qatorlar berilsa — to‘liq almashtiriladi. Holat: draft|sent|accepted|rejected.' })
  @ApiOkResponse({ type: QuoteDto })
  @ApiConflictResponse({ description: 'QUOTE_ALREADY_CONVERTED', type: ApiErrorDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteDto): Promise<QuoteDto> {
    return this.quotes.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('quotes', 'delete')
  @AuditedInService()
  @ApiOperation({ summary: 'Taklifni o‘chirish (yumshoq)' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'QUOTE_ALREADY_CONVERTED', type: ApiErrorDto })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.quotes.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('quotes', 'delete')
  @AuditedInService()
  @ApiOperation({ summary: 'O‘chirilgan taklifni tiklash (undo)' })
  @ApiOkResponse({ type: QuoteDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<QuoteDto> {
    return this.quotes.restore(id)
  }

  @Post(':id/convert')
  @RequirePermission('sales', 'create')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Taklifni sotuvga aylantirish',
    description: 'Qoldiq tekshiriladi, bir marta (I20); to‘lov usuli chaqiruvchidan; nasiyada mijoz shart. Idempotent.',
  })
  @ApiCreatedResponse({ type: SaleDto })
  @ApiUnprocessableEntityResponse({ description: 'QUOTE_STOCK_SHORT | CREDIT_REQUIRES_CUSTOMER | CREDIT_*', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'QUOTE_ALREADY_CONVERTED', type: ApiErrorDto })
  convert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertQuoteDto): Promise<SaleDto> {
    return this.quotes.convert(id, dto)
  }
}
