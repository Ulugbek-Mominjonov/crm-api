import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { Idempotent } from '@/modules/idempotency/idempotent.decorator'
import {
  CreateExpenseDto, CreateExpenseTemplateDto, ExpenseDto, ExpensePageDto, ExpenseQueryDto, ExpenseSummaryDto,
  ExpenseTemplateDto, RunDueResultDto, UpdateExpenseDto, UpdateExpenseTemplateDto,
} from './dto/expense.dto'
import { ExpenseTemplatesService } from './expense-templates.service'
import { ExpensesService } from './expenses.service'

/** Xarajatlar (T-062): naqd xarajat kassadan chiqadi */
@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermission('expenses', 'view')
  @ApiOperation({ summary: 'Xarajatlar ro‘yxati' })
  @ApiOkResponse({ type: ExpensePageDto })
  list(@Query() query: ExpenseQueryDto): Promise<Paged<ExpenseDto>> {
    return this.expenses.list(query)
  }

  @Get('summary')
  @RequirePermission('expenses', 'view')
  @ApiOperation({
    summary: 'Xarajatlar xulosasi',
    description: 'Bugun, oy va jami — filtrsiz; kategoriya taqsimoti — ro‘yxat filtrlari bilan.',
  })
  @ApiOkResponse({ type: ExpenseSummaryDto })
  summary(@Query() query: ExpenseQueryDto): Promise<ExpenseSummaryDto> {
    return this.expenses.summary(query)
  }

  @Get(':id')
  @RequirePermission('expenses', 'view')
  @ApiOperation({ summary: 'Xarajat' })
  @ApiOkResponse({ type: ExpenseDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ExpenseDto> {
    return this.expenses.get(id)
  }

  @Post()
  @RequirePermission('expenses', 'create')
  @Idempotent()
  @AuditedInService()
  @ApiOperation({ summary: 'Xarajat qo‘shish', description: 'Naqd — kassadan chiqadi, ochiq smena shart (I8). Idempotent.' })
  @ApiCreatedResponse({ type: ExpenseDto })
  @ApiResponse({ status: 423, description: 'SHIFT_REQUIRED', type: ApiErrorDto })
  create(@Body() dto: CreateExpenseDto): Promise<ExpenseDto> {
    return this.expenses.create(dto)
  }

  @Patch(':id')
  @RequirePermission('expenses', 'edit')
  @AuditedInService()
  @ApiOperation({ summary: 'Xarajatni tahrirlash', description: 'Eski kassa ta’siri qaytarilib, yangisi qo‘llanadi' })
  @ApiOkResponse({ type: ExpenseDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto): Promise<ExpenseDto> {
    return this.expenses.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('expenses', 'delete')
  @AuditedInService()
  @ApiOperation({ summary: 'Xarajatni o‘chirish', description: 'Naqd xarajat puli kassaga qaytadi' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.expenses.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('expenses', 'delete')
  @AuditedInService()
  @ApiOperation({ summary: 'O‘chirilgan xarajatni tiklash', description: 'Naqd xarajat yana kassadan chiqadi' })
  @ApiOkResponse({ type: ExpenseDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<ExpenseDto> {
    return this.expenses.restore(id)
  }
}

/** Takrorlanuvchi xarajat shablonlari (T-063, I21) */
@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expense-templates')
export class ExpenseTemplatesController {
  constructor(private readonly templates: ExpenseTemplatesService) {}

  @Get()
  @RequirePermission('expenses', 'view')
  @ApiOperation({ summary: 'Shablonlar' })
  @ApiOkResponse({ type: [ExpenseTemplateDto] })
  list(): Promise<ExpenseTemplateDto[]> {
    return this.templates.list()
  }

  @Post()
  @RequirePermission('expenses', 'create')
  @AuditedInService()
  @ApiOperation({ summary: 'Shablon qo‘shish' })
  @ApiCreatedResponse({ type: ExpenseTemplateDto })
  create(@Body() dto: CreateExpenseTemplateDto): Promise<ExpenseTemplateDto> {
    return this.templates.create(dto)
  }

  @Post('run-due')
  @HttpCode(200)
  @RequirePermission('expenses', 'create')
  @AuditedInService()
  @ApiOperation({
    summary: 'Muddati kelgan shablonlarni hozir ishga tushirish',
    description: 'Cron har kuni 00:05 da o‘zi ishlaydi; bu — qo‘lda. Davrga bir marta (I21).',
  })
  @ApiOkResponse({ type: RunDueResultDto })
  async runDue(): Promise<RunDueResultDto> {
    return { created: await this.templates.runDue() }
  }

  @Patch(':id')
  @RequirePermission('expenses', 'edit')
  @AuditedInService()
  @ApiOperation({ summary: 'Shablonni tahrirlash' })
  @ApiOkResponse({ type: ExpenseTemplateDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseTemplateDto): Promise<ExpenseTemplateDto> {
    return this.templates.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('expenses', 'delete')
  @AuditedInService()
  @ApiOperation({ summary: 'Shablonni o‘chirish' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.templates.remove(id)
  }
}
