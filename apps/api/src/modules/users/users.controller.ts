import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common'
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse,
  ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { ApiIfMatch, IfMatch } from '@/common/http/if-match.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { AuditAction } from '@/modules/audit/audit.decorator'
import { ApiPlanLimit } from '@/modules/tenants/api-plan-limit.decorator'
import { UsersService } from './users.service'
import { CreateUserDto, UpdateUserDto, UserDto, UserListQueryDto } from './dto/user.dto'

/** Foydalanuvchilarni faqat `users` huquqi bor rol boshqaradi (matritsada — admin) */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('users', 'view')
  @ApiOperation({
    summary: 'Foydalanuvchilar ro‘yxati',
    description: 'Ism va lavozim xodim yozuvidan (D1). `deleted=true` — o‘chirilganlar (tiklash uchun).',
  })
  @ApiPagedResponse(UserDto)
  list(@Query() query: UserListQueryDto): Promise<Paged<UserDto>> {
    return this.users.list(query)
  }

  @Get(':id')
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'Bitta foydalanuvchi' })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return this.users.get(id)
  }

  @Post()
  @RequirePermission('users', 'create')
  @AuditAction('user.create')
  @ApiOperation({
    summary: 'Kirish hisobi yaratish',
    description: 'Mavjud xodimga bog‘lanadi — ism va lavozim alohida kiritilmaydi (D1).',
  })
  @ApiCreatedResponse({ type: UserDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED — masalan kuchsiz parol', type: ApiErrorDto })
  @ApiConflictResponse({
    description:
      'EMPLOYEE_HAS_USER (`meta.userId`, `meta.deleted` — o‘chirilgan bo‘lsa uni tiklang) | ALREADY_EXISTS (email)',
    type: ApiErrorDto,
  })
  @ApiUnprocessableEntityResponse({ description: 'REFERENCE_NOT_FOUND — xodim yo‘q', type: ApiErrorDto })
  @ApiPlanLimit()
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(dto)
  }

  @Patch(':id')
  @RequirePermission('users', 'edit')
  @AuditAction('user.update')
  @ApiOperation({
    summary: 'Foydalanuvchini tahrirlash',
    description: 'Parol almashsa yoki hisob faolsizlantirilsa — barcha sessiyalari yopiladi.',
  })
  @ApiIfMatch()
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'ALREADY_EXISTS (email)', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'LAST_ADMIN | SELF_ROLE_CHANGE | SELF_DELETE', type: ApiErrorDto })
  @ApiPlanLimit()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @IfMatch() version?: Date,
  ): Promise<UserDto> {
    return this.users.update(id, dto, version)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('users', 'delete')
  @AuditAction('user.delete')
  @ApiOperation({ summary: 'Foydalanuvchini o‘chirish (yumshoq)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'LAST_ADMIN | SELF_DELETE', type: ApiErrorDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.users.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('users', 'delete')
  @AuditAction('user.restore')
  @ApiOperation({
    summary: 'O‘chirilgan foydalanuvchini tiklash',
    description: 'O‘chirilganlar — `GET /users?deleted=true`. Parol va rol o‘zgarmaydi; eski sessiyalar qaytmaydi.',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'REFERENCE_NOT_FOUND — xodim o‘chirilgan (avval uni tiklang)', type: ApiErrorDto })
  @ApiPlanLimit()
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return this.users.restore(id)
  }
}
