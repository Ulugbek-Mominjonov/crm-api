import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiOperation, ApiResponse, ApiTags, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { Idempotent } from '@/modules/idempotency/idempotent.decorator'
import {
  CreatePurchaseOrderDto, PayPurchaseOrderDto, PoPaymentResultDto, PurchaseOrderDto, PurchaseOrderPageDto,
  PurchaseOrderQueryDto, PurchaseOrderSummaryDto, ReceivePurchaseOrderDto, UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto'
import { PurchaseOrdersService } from './purchase-orders.service'

/**
 * Kirim buyurtmalari (04-api §6). Buyurtma va qabul — ta'minot huquqi
 * (`suppliers`, omborchi ham), to'lov — moliya (`finance`).
 */
@ApiTags('purchase-orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  @RequirePermission('suppliers', 'view')
  @ApiOperation({ summary: 'Kirim buyurtmalari', description: 'Har buyurtmada qarz — faqat kelgan tovar uchun (I18)' })
  @ApiOkResponse({ type: PurchaseOrderPageDto })
  list(@Query() query: PurchaseOrderQueryDto): Promise<Paged<PurchaseOrderDto>> {
    return this.orders.list(query)
  }

  @Get('summary')
  @RequirePermission('suppliers', 'view')
  @ApiOperation({ summary: 'Xaridlar xulosasi', description: 'Kreditorlik, kutilayotgan buyurtmalar, oy va qabul qilingan summa — bitta so‘rov.' })
  @ApiOkResponse({ type: PurchaseOrderSummaryDto })
  summary(): Promise<PurchaseOrderSummaryDto> {
    return this.orders.summary()
  }

  @Get(':id')
  @RequirePermission('suppliers', 'view')
  @ApiOperation({ summary: 'Kirim buyurtmasi' })
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderDto> {
    return this.orders.get(id)
  }

  @Post()
  @RequirePermission('suppliers', 'create')
  @AuditedInService()
  @ApiOperation({ summary: 'Buyurtma yaratish', description: 'Raqam `BUY-NNNN` (I12)' })
  @ApiCreatedResponse({ type: PurchaseOrderDto })
  @ApiUnprocessableEntityResponse({ description: 'REFERENCE_NOT_FOUND', type: ApiErrorDto })
  create(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrderDto> {
    return this.orders.create(dto)
  }

  @Patch(':id')
  @RequirePermission('suppliers', 'edit')
  @AuditedInService()
  @ApiOperation({ summary: 'Buyurtmani tahrirlash', description: 'Faqat `ordered` holatida' })
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiConflictResponse({ description: 'PO_ALREADY_RECEIVED | PO_CANCELLED', type: ApiErrorDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePurchaseOrderDto): Promise<PurchaseOrderDto> {
    return this.orders.update(id, dto)
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('suppliers', 'edit')
  @AuditedInService()
  @ApiOperation({ summary: 'Buyurtmani bekor qilish', description: 'Faqat `ordered` — qisman kelgani bekor qilinmaydi (I19)' })
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiConflictResponse({ description: 'PO_ALREADY_RECEIVED | PO_CANCELLED', type: ApiErrorDto })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderDto> {
    return this.orders.cancel(id)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('suppliers', 'delete')
  @AuditedInService()
  @ApiOperation({ summary: 'Buyurtmani o‘chirish', description: 'Tovar kelmagan va to‘lanmagan bo‘lsa' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.orders.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('suppliers', 'delete')
  @AuditedInService()
  @ApiOperation({ summary: 'O‘chirilgan buyurtmani tiklash (undo)' })
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderDto> {
    return this.orders.restore(id)
  }

  @Post(':id/receive')
  @HttpCode(200)
  @RequirePermission('suppliers', 'edit')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Qabul qilish (to‘liq yoki qisman)',
    description: 'Buyurtmadan oshmaydi (I19); har qator — kirim harakati va o‘rtacha tannarx (I11). Idempotent.',
  })
  @ApiOkResponse({ type: PurchaseOrderDto })
  @ApiUnprocessableEntityResponse({ description: 'PO_OVER_RECEIVE | WAREHOUSE_ARCHIVED', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'PO_ALREADY_RECEIVED | PO_CANCELLED', type: ApiErrorDto })
  receive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceivePurchaseOrderDto): Promise<PurchaseOrderDto> {
    return this.orders.receive(id, dto)
  }

  @Post(':id/pay')
  @RequirePermission('finance', 'create')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({
    summary: 'Ta’minotchiga to‘lov',
    description: 'Kelgan tovar qarzidan oshmaydi (I18); naqd — kassadan (smena hisobotida). Idempotent.',
  })
  @ApiCreatedResponse({ type: PoPaymentResultDto })
  @ApiUnprocessableEntityResponse({ description: 'PAYMENT_EXCEEDS_DEBT', type: ApiErrorDto })
  @ApiResponse({ status: 423, description: 'SHIFT_REQUIRED (naqd)', type: ApiErrorDto })
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPurchaseOrderDto): Promise<PoPaymentResultDto> {
    return this.orders.pay(id, dto)
  }
}
