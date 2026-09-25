import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import {
  AudiencePreviewDto, MessageAudienceDto, MessageDto, MessagePageDto, MessageQueryDto, SendMessageDto,
} from './dto/message.dto'
import { MessagesService } from './messages.service'

/** Xabarlar (SMS) — mijozlar bilan ishlash huquqi (frontend bilan bir xil) */
@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @RequirePermission('customers', 'view')
  @ApiOperation({ summary: 'Xabarlar jurnali', description: 'Har xabarda yuborish holati statistikasi' })
  @ApiOkResponse({ type: MessagePageDto })
  list(@Query() query: MessageQueryDto): Promise<Paged<MessageDto>> {
    return this.messages.list(query)
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermission('customers', 'view')
  @ApiOperation({ summary: 'Qabul qiluvchilar soni', description: 'Yubormaydi — faqat kim oladi (serverda hisoblanadi)' })
  @ApiOkResponse({ type: AudiencePreviewDto })
  preview(@Body() dto: MessageAudienceDto): Promise<AudiencePreviewDto> {
    return this.messages.preview(dto)
  }

  @Post()
  @RequirePermission('customers', 'create')
  @AuditedInService()
  @ApiOperation({
    summary: 'Xabar yuborish',
    description:
      'Qabul qiluvchilar serverda hisoblanadi, shablon o‘zgaruvchilari almashtiriladi. Yuborish fonda (navbat) — ' +
      'so‘rov kutmaydi. Kunlik chegara bor.',
  })
  @ApiCreatedResponse({ type: MessageDto })
  @ApiResponse({ status: 429, description: 'MESSAGE_LIMIT_EXCEEDED', type: ApiErrorDto })
  send(@Body() dto: SendMessageDto): Promise<MessageDto> {
    return this.messages.send(dto)
  }
}
