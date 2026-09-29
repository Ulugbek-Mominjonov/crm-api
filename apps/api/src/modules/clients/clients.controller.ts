import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { ApiIfMatch, IfMatch } from '@/common/http/if-match.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { AuditAction } from '@/modules/audit/audit.decorator'
import { TelegramLinkDto } from '@/modules/telegram/dto/telegram.dto'
import { TelegramService } from '@/modules/telegram/telegram.service'
import { ClientsService } from './clients.service'
import { ClientDto, ClientListQueryDto, ClientStatsDto, CreateClientDto, UpdateClientDto } from './dto/client.dto'

/** Mijozlar — `customers` huquqi (04-api §1) */
@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly telegram: TelegramService,
  ) {}

  @Get()
  @RequirePermission('customers', 'view')
  @ApiOperation({
    summary: 'Mijozlar ro‘yxati',
    description: '`q` — nom, kompaniya va telefon raqamlari bo‘yicha; `phone` — aniq moslik.',
  })
  @ApiPagedResponse(ClientDto)
  list(@Query() query: ClientListQueryDto): Promise<Paged<ClientDto>> {
    return this.clients.list(query)
  }

  @Get(':id/stats')
  @RequirePermission('customers', 'view')
  @ApiOperation({ summary: 'Mijoz kartasi raqamlari', description: 'Sof xarid, qarz, muddati o‘tgani, oxirgi xarid — bitta so‘rov.' })
  @ApiOkResponse({ type: ClientStatsDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  stats(@Param('id', ParseUUIDPipe) id: string): Promise<ClientStatsDto> {
    return this.clients.stats(id)
  }

  @Get(':id')
  @RequirePermission('customers', 'view')
  @ApiOperation({ summary: 'Bitta mijoz' })
  @ApiOkResponse({ type: ClientDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ClientDto> {
    return this.clients.get(id)
  }

  @Post()
  @RequirePermission('customers', 'create')
  @AuditAction('client.create')
  @ApiOperation({ summary: 'Mijoz qo‘shish' })
  @ApiCreatedResponse({ type: ClientDto })
  create(@Body() dto: CreateClientDto): Promise<ClientDto> {
    return this.clients.create(dto)
  }

  @Patch(':id')
  @RequirePermission('customers', 'edit')
  @AuditAction('client.update')
  @ApiOperation({ summary: 'Mijozni tahrirlash', description: 'Bonus ballari bu yerda o‘zgarmaydi (I17).' })
  @ApiIfMatch()
  @ApiOkResponse({ type: ClientDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @IfMatch() version?: Date,
  ): Promise<ClientDto> {
    return this.clients.update(id, dto, version)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('customers', 'delete')
  @AuditAction('client.delete')
  @ApiOperation({ summary: 'Mijozni o‘chirish (yumshoq)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'CLIENT_HAS_DEBT — to‘lanmagan nasiya bor', type: ApiErrorDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.clients.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('customers', 'delete')
  @AuditAction('client.restore')
  @ApiOperation({ summary: 'O‘chirilgan mijozni tiklash (undo)' })
  @ApiOkResponse({ type: ClientDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<ClientDto> {
    return this.clients.restore(id)
  }

  @Post(':id/telegram-link')
  @HttpCode(200)
  @RequirePermission('customers', 'edit')
  @AuditAction('client.telegramLinkIssued')
  @ApiOperation({
    summary: 'Telegram’ga ulash — shaxsiy havola (QR uchun)',
    description:
      'Mijoz havolani (QR) ochib Start bosadi — bot shu mijozga ulanadi, raqam yuborish shart emas. ' +
      'Bir martalik, 7 kun amal qiladi; har chaqiruv yangisini beradi (eskisi bekor).',
  })
  @ApiOkResponse({ type: TelegramLinkDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'RECIPIENT_UNREACHABLE (`meta.reason: no_channel`) — bot sozlanmagan', type: ApiErrorDto })
  telegramLink(@Param('id', ParseUUIDPipe) id: string): Promise<TelegramLinkDto> {
    return this.telegram.createLink(id)
  }
}
