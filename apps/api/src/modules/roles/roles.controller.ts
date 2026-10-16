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
 * Rollar (T-134) — `roles.*` ruxsatlari (hisob formasidagi rol tanlovi uchun
 * `users.create/edit` `roles.view` ni o'zi qo'shadi). Administrator bo'lmagan
 * egasi faqat o'zida bor ruxsatlar doirasida ishlaydi (RolesService).
 */
@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission('roles', 'view')
  @ApiOperation({
    summary: 'Do‘kon rollari',
    description: 'Hammasi, sahifasiz: avval tizim rollari (admin, manager, sotuvchi, omborchi), keyin nom bo‘yicha.',
  })
  @ApiOkResponse({ type: [RoleDto] })
  list(): Promise<RoleDto[]> {
    return this.roles.list()
  }

  @Get('catalog')
  @RequirePermission('roles', 'view')
  @ApiOperation({
    summary: 'Ruxsatlar katalogi',
    description: 'Rol oynasi shundan quriladi: guruhlar → bo‘limlar (modullar) → amallar. Statik — keshlash mumkin.',
  })
  @ApiOkResponse({ type: PermissionCatalogDto })
  catalog(): PermissionCatalogDto {
    return this.roles.catalog()
  }

  @Get(':id')
  @RequirePermission('roles', 'view')
  @ApiOperation({ summary: 'Bitta rol' })
  @ApiOkResponse({ type: RoleDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RoleDto> {
    return this.roles.get(id)
  }

  @Post()
  @RequirePermission('roles', 'create')
  @AuditedInService()
  @ApiOperation({ summary: 'Rol yaratish', description: 'Administrator bo‘lmagan — faqat o‘zida bor ruxsatlardan.' })
  @ApiCreatedResponse({ type: RoleDto })
  @ApiForbiddenResponse({ description: 'PERMISSION_DENIED — ruxsat yo‘q yoki o‘zingizdan kengroq rol/ruxsat', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'ALREADY_EXISTS (`name`)', type: ApiErrorDto })
  create(@Body() dto: CreateRoleDto): Promise<RoleDto> {
    return this.roles.create(dto)
  }

  @Patch(':id')
  @RequirePermission('roles', 'edit')
  @AuditedInService()
  @ApiOperation({
    summary: 'Rolni tahrirlash: ruxsat berish va olib tashlash',
    description:
      '`permissions` — TO‘LIQ ro‘yxat (almashtiriladi, qo‘shilmaydi). Ruxsat o‘zgarsa — shu rol foydalanuvchilariga ' +
      'keyingi so‘rovdanoq kuchga kiradi, do‘konga `access.changed` hodisasi. Administrator bo‘lmagan — faqat o‘zidan ' +
      'keng bo‘lmagan rolni va faqat o‘zida bor ruxsatlar bilan.',
  })
  @ApiIfMatch()
  @ApiOkResponse({ type: RoleDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'PERMISSION_DENIED — ruxsat yo‘q yoki o‘zingizdan kengroq rol/ruxsat', type: ApiErrorDto })
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
  @RequirePermission('roles', 'delete')
  @AuditedInService()
  @ApiOperation({
    summary: 'Rolni o‘chirish',
    description: 'Faqat do‘kon yaratgan rol. Foydalanuvchilari bo‘lsa — `replaceWith` rolga o‘tkaziladi (o‘chirilgan hisoblar ham).',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'PERMISSION_DENIED — ruxsat yo‘q yoki o‘zingizdan kengroq rol/ruxsat', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'ROLE_IN_USE — `replaceWith` berilmagan (`meta.users` — nechta)', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({
    description: 'ROLE_PROTECTED — tizim roli | REFERENCE_NOT_FOUND (`replaceWith`)',
    type: ApiErrorDto,
  })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Query() query: DeleteRoleQueryDto): Promise<void> {
    await this.roles.remove(id, query.replaceWith)
  }
}
