import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentAdmin, type PlatformContext } from '@/modules/auth/decorators/platform.decorator'
import { CloseRequestDto, PlatformRequestDetailDto, PlatformRequestDto, PlatformRequestsQueryDto, ReplyRequestDto } from './dto/platform-request.dto'
import { PlatformRequestsService } from './platform-requests.service'
import { PlatformRoute } from './platform-route.decorator'

const NOT_FOUND = { description: 'NOT_FOUND', type: ApiErrorDto }
const CLOSED_422 = { status: 422, description: 'INVALID_STATUS_TRANSITION — murojaat allaqachon yopilgan', type: ApiErrorDto }

/** Egasi paneli — do'kon murojaatlari (T-140); egasi ham, operator ham */
@PlatformRoute()
@Controller('platform/requests')
export class PlatformRequestsController {
  constructor(private readonly requests: PlatformRequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'Do‘kon murojaatlari',
    description: 'Yopilmaganlar birinchi, keyin so‘nggi xabar bo‘yicha. `status=open` — javob kutayotganlar (menyu belgisi — `GET /platform/stats` → `openRequests`); `tenantId` — do‘kon kartasi.',
  })
  @ApiPagedResponse(PlatformRequestDto)
  list(@Query() query: PlatformRequestsQueryDto): Promise<Paged<PlatformRequestDto>> {
    return this.requests.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Murojaat va xabarlari' })
  @ApiOkResponse({ type: PlatformRequestDetailDto })
  @ApiNotFoundResponse(NOT_FOUND)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformRequestDetailDto> {
    return this.requests.get(id)
  }

  @Post(':id/reply')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({
    summary: 'Javob yozish',
    description: 'Holat `answered`; do‘kon administratori javobni bannerda va murojaat oynasida ko‘radi (`tenant.request` hodisasi). Blokni olish — alohida `POST /platform/tenants/:id/unblock`.',
  })
  @ApiOkResponse({ type: PlatformRequestDetailDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiResponse(CLOSED_422)
  reply(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplyRequestDto, @CurrentAdmin() admin: PlatformContext): Promise<PlatformRequestDetailDto> {
    return this.requests.reply(id, dto, admin)
  }

  @Post(':id/close')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({ summary: 'Murojaatni yopish', description: 'Ixtiyoriy yakuniy javob bilan. Yopilganiga do‘kon yozolmaydi — kerak bo‘lsa yangisini ochadi.' })
  @ApiOkResponse({ type: PlatformRequestDetailDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiResponse(CLOSED_422)
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseRequestDto, @CurrentAdmin() admin: PlatformContext): Promise<PlatformRequestDetailDto> {
    return this.requests.close(id, dto, admin)
  }
}
