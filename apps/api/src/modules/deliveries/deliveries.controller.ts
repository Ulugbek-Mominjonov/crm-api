import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiOperation, ApiTags, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { DeliveriesService } from './deliveries.service'
import {
  CreateDeliveryDto, DeliveryDto, DeliveryPageDto, DeliveryQueryDto, DeliveryStatusDto, DeliverySummaryDto, RouteQueryDto,
  RouteSheetDto, UpdateDeliveryDto,
} from './dto/delivery.dto'

/** Yetkazib berish (T-074, T-075) */
@ApiTags('deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  @RequirePermission('deliveries', 'view')
  @ApiOperation({ summary: 'Yetkazishlar' })
  @ApiOkResponse({ type: DeliveryPageDto })
  list(@Query() query: DeliveryQueryDto): Promise<Paged<DeliveryDto>> {
    return this.deliveries.list(query)
  }

  // `:id` dan OLDIN — aks holda `summary`/`my`/`route` id deb o'qilardi
  @Get('summary')
  @RequirePermission('deliveries', 'view')
  @ApiOperation({ summary: 'Yetkazishlar xulosasi', description: 'Holatlar bo‘yicha son, yetkazilganlar narxi, haydovchilar yuki' })
  @ApiOkResponse({ type: DeliverySummaryDto })
  summary(): Promise<DeliverySummaryDto> {
    return this.deliveries.summary()
  }

  @Get('my')
  @RequirePermission('deliveries', 'view')
  @ApiOperation({ summary: 'Haydovchi ko‘rinishi', description: 'Faqat O‘ZIGA biriktirilgan faol yetkazishlar (xodim tokendan)' })
  @ApiOkResponse({ type: [DeliveryDto] })
  mine(@CurrentUser() user: AuthContext): Promise<DeliveryDto[]> {
    return this.deliveries.mine(user)
  }

  @Get('route')
  @RequirePermission('deliveries', 'view')
  @ApiOperation({ summary: 'Marshrut varaqasi', description: 'Haydovchining kungi yetkazishlari, olinadigan pul bilan — bitta so‘rov' })
  @ApiOkResponse({ type: RouteSheetDto })
  route(@Query() query: RouteQueryDto, @CurrentUser() user: AuthContext): Promise<RouteSheetDto> {
    return this.deliveries.route(query, user)
  }

  @Get(':id')
  @RequirePermission('deliveries', 'view')
  @ApiOperation({ summary: 'Yetkazish' })
  @ApiOkResponse({ type: DeliveryDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<DeliveryDto> {
    return this.deliveries.get(id)
  }

  @Post()
  @RequirePermission('deliveries', 'create')
  @AuditedInService()
  @ApiOperation({ summary: 'Yetkazish qo‘shish', description: 'Chekli — narx chekdan (D3); chekSIZ — `fee` alohida' })
  @ApiCreatedResponse({ type: DeliveryDto })
  create(@Body() dto: CreateDeliveryDto): Promise<DeliveryDto> {
    return this.deliveries.create(dto)
  }

  @Patch(':id')
  @RequirePermission('deliveries', 'edit')
  @AuditedInService()
  @ApiOperation({ summary: 'Yetkazishni tahrirlash', description: 'Faqat faol holatda; holat — alohida yo‘l bilan' })
  @ApiOkResponse({ type: DeliveryDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeliveryDto): Promise<DeliveryDto> {
    return this.deliveries.update(id, dto)
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('deliveries', 'view')
  @AuditedInService()
  @ApiOperation({
    summary: 'Holatni o‘zgartirish',
    description: 'Faqat oldinga: pending → on_way → delivered; faoldan — cancelled. Tahrir huquqi yo‘q bo‘lsa — faqat o‘z yetkazishi.',
  })
  @ApiOkResponse({ type: DeliveryDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_STATUS_TRANSITION', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'Boshqa haydovchining yetkazishi', type: ApiErrorDto })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliveryStatusDto,
    @CurrentUser() user: AuthContext,
  ): Promise<DeliveryDto> {
    return this.deliveries.setStatus(id, dto, user)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('deliveries', 'delete')
  @AuditedInService()
  @ApiOperation({ summary: 'Yetkazishni o‘chirish' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.deliveries.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('deliveries', 'delete')
  @AuditedInService()
  @ApiOperation({ summary: 'O‘chirilgan yetkazishni tiklash (undo)' })
  @ApiOkResponse({ type: DeliveryDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<DeliveryDto> {
    return this.deliveries.restore(id)
  }
}
