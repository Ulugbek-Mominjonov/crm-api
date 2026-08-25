import { Controller, Get, Res } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { Public } from '@/modules/auth/decorators/public.decorator'
import { HealthService } from './health.service'
import type { HealthReport } from './health.types'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('live')
  @ApiOperation({
    summary: 'Jarayon tirikmi',
    description:
      'Hech qanday bog‘liqlikni tekshirmaydi. Orkestrator shu bo‘yicha ' +
      'konteynerni qayta ishga tushiradi — baza tushganda qayta ishga ' +
      'tushirish yordam bermaydi, shuning uchun u bu yerda tekshirilmaydi.',
  })
  @ApiOkResponse({ schema: { example: { status: 'ok', uptimeSec: 42 } } })
  live(): { status: 'ok'; uptimeSec: number } {
    return this.health.liveness()
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Trafik qabul qilishga tayyormi',
    description: 'Baza va obyekt saqlagich tekshiriladi. Yuk balanslagich shu bo‘yicha trafik yuboradi.',
  })
  @ApiOkResponse({ schema: { example: { status: 'ok', uptimeSec: 42, checks: [{ name: 'database', ok: true, ms: 3 }] } } })
  @ApiServiceUnavailableResponse({ description: 'Bog‘liqliklardan biri javob bermayapti' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.readiness()
    // Tayyor emas — 503. Aks holda balanslagich nosoz instansiyaga trafik yuboradi.
    res.status(report.status === 'ok' ? 200 : 503)
    return report
  }
}
