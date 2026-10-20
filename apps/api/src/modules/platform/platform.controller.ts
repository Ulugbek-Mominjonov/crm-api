import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentAdmin, PlatformRoles, type PlatformContext } from '@/modules/auth/decorators/platform.decorator'
import { PlatformAuditEntryDto, PlatformAuditQueryDto } from './dto/platform-audit.dto'
import {
  ConfirmCardPaymentDto, PlatformInvoiceDto, PlatformInvoicesQueryDto, ReceiptUrlDto, RejectCardPaymentDto,
} from './dto/platform-billing.dto'
import { PlatformSettingsDto, UpdatePlatformSettingsDto } from './dto/platform-settings.dto'
import { PlatformStatsDto } from './dto/platform-stats.dto'
import { PlatformAuditService } from './platform-audit.service'
import { PlatformBillingService } from './platform-billing.service'
import { PlatformRoute } from './platform-route.decorator'
import { PlatformSettingsService } from './platform-settings.service'
import { PlatformStatsService } from './platform-stats.service'

const NOT_IN_REVIEW = { status: 422, description: 'INVALID_STATUS_TRANSITION — to‘lov tekshiruvda emas (`meta.state`, `meta.provider`)', type: ApiErrorDto }

/** Egasi paneli — boshqaruv paneli, barcha to'lovlar va karta to'lovlarini tekshirish (T-135, T-149), egasi jurnali, sozlama (T-138) */
@PlatformRoute()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly stats: PlatformStatsService,
    private readonly billing: PlatformBillingService,
    private readonly audit: PlatformAuditService,
    private readonly settings: PlatformSettingsService,
  ) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Boshqaruv paneli',
    description: 'Do‘konlar holat va tarif bo‘yicha, sinovdagilar, shu oyda ochilganlar, 7 kunda tugaydiganlar, muddati o‘tganlar; oylik tushum (12 oy); tekshirish kutayotgan karta to‘lovlari.',
  })
  @ApiOkResponse({ type: PlatformStatsDto })
  getStats(): Promise<PlatformStatsDto> {
    return this.stats.stats()
  }

  @Get('invoices')
  @ApiOperation({
    summary: 'Barcha do‘konlar hisob-fakturalari',
    description: 'Holat, provayder (onlayn, karta yoki qo‘lda), sana oralig‘i va do‘kon bo‘yicha filtr; eng yangisi birinchi. Tekshirish navbati — `state=pending&provider=card`.',
  })
  @ApiPagedResponse(PlatformInvoiceDto)
  invoices(@Query() query: PlatformInvoicesQueryDto): Promise<Paged<PlatformInvoiceDto>> {
    return this.billing.invoices(query)
  }

  @Post('invoices/:id/confirm')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({
    summary: 'Karta to‘lovini tasdiqlash',
    description:
      'Bankda tushum bor (summa, karta oxirgi 4 raqami, vaqt mos). Tarif Payme/Click to‘lovi bilan bir xil qoidada uzayadi, ' +
      '`suspended` ochiladi, do‘konga `billing.invoice` va `tenant.status`. Operator ham. Telegram’dagi «✅ Tasdiqlash» tugmasi — xuddi shu amal.',
  })
  @ApiOkResponse({ type: PlatformInvoiceDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', type: ApiErrorDto })
  @ApiResponse(NOT_IN_REVIEW)
  confirmCard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmCardPaymentDto,
    @CurrentAdmin() admin: PlatformContext,
  ): Promise<PlatformInvoiceDto> {
    return this.billing.reviewCard(id, { action: 'confirm', note: dto.note }, admin.adminId)
  }

  @Post('invoices/:id/reject')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({
    summary: 'Karta to‘lovini rad etish',
    description: 'Tushum topilmadi yoki summa mos emas: hisob-faktura `cancelled`, tarif o‘zgarmaydi; sabab do‘kon administratoriga ko‘rinadi (`rejectReason`).',
  })
  @ApiOkResponse({ type: PlatformInvoiceDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', type: ApiErrorDto })
  @ApiResponse(NOT_IN_REVIEW)
  rejectCard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectCardPaymentDto,
    @CurrentAdmin() admin: PlatformContext,
  ): Promise<PlatformInvoiceDto> {
    return this.billing.reviewCard(id, { action: 'reject', reason: dto.reason }, admin.adminId)
  }

  @Get('invoices/:id/receipt')
  @ApiOperation({ summary: 'Karta to‘lovi cheki', description: 'Qisqa muddatli havola (rasm yoki PDF); `hasReceipt: false` — 404.' })
  @ApiOkResponse({ type: ReceiptUrlDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND — hisob-faktura yoki chek yo‘q', type: ApiErrorDto })
  receipt(@Param('id', ParseUUIDPipe) id: string): Promise<ReceiptUrlDto> {
    return this.billing.receipt(id)
  }

  @Get('audit')
  @ApiOperation({ summary: 'Egasi amallari jurnali', description: 'Kim, qachon, qaysi do‘konga nima qildi (blok, tarif, parol, ochish, o‘chirish); faqat qo‘shiladi.' })
  @ApiPagedResponse(PlatformAuditEntryDto)
  auditLog(@Query() query: PlatformAuditQueryDto): Promise<Paged<PlatformAuditEntryDto>> {
    return this.audit.list(query)
  }

  @Get('settings')
  @ApiOperation({ summary: 'Platforma sozlamasi', description: 'Ro‘yxatdan o‘tish ochiq yoki yopiq; kim va qachon o‘zgartirgan.' })
  @ApiOkResponse({ type: PlatformSettingsDto })
  getSettings(): Promise<PlatformSettingsDto> {
    return this.settings.get()
  }

  @Patch('settings')
  @PlatformRoles('owner')
  @AuditedInService()
  @ApiOperation({
    summary: 'Sozlamani o‘zgartirish',
    description: 'Faqat egasi (operator — 403). `registrationMode: closed` — `POST /tenants/register` darhol 403 `REGISTRATION_CLOSED`, do‘konni faqat panel ochadi. Qayta ishga tushirish shart emas.',
  })
  @ApiOkResponse({ type: PlatformSettingsDto })
  updateSettings(@Body() dto: UpdatePlatformSettingsDto, @CurrentAdmin() admin: PlatformContext): Promise<PlatformSettingsDto> {
    return this.settings.update(dto, admin.adminId)
  }
}
