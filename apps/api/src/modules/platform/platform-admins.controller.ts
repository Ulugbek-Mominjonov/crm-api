import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentAdmin, PlatformRoles, type PlatformContext } from '@/modules/auth/decorators/platform.decorator'
import { CreatePlatformAdminDto, UpdatePlatformAdminDto } from './dto/platform-admin.dto'
import { PlatformAdminDto } from './dto/platform-auth.dto'
import { ResetUserPasswordDto } from './dto/platform-tenant.dto'
import { PlatformAdminsService } from './platform-admins.service'
import { PlatformRoute } from './platform-route.decorator'

/** Egasi paneli — egasi hisoblari va operatorlar (T-139); faqat `owner` roli */
@PlatformRoute()
@PlatformRoles('owner')
@Controller('platform/admins')
export class PlatformAdminsController {
  constructor(private readonly admins: PlatformAdminsService) {}

  @Get()
  @ApiOperation({ summary: 'Egasi hisoblari ro‘yxati', description: 'Egasi va operatorlar: rol, faollik, ikki bosqichli kirish va Telegram holati, oxirgi kirish.' })
  @ApiOkResponse({ type: [PlatformAdminDto] })
  list(): Promise<PlatformAdminDto[]> {
    return this.admins.list()
  }

  @Post()
  @AuditedInService()
  @ApiOperation({ summary: 'Hisob ochish', description: 'Operator yoki yana bir egasi. Parolni siz aytasiz; u keyin ikki bosqichli kirishni o‘zi yoqadi.' })
  @ApiCreatedResponse({ type: PlatformAdminDto })
  @ApiResponse({ status: 409, description: 'ALREADY_EXISTS — bu email bilan hisob bor', type: ApiErrorDto })
  create(@Body() dto: CreatePlatformAdminDto): Promise<PlatformAdminDto> {
    return this.admins.create(dto)
  }

  @Patch(':id')
  @AuditedInService()
  @ApiOperation({ summary: 'Nom, rol, faollik', description: '`isActive: false` — hisob kira olmaydi, sessiyalari yopiladi. O‘z rolini o‘zgartirish yoki o‘zini faolsizlantirish — 422.' })
  @ApiOkResponse({ type: PlatformAdminDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'SELF_ROLE_CHANGE | SELF_DELETE', type: ApiErrorDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlatformAdminDto, @CurrentAdmin() actor: PlatformContext): Promise<PlatformAdminDto> {
    return this.admins.update(id, dto, actor.adminId)
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @AuditedInService()
  @ApiOperation({ summary: 'Hisobga yangi parol', description: 'Barcha sessiyalari yopiladi. O‘z hisobingiz uchun ham ishlaydi (joriy sessiya ham yopiladi — qayta kiring).' })
  @ApiResponse({ status: 204, description: 'Parol o‘zgartirildi' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', type: ApiErrorDto })
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetUserPasswordDto): Promise<void> {
    await this.admins.resetPassword(id, dto.password)
  }

  @Post(':id/totp/reset')
  @HttpCode(204)
  @AuditedInService()
  @ApiOperation({ summary: 'Ikki bosqichli kirishni olib tashlash', description: 'Qurilma yo‘qolganda: hisob yana faqat parol bilan kiradi va qayta sozlaydi.' })
  @ApiResponse({ status: 204, description: 'Olib tashlandi' })
  @ApiResponse({ status: 422, description: 'INVALID_STATUS_TRANSITION — yoqilmagan', type: ApiErrorDto })
  async resetTotp(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.admins.resetTotp(id)
  }
}
