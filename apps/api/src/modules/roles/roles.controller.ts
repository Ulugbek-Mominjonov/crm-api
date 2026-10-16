import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { ApiIfMatch, IfMatch } from '@/common/http/if-match.decorator'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { CreateRoleDto, DeleteRoleQueryDto, PermissionCatalogDto, RoleDto, UpdateRoleDto } from './dto/role.dto'
import { RolesService } from './roles.service'

/**
 * Rollar (T-134). O'qish — foydalanuvchilarni ko'radigan rolga (hisobga rol
 * tanlash uchun); yaratish, tahrirlash, o'chirish — faqat administrator
 * (RolesService tekshiradi).
 */
@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission('users', 'view')
  @ApiOperation({
    summary: 'Do‘kon rollari',
    description: 'Hammasi, sahifasiz: avval tizim rollari (admin, manager, sotuvchi, omborchi), keyin nom bo‘yicha.',
  })
  @ApiOkResponse({ type: [RoleDto] })
  list(): Promise<RoleDto[]> {
    return this.roles.list()
  }

  @Get('catalog')
  @RequirePermission('users', 'view')
  @ApiOperation({
    summary: 'Ruxsatlar katalogi',
    description: 'Rol oynasi shundan quriladi: guruhlar → bo‘limlar (modullar) → amallar. Statik — keshlash mumkin.',
  })
  @ApiOkResponse({ type: PermissionCatalogDto })
  catalog(): PermissionCatalogDto {
    return this.roles.catalog()
  }

  @Get(':id')
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'Bitta rol' })
  @ApiOkResponse({ type: RoleDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RoleDto> {
    return this.roles.get(id)
  }

  @Post()
  @AuditedInService()
  @ApiOperation({ summary: 'Rol yaratish (faqat administrator)' })
  @ApiCreatedResponse({ type: RoleDto })
  @ApiForbiddenResponse({ description: 'PERMISSION_DENIED — administrator emas', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'ALREADY_EXISTS (`name`)', type: ApiErrorDto })
  create(@Body() dto: CreateRoleDto): Promise<RoleDto> {
    return this.roles.create(dto)
  }

  @Patch(':id')
  @AuditedInService()
  @ApiOperation({
    summary: 'Rolni tahrirlash (faqat administrator)',
    description:
      '`permissions` — TO‘LIQ ro‘yxat (almashtiriladi, qo‘shilmaydi). Ruxsat o‘zgarsa — shu rol foydalanuvchilariga ' +
      'keyingi so‘rovdanoq kuchga kiradi, do‘konga `access.changed` hodisasi.',
  })
  @ApiIfMatch()
  @ApiOkResponse({ type: RoleDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'PERMISSION_DENIED — administrator emas', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'ALREADY_EXISTS (`name`) | VERSION_CONFLICT', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'ROLE_PROTECTED — `admin` roli yoki tizim rolining nomi', type: ApiErrorDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @IfMatch() version?: Date,
  ): Promise<RoleDto> {
    return this.roles.update(id, dto, version)
  }

  @Delete(':id')
  @HttpCode(204)
  @AuditedInService()
  @ApiOperation({
    summary: 'Rolni o‘chirish (faqat administrator)',
    description: 'Faqat do‘kon yaratgan rol. Foydalanuvchilari bo‘lsa — `replaceWith` rolga o‘tkaziladi (o‘chirilgan hisoblar ham).',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'PERMISSION_DENIED — administrator emas', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'ROLE_IN_USE — `replaceWith` berilmagan (`meta.users` — nechta)', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({
    description: 'ROLE_PROTECTED — tizim roli | REFERENCE_NOT_FOUND (`replaceWith`)',
    type: ApiErrorDto,
  })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Query() query: DeleteRoleQueryDto): Promise<void> {
    await this.roles.remove(id, query.replaceWith)
  }
}
