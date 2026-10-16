import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { AnalyticsDto, DashboardDto, DashboardQueryDto, PeriodQueryDto, PnlDto, PnlQueryDto } from './dto/report.dto'
import { ReportsService } from './reports.service'

/**
 * Hisobotlar (04-api §7) — `reports.view`. Tushum qoidasi (I4) barcha
 * hisobotda bir xil; foyda maydonlari `profit.view` siz rolda yashiriladi.
 */
@ApiTags('reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Boshqaruv paneli', description: 'Bugun/kecha, balanslar, trend, toplar — bitta so‘rovda' })
  @ApiOkResponse({ type: DashboardDto })
  dashboard(@Query() query: DashboardQueryDto): Promise<DashboardDto> {
    return this.reports.dashboard(query)
  }

  @Get('reports/pnl')
  @RequirePermission('reports', 'view')
  @ApiOperation({
    summary: 'Foyda/zarar',
    description: 'Oldingi davr bilan solishtirish, trend, to‘lov turlari, top mahsulot/sotuvchi, sotilmayotgan tovar',
  })
  @ApiOkResponse({ type: PnlDto })
  pnl(@Query() query: PnlQueryDto): Promise<PnlDto> {
    return this.reports.pnl(query)
  }

  @Get('analytics')
  @RequirePermission('reports', 'view')
  @ApiOperation({
    summary: 'Analitika',
    description: 'ABC (80/95 %) — sotilgan BARCHA mahsulot (sahifalash mijozda), kategoriya va to‘lov taqsimoti, kunlik trend',
  })
  @ApiOkResponse({ type: AnalyticsDto })
  analytics(@Query() query: PeriodQueryDto): Promise<AnalyticsDto> {
    return this.reports.analytics(query)
  }
}
