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
import { EmployeesService } from './employees.service'
import {
  CreateEmployeeDto, EmployeeDto, EmployeeListQueryDto, UpdateEmployeeDto,
} from './dto/employee.dto'

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermission('employees', 'view')
  @ApiOperation({ summary: 'Xodimlar ro‘yxati' })
  @ApiPagedResponse(EmployeeDto)
  list(@Query() query: EmployeeListQueryDto): Promise<Paged<EmployeeDto>> {
    return this.employees.list(query)
  }

  @Get(':id')
  @RequirePermission('employees', 'view')
  @ApiOperation({ summary: 'Bitta xodim' })
  @ApiOkResponse({ type: EmployeeDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeDto> {
    return this.employees.get(id)
  }

  @Post()
  @RequirePermission('employees', 'create')
  @AuditAction('employee.create')
  @ApiOperation({ summary: 'Xodim qo‘shish' })
  @ApiCreatedResponse({ type: EmployeeDto })
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeDto> {
    return this.employees.create(dto)
  }

  @Patch(':id')
  @RequirePermission('employees', 'edit')
  @AuditAction('employee.update')
  @ApiOperation({
    summary: 'Xodimni tahrirlash',
    description: 'Ism va lavozim foydalanuvchi hisobida ham darhol ko‘rinadi (D1).',
  })
  @ApiIfMatch()
  @ApiOkResponse({ type: EmployeeDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'LAST_ADMIN — oxirgi administratorni bo‘shatib bo‘lmaydi', type: ApiErrorDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @IfMatch() version?: Date,
  ): Promise<EmployeeDto> {
    return this.employees.update(id, dto, version)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('employees', 'delete')
  @AuditAction('employee.delete')
  @ApiOperation({ summary: 'Xodimni o‘chirish (yumshoq)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'EMPLOYEE_HAS_USER — avval kirish hisobini o‘chiring', type: ApiErrorDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.employees.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('employees', 'delete')
  @AuditAction('employee.restore')
  @ApiOperation({ summary: 'O‘chirilgan xodimni tiklash (undo)' })
  @ApiOkResponse({ type: EmployeeDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeDto> {
    return this.employees.restore(id)
  }
}
