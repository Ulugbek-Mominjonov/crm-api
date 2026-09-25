import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common'
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse,
  ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags,
} from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { ApiIfMatch, IfMatch } from '@/common/http/if-match.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { AuditAction } from '@/modules/audit/audit.decorator'
import { SuppliersService } from './suppliers.service'
import {
  CreateSupplierDto, SupplierCardDto, SupplierDto, SupplierListItemDto, SupplierListQueryDto, SupplierSummaryDto, UpdateSupplierDto,
} from './dto/supplier.dto'

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermission('suppliers', 'view')
  @ApiOperation({ summary: 'Ta’minotchilar ro‘yxati', description: '`q` — nom, aloqa shaxsi, telefon va STIR bo‘yicha.' })
  @ApiPagedResponse(SupplierListItemDto)
  list(@Query() query: SupplierListQueryDto): Promise<Paged<SupplierListItemDto>> {
    return this.suppliers.list(query)
  }

  @Get('summary')
  @RequirePermission('suppliers', 'view')
  @ApiOperation({ summary: 'Kreditorlik xulosasi', description: 'Barcha ta’minotchilarga jami qarz va qarzimiz bor ta’minotchilar soni.' })
  @ApiOkResponse({ type: SupplierSummaryDto })
  summary(): Promise<SupplierSummaryDto> {
    return this.suppliers.summary()
  }

  @Get(':id')
  @RequirePermission('suppliers', 'view')
  @ApiOperation({
    summary: 'Ta’minotchi kartasi',
    description: 'Buyurtmalar tarixi, jami qarz (faqat kelgan tovar, I18), oxirgi to‘lovlar — bitta so‘rovda.',
  })
  @ApiOkResponse({ type: SupplierCardDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierCardDto> {
    return this.suppliers.card(id)
  }

  @Post()
  @RequirePermission('suppliers', 'create')
  @AuditAction('supplier.create')
  @ApiOperation({ summary: 'Ta’minotchi qo‘shish' })
  @ApiCreatedResponse({ type: SupplierDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED — masalan STIR 9 raqam emas', type: ApiErrorDto })
  create(@Body() dto: CreateSupplierDto): Promise<SupplierDto> {
    return this.suppliers.create(dto)
  }

  @Patch(':id')
  @RequirePermission('suppliers', 'edit')
  @AuditAction('supplier.update')
  @ApiOperation({ summary: 'Ta’minotchini tahrirlash' })
  @ApiIfMatch()
  @ApiOkResponse({ type: SupplierDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @IfMatch() version?: Date,
  ): Promise<SupplierDto> {
    return this.suppliers.update(id, dto, version)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('suppliers', 'delete')
  @AuditAction('supplier.delete')
  @ApiOperation({ summary: 'Ta’minotchini o‘chirish (yumshoq)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'SUPPLIER_HAS_OPEN_ORDERS', type: ApiErrorDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.suppliers.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('suppliers', 'delete')
  @AuditAction('supplier.restore')
  @ApiOperation({ summary: 'O‘chirilgan ta’minotchini tiklash (undo)' })
  @ApiOkResponse({ type: SupplierDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierDto> {
    return this.suppliers.restore(id)
  }
}
