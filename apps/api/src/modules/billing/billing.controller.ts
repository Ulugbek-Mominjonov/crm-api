import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { Public } from '@/modules/auth/decorators/public.decorator'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { AllowReadOnlyTenant } from '@/modules/tenants/read-only.interceptor'
import { BillingService } from './billing.service'
import { ClickService, type ClickResponse } from './click.service'
import { CheckoutDto, CreateInvoiceDto, InvoiceDto } from './dto/billing.dto'
import { ClickRequestDto, PaymeRequestDto } from './dto/webhook.dto'
import { PaymeService, type PaymeResponse } from './payme.service'

/**
 * Obuna to'lovlari (T-126). Hisob-faktura — administrator; provayder
 * webhooklari ochiq, lekin imzo/kalit bilan (Payme — Basic, Click — MD5).
 */
@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly payme: PaymeService,
    private readonly click: ClickService,
  ) {}

  @Post('invoices')
  @ApiBearerAuth()
  @AuditedInService()
  // To'xtatilgan do'kon ham to'lay olishi shart — aynan shu yo'l bilan ochiladi
  @AllowReadOnlyTenant()
  @ApiOperation({
    summary: 'Hisob-faktura (tarif × oy)',
    description: 'Faqat administrator. Javobda Payme va Click to‘lov sahifalari. Tarif to‘lov TASDIQLANGACH o‘zgaradi.',
  })
  @ApiCreatedResponse({ type: CheckoutDto })
  createInvoice(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthContext): Promise<CheckoutDto> {
    return this.billing.createInvoice(dto, user)
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
