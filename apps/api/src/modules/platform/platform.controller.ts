import { Body, Controller, Get, Patch, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentAdmin, PlatformRoles, type PlatformContext } from '@/modules/auth/decorators/platform.decorator'
import { PlatformAuditEntryDto, PlatformAuditQueryDto } from './dto/platform-audit.dto'
import { PlatformInvoiceDto, PlatformInvoicesQueryDto } from './dto/platform-billing.dto'
import { PlatformSettingsDto, UpdatePlatformSettingsDto } from './dto/platform-settings.dto'
import { PlatformStatsDto } from './dto/platform-stats.dto'
import { PlatformAuditService } from './platform-audit.service'
import { PlatformBillingService } from './platform-billing.service'
import { PlatformRoute } from './platform-route.decorator'
import { PlatformSettingsService } from './platform-settings.service'
import { PlatformStatsService } from './platform-stats.service'

/** Egasi paneli — boshqaruv paneli, barcha to'lovlar, egasi jurnali (T-135), sozlama (T-138) */
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
