import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Redirect, Res, StreamableFile } from '@nestjs/common'
import {
  ApiAcceptedResponse, ApiBearerAuth, ApiFoundResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces,
  ApiTags,
} from '@nestjs/swagger'
import type { Response } from 'express'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { PRESIGN_TTL_SEC } from '@/modules/files/s3.service'
import { ExportJobDto, ExportParamsDto, ExportQueryDto } from './dto/export.dto'
import { ExportsService, INLINE_MAX_ROWS } from './exports.service'

/** Brauzer havolani keshlaydi — imzo muddatidan bir daqiqa oldin eskiradi */
const DOWNLOAD_CACHE_SEC = PRESIGN_TTL_SEC - 60

/**
 * Eksport (T-084). Huquq ro'yxatga bog'liq (sotuvlar — `sales`, mijozlar
 * — `customers` …) va servisda tekshiriladi: yo'l darajasida faqat
 * autentifikatsiya (every-route-guarded oq ro'yxati).
 */
@ApiTags('exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('jobs/:id')
  @ApiOperation({
    summary: 'Eksport ishi holati',
    description: 'Faqat so‘rovchi ko‘radi. Tayyor bo‘lsa — `url` (imzolangan havola, `expiresAt` gacha): brauzerda `window.location` bilan oching.',
  })
  @ApiOkResponse({ type: ExportJobDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  job(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext): Promise<ExportJobDto> {
    return this.exports.job(id, user)
  }

  @Get('jobs/:id/download')
  @Redirect()
  @Header('Cache-Control', `private, max-age=${DOWNLOAD_CACHE_SEC}`)
  @ApiOperation({ summary: 'Tayyor eksportni yuklab olish (302 → presigned GET)', description: 'Faqat so‘rovchi.' })
  @ApiFoundResponse({ description: '`Location` — imzolangan havola (`attachment`)' })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<{ url: string; statusCode: number }> {
    return { url: await this.exports.downloadUrl(id, user), statusCode: 302 }
  }

  @Get(':resource')
  @ApiOperation({
    summary: 'Ro‘yxatni eksport qilish (CSV/JSON)',
    description:
      `${INLINE_MAX_ROWS} qatorgacha — darhol fayl (200, CSV — UTF-8 BOM bilan). Ko‘p bo‘lsa — fon ishi (202): ` +
      'holat `GET /exports/jobs/{id}`, tayyor bo‘lgach javobdagi `url` (yoki `…/download`). Tannarx kabi maydonlar rolga qarab chiqmaydi.',
  })
  @ApiProduces('text/csv', 'application/json')
  @ApiOkResponse({ description: 'Fayl (`Content-Disposition: attachment`)' })
  @ApiAcceptedResponse({ type: ExportJobDto, description: 'Katta eksport — fonda' })
  async export(
    @Param() { resource }: ExportParamsDto,
    @Query() query: ExportQueryDto,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | ExportJobDto> {
    const result = await this.exports.start(resource, query, user)
    if ('job' in result) {
      res.status(202)
      return result.job
    }
    const { body, mime, filename } = result.file
    return new StreamableFile(body, {
      type: `${mime}; charset=utf-8`,
      disposition: `attachment; filename="${filename}"`,
      length: body.length,
    })
  }
}
