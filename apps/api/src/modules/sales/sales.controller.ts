import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, StreamableFile } from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiExtraModels, ApiForbiddenResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiResponse, ApiServiceUnavailableResponse, ApiTags,
  ApiUnprocessableEntityResponse, getSchemaPath,
} from '@nestjs/swagger'
import type { CursorPage } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { Idempotent } from '@/modules/idempotency/idempotent.decorator'
import { ManualTransaction } from '@/prisma/tenant-transaction.interceptor'
import {
  CreateSaleDto, ReceiptDto, ReceiptQueryDto, ReturnSaleDto, SaleDto, SaleListItemDto, SalePageDto, SaleQueryDto,
} from './dto/sale.dto'
import { ReceiptDeliveryService } from './receipt-delivery.service'
import { receiptPdf } from './receipt-pdf'
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
    private readonly receipts: ReceiptDeliveryService,
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
  @ApiForbiddenResponse({
    description: 'PERMISSION_DENIED — sotuvchi `priceTier: "wholesale"` yubordi, `sellerWholesaleEnabled` o‘chiq',
    type: ApiErrorDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'STOCK_INSUFFICIENT | DISCOUNT_LIMIT | TOTAL_MISMATCH | PAYMENT_EXCEEDS_TOTAL | CREDIT_REQUIRES_CUSTOMER | ' +
      'CREDIT_LIMIT_EXCEEDED | CREDIT_OVERDUE | PRODUCT_ARCHIVED | WAREHOUSE_ARCHIVED | REFERENCE_NOT_FOUND',
    type: ApiErrorDto,
  })
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthContext): Promise<SaleDto> {
    return this.sales.create(dto, user)
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
  // Ma'lumot servisning qisqa tranzaksiyasida o'qiladi, PDF — undan keyin
  @ManualTransaction()
  @ApiOperation({
    summary: 'Chop etish uchun chek',
    description:
      'Do‘kon rekvizitlari bilan. `format=pdf` — 80 mm termal chek (brauzerdagi chek ko‘rinishida, fiskal QR bilan), ' +
      '`Content-Disposition: inline; filename="<raqam>.pdf"` (09 §9.13).',
  })
  @ApiProduces('application/json', 'application/pdf')
  @ApiExtraModels(ReceiptDto)
  @ApiOkResponse({
    description: '`format=json` (sukut) — chek ma’lumoti; `format=pdf` — PDF fayl',
    content: {
      'application/json': { schema: { $ref: getSchemaPath(ReceiptDto) } },
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ReceiptQueryDto,
  ): Promise<ReceiptDto | StreamableFile> {
    const receipt = await this.queries.receipt(id)
    if (query.format === 'json') return receipt
    const pdf = await receiptPdf(receipt)
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="${receipt.sale.number}.pdf"`,
      length: pdf.length,
    })
  }

  @Post(':id/receipt/telegram')
  @HttpCode(204)
  @RequirePermission('sales', 'view')
  // Telegram'ga yuklash so'rov tranzaksiyasini band qilmasin — servis qisqa tranzaksiyalarini o'zi ochadi
  @ManualTransaction()
  // Jurnal — servisda (`sale.receiptSent`), faqat yuborilgach
  @AuditedInService()
  @ApiOperation({
    summary: 'Chekni mijozga Telegram’da yuborish',
    description:
      'Chekdagi mijoz botga ulangan bo‘lsa — PDF chek (chop etiladigan bilan bir xil) va izoh (raqam, jami, qarz, bonus) ' +
      'bitta xabarda. Darhol yuboriladi. Yetkazib bo‘lmasa — 422 `RECIPIENT_UNREACHABLE`, `meta.reason`: ' +
      '`no_customer` (chekda mijoz yo‘q), `not_linked` (botga ulanmagan), `blocked` (botni bloklagan), `no_channel` (bot sozlanmagan).',
  })
  @ApiNoContentResponse({ description: 'Yuborildi' })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'RECIPIENT_UNREACHABLE', type: ApiErrorDto })
  @ApiServiceUnavailableResponse({ description: 'Telegram javob bermadi — qayta urinib ko‘ring', type: ApiErrorDto })
  async receiptToTelegram(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.receipts.toTelegram(id)
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
