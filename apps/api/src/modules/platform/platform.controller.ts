import { Controller, Get, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { PlatformAuditEntryDto, PlatformAuditQueryDto } from './dto/platform-audit.dto'
import { PlatformInvoiceDto, PlatformInvoicesQueryDto } from './dto/platform-billing.dto'
import { PlatformStatsDto } from './dto/platform-stats.dto'
import { PlatformAuditService } from './platform-audit.service'
import { PlatformBillingService } from './platform-billing.service'
import { PlatformRoute } from './platform-route.decorator'
import { PlatformStatsService } from './platform-stats.service'

/** Egasi paneli — boshqaruv paneli, barcha to'lovlar, egasi jurnali (T-135) */
@PlatformRoute()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly stats: PlatformStatsService,
    private readonly billing: PlatformBillingService,
    private readonly audit: PlatformAuditService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Boshqaruv paneli', description: 'Do‘konlar holat va tarif bo‘yicha, shu oyda ochilganlar, 7 kunda tugaydiganlar, muddati o‘tganlar; oylik tushum (12 oy).' })
  @ApiOkResponse({ type: PlatformStatsDto })
  getStats(): Promise<PlatformStatsDto> {
    return this.stats.stats()
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Barcha do‘konlar hisob-fakturalari', description: 'Holat, provayder (onlayn yoki qo‘lda), sana oralig‘i va do‘kon bo‘yicha filtr; eng yangisi birinchi.' })
  @ApiPagedResponse(PlatformInvoiceDto)
  invoices(@Query() query: PlatformInvoicesQueryDto): Promise<Paged<PlatformInvoiceDto>> {
    return this.billing.invoices(query)
  }

  @Get('audit')
  @ApiOperation({ summary: 'Egasi amallari jurnali', description: 'Kim, qachon, qaysi do‘konga nima qildi (blok, tarif, parol, ochish, o‘chirish); faqat qo‘shiladi.' })
  @ApiPagedResponse(PlatformAuditEntryDto)
  auditLog(@Query() query: PlatformAuditQueryDto): Promise<Paged<PlatformAuditEntryDto>> {
    return this.audit.list(query)
  }
}
