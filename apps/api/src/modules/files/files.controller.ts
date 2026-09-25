import {
  Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Redirect,
} from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiFoundResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiPayloadTooLargeResponse, ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { FileDto, FileUrlsDto, FileUrlsQueryDto, PresignDto, PresignResultDto, RawQueryDto, UsageDto } from './dto/file.dto'
import { FilesService } from './files.service'
import { PRESIGN_TTL_SEC } from './s3.service'

/** Brauzer havolani keshlaydi — imzo muddatidan (10 daq) bir daqiqa oldin eskiradi */
const RAW_CACHE_SEC = PRESIGN_TTL_SEC - 60

/**
 * Fayllar (E11). Huquq fayl TURIGA bog'liq (mahsulot rasmi — `products`,
 * eksport — `finance` …) va servisda tekshiriladi: yo'l darajasida faqat
 * autentifikatsiya (every-route-guarded oq ro'yxati).
 */
@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('presign')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({
    summary: 'Yuklash ruxsati (presigned PUT)',
    description:
      'Tur, MIME (oq ro‘yxat), hajm va kvota tekshiriladi, keyin 10 daqiqalik PUT havolasi beriladi. ' +
      'Shu tarkib (`sha256`) allaqachon bor bo‘lsa — `reused: true`, havola yo‘q, mavjud fayl qaytadi. ' +
      'Jurnalga tasdiqlashda yoziladi (kutilayotgan fayl hali o‘zgarish emas).',
  })
  @ApiOkResponse({ type: PresignResultDto })
  @ApiPayloadTooLargeResponse({ description: 'PAYLOAD_TOO_LARGE | STORAGE_QUOTA_EXCEEDED', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'FILE_REJECTED — shu tarkib avval rad etilgan', type: ApiErrorDto })
  presign(@Body() dto: PresignDto, @CurrentUser() user: AuthContext): Promise<PresignResultDto> {
    return this.files.presign(dto, user)
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({
    summary: 'Yuklashni tasdiqlash',
    description:
      'Obyekt hajmi, boshlanish baytlari (MIME) va xeshi tekshiriladi. Mos kelmasa obyekt o‘chiriladi, ' +
      'fayl karantinga tushadi va jurnalga yoziladi (422). Takroriy chaqiruv — tayyor faylni qaytaradi.',
  })
  @ApiOkResponse({ type: FileDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'FILE_NOT_UPLOADED — obyekt hali PUT qilinmagan', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'FILE_REJECTED', type: ApiErrorDto })
  @ApiPayloadTooLargeResponse({ description: 'STORAGE_QUOTA_EXCEEDED', type: ApiErrorDto })
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext): Promise<FileDto> {
    return this.files.confirm(id, user)
  }

  @Get('usage')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Saqlash hajmi', description: 'Band hajm, tarif chegarasi va tur bo‘yicha taqsimot' })
  @ApiOkResponse({ type: UsageDto })
  usage(): Promise<UsageDto> {
    return this.files.usage()
  }

  @Get('urls')
  @ApiOperation({
    summary: 'Bir nechta fayl havolasi (`<img src>` uchun)',
    description:
      'Sahifadagi rasmlar uchun bitta so‘rov: id → 10 daqiqalik imzolangan havola. Variant tayyor bo‘lmasa — asl fayl. ' +
      'Boshqa do‘kon, tayyor bo‘lmagan yoki huquq yetmagan fayl javobda bo‘lmaydi.',
  })
  @ApiOkResponse({ type: FileUrlsDto })
  urls(@Query() query: FileUrlsQueryDto, @CurrentUser() user: AuthContext): Promise<FileUrlsDto> {
    return this.files.urls(query.ids, query.variant, user)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fayl metama’lumoti' })
  @ApiOkResponse({ type: FileDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext): Promise<FileDto> {
    return this.files.get(id, user)
  }

  @Get(':id/raw')
  @Redirect()
  @Header('Cache-Control', `private, max-age=${RAW_CACHE_SEC}`)
  @ApiOperation({
    summary: 'Faylni o‘qish (302 → presigned GET)',
    description:
      'Huquq tekshiriladi, keyin 10 daqiqalik havolaga yo‘naltiriladi. Variant (`128`, `512`) hali tayyor ' +
      'bo‘lmasa — asl fayl. Boshqa do‘kon fayli — 404.',
  })
  @ApiFoundResponse({ description: '`Location` — imzolangan havola' })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async raw(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RawQueryDto,
    @CurrentUser() user: AuthContext,
  ): Promise<{ url: string; statusCode: number }> {
    return { url: await this.files.rawUrl(id, query.variant, user), statusCode: 302 }
  }

  @Delete(':id')
  @HttpCode(204)
  @AuditedInService()
  @ApiOperation({
    summary: 'Faylni o‘chirish (yumshoq)',
    description: 'Mahsulotlardagi havola uziladi; obyekt 30 kundan keyin tozalanadi (tiklash imkoni uchun).',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext): Promise<void> {
    await this.files.remove(id, user)
  }
}
