import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { Public } from '@/modules/auth/decorators/public.decorator'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { AllowReadOnlyTenant } from '@/modules/tenants/read-only.interceptor'
import { BillingService } from './billing.service'
import { ClickService, type ClickResponse } from './click.service'
import { CardClaimDto, CheckoutDto, CreateInvoiceDto, InvoiceDto, PlanCatalogDto } from './dto/billing.dto'
import { ClickRequestDto, PaymeRequestDto } from './dto/webhook.dto'
import { PaymeService, type PaymeResponse } from './payme.service'

/**
 * Obuna to'lovlari (T-126, T-148, T-149). Tariflar katalogi — ochiq;
 * hisob-faktura va karta to'lovi — administrator; provayder webhooklari
 * ochiq, lekin imzo/kalit bilan (Payme — Basic, Click — MD5).
 */
@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly payme: PaymeService,
    private readonly click: ClickService,
  ) {}

  @Public()
  @Get('plans')
  @ApiOperation({
    summary: 'Tariflar va narxlar',
    description:
      'Ochiq: do‘kon ilovasi, ro‘yxatdan o‘tish sahifasi va egasi paneli narxlarni SHU yerdan oladi (o‘zida yozmaydi). ' +
      'Har tarif — chegaralar va har muddat (1/3/6/12 oy) summasi chegirma bilan; sinov muddati; ishlaydigan to‘lov usullari.',
  })
  @ApiOkResponse({ type: PlanCatalogDto })
  plans(): Promise<PlanCatalogDto> {
    return this.billing.catalog()
  }

  @Post('invoices')
  @ApiBearerAuth()
  @AuditedInService()
  // To'xtatilgan do'kon ham to'lay olishi shart — aynan shu yo'l bilan ochiladi
  @AllowReadOnlyTenant()
  @ApiOperation({
    summary: 'Hisob-faktura (tarif × muddat)',
    description:
      'Faqat administrator. Summa — `GET /billing/plans` dagi narx (uzoq muddatga chegirma). Javobda Payme va Click sahifalari ' +
      'hamda egasining kartasi (`card`). Tarif to‘lov TASDIQLANGACH o‘zgaradi.',
  })
  @ApiCreatedResponse({ type: CheckoutDto })
  createInvoice(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthContext): Promise<CheckoutDto> {
    return this.billing.createInvoice(dto, user)
  }

  @Post('invoices/:id/card-payment')
  @HttpCode(200)
  @ApiBearerAuth()
  @AuditedInService()
  @AllowReadOnlyTenant()
  @ApiOperation({
    summary: '«To‘ladim» — karta orqali to‘lov',
    description:
      'Faqat administrator. Egasining kartasiga `amount` o‘tkazilgach: kartaning oxirgi 4 raqami, vaqt, ixtiyoriy chek va izoh. ' +
      'Hisob-faktura `pending` (`provider: card`) — egasi bankda ko‘rib tasdiqlaydi (tarif uzayadi) yoki rad etadi ' +
      '(`cancelled`, `rejectReason`); natija — `billing.invoice` hodisasi.',
  })
  @ApiOkResponse({ type: InvoiceDto })
  @ApiResponse({ status: 409, description: 'ALREADY_EXISTS — boshqa karta to‘lovi tekshiruvda (`meta.invoiceId`)', type: ApiErrorDto })
  @ApiResponse({
    status: 422,
    description: 'INVALID_STATUS_TRANSITION — hisob-faktura `created` emas; PAYMENT_METHOD_UNAVAILABLE — egasi kartani kiritmagan; REFERENCE_NOT_FOUND — chek',
    type: ApiErrorDto,
  })
  claimCard(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CardClaimDto, @CurrentUser() user: AuthContext): Promise<InvoiceDto> {
    return this.billing.claimCard(id, dto, user)
  }

  @Get('invoices')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hisob-fakturalar tarixi', description: 'Faqat administrator; oxirgi 50 ta.' })
  @ApiOkResponse({ type: [InvoiceDto] })
  invoices(@CurrentUser() user: AuthContext): Promise<InvoiceDto[]> {
    return this.billing.invoices(user)
  }

  @Public()
  // Jurnal — servisda (`billing.paid`), faqat natijali amal
  @AuditedInService()
  @Post('payme')
  @HttpCode(200)
  @ApiOperation({ summary: 'Payme Merchant API (JSON-RPC)', description: '`Authorization: Basic base64("Paycom:KEY")`; xato ham 200.' })
  paymeWebhook(@Body() body: PaymeRequestDto, @Headers('authorization') authorization?: string): Promise<PaymeResponse> {
    return this.payme.handle(body, authorization)
  }

  @Public()
  // Jurnal — servisda (`billing.paid`), faqat natijali amal
  @AuditedInService()
  @Post('click/prepare')
  @HttpCode(200)
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiOperation({ summary: 'Click SHOP API — prepare' })
  clickPrepare(@Body() body: ClickRequestDto): Promise<ClickResponse> {
    return this.click.prepare(body)
  }

  @Public()
  // Jurnal — servisda (`billing.paid`), faqat natijali amal
  @AuditedInService()
  @Post('click/complete')
  @HttpCode(200)
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiOperation({ summary: 'Click SHOP API — complete' })
  clickComplete(@Body() body: ClickRequestDto): Promise<ClickResponse> {
    return this.click.complete(body)
  }
}
