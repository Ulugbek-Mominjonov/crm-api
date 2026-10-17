import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import {
  ApiBearerAuth, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { AllowReadOnlyTenant } from '@/modules/tenants/read-only.interceptor'
import { AddRequestMessageDto, CreateTenantRequestDto, TenantRequestDto } from './dto/tenant-request.dto'
import { STORE_MESSAGES_PER_DAY, TenantRequestsService } from './tenant-requests.service'

const LIMIT_429 = { status: 429, description: `MESSAGE_LIMIT_EXCEEDED — 24 soatda ${STORE_MESSAGES_PER_DAY} ta xabar (\`meta.limit/used\`)`, type: ApiErrorDto }

/** Do'konning platforma egasiga murojaati (T-140). Faqat administrator — servis tekshiradi */
@ApiTags('account')
@ApiBearerAuth()
@Controller('tenants/current/requests')
export class TenantRequestsController {
  constructor(private readonly requests: TenantRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Murojaatlar tarixi', description: 'Eng yangisi birinchi (20 tagacha), har birida barcha xabarlar. Yopilmagani (`status ≠ closed`) — bannerda ko‘rsatiladigani.' })
  @ApiOkResponse({ type: [TenantRequestDto] })
  list(@CurrentUser() user: AuthContext): Promise<TenantRequestDto[]> {
    return this.requests.list(user)
  }

  @Post()
  @AuditedInService()
  @AllowReadOnlyTenant()
  @ApiOperation({
    summary: 'Egasiga murojaat yuborish',
    description:
      'Bloklangan va to‘xtatilgan do‘konda ham ishlaydi. Egasiga Telegram orqali darhol yetadi; javob — shu ro‘yxatda ' +
      '(`tenant.request` hodisasi). Bir vaqtda bitta yopilmagan murojaat: bor bo‘lsa 409 `ALREADY_EXISTS` (`meta.requestId`) — xabarni unga yozing.',
  })
  @ApiCreatedResponse({ type: TenantRequestDto })
  @ApiResponse({ status: 409, description: 'ALREADY_EXISTS — yopilmagan murojaat bor (`errors[0].meta.requestId`)', type: ApiErrorDto })
  @ApiResponse(LIMIT_429)
  create(@Body() dto: CreateTenantRequestDto, @CurrentUser() user: AuthContext): Promise<TenantRequestDto> {
    return this.requests.create(dto, user)
  }

  @Post(':id/messages')
  @AllowReadOnlyTenant()
  @ApiOperation({ summary: 'Murojaatga xabar qo‘shish', description: 'Yopilmagan murojaatga qo‘shimcha gap yoki egasi javobiga javob; holat yana `open` bo‘ladi.' })
  @ApiCreatedResponse({ type: TenantRequestDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_STATUS_TRANSITION — murojaat yopilgan, yangisini yuboring', type: ApiErrorDto })
  @ApiResponse(LIMIT_429)
  addMessage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddRequestMessageDto, @CurrentUser() user: AuthContext): Promise<TenantRequestDto> {
    return this.requests.addMessage(id, dto, user)
  }
}
