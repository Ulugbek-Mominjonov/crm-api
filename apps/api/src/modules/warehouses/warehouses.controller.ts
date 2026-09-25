import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { ApiIfMatch, IfMatch } from '@/common/http/if-match.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { AuditAction } from '@/modules/audit/audit.decorator'
import { ApiPlanLimit } from '@/modules/tenants/api-plan-limit.decorator'
import { WarehousesService } from './warehouses.service'
import {
  ArchivedWarehouseDto, CreateWarehouseDto, UpdateWarehouseDto, WarehouseDto,
  WarehouseListQueryDto, WarehouseStockDto,
} from './dto/warehouse.dto'

/** Omborlar katalog bilan bir huquqda (04-api §1: `products`) */
@ApiTags('warehouses')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: 'Omborlar ro‘yxati', description: 'Arxivlanganlari ham (`archived` filtri bilan ajratiladi).' })
  @ApiPagedResponse(WarehouseDto)
  list(@Query() query: WarehouseListQueryDto): Promise<Paged<WarehouseDto>> {
    return this.warehouses.list(query)
  }

  @Get('stock')
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: 'Omborlar bo‘yicha tovar', description: 'Qoldig‘i bor turlar va tannarxdagi qiymat (sotuvchiga qiymat chiqmaydi).' })
  @ApiOkResponse({ type: [WarehouseStockDto] })
  stock(): Promise<WarehouseStockDto[]> {
    return this.warehouses.stock()
  }

  @Get(':id')
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: 'Bitta ombor' })
  @ApiOkResponse({ type: WarehouseDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<WarehouseDto> {
    return this.warehouses.get(id)
  }

  @Post()
  @RequirePermission('products', 'create')
  @AuditAction('warehouse.create')
  @ApiOperation({ summary: 'Ombor qo‘shish', description: 'Nom do‘kon ichida noyob.' })
  @ApiCreatedResponse({ type: WarehouseDto })
  @ApiConflictResponse({ description: 'ALREADY_EXISTS — bunday nomli ombor bor', type: ApiErrorDto })
  @ApiPlanLimit()
  create(@Body() dto: CreateWarehouseDto): Promise<WarehouseDto> {
    return this.warehouses.create(dto)
  }

  @Patch(':id')
  @RequirePermission('products', 'edit')
  @AuditAction('warehouse.update')
  @ApiOperation({ summary: 'Omborni tahrirlash' })
  @ApiIfMatch()
  @ApiOkResponse({ type: WarehouseDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'ALREADY_EXISTS', type: ApiErrorDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @IfMatch() version?: Date,
  ): Promise<WarehouseDto> {
    return this.warehouses.update(id, dto, version)
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('products', 'delete')
  @AuditAction('warehouse.archive')
  @ApiOperation({
    summary: 'Omborni arxivlash',
    description:
      'Sukut ombor arxivlanmaydi (WAREHOUSE_DEFAULT_LOCKED). Omborda tovar qolgan bo‘lsa ' +
      'amal bajariladi, lekin `stockWarning` qaytadi. Joriy ombor arxivlansa kassa sukut omborga o‘tadi.',
  })
  @ApiOkResponse({ type: ArchivedWarehouseDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'WAREHOUSE_DEFAULT_LOCKED', type: ApiErrorDto })
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<ArchivedWarehouseDto> {
    return this.warehouses.archive(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('products', 'delete')
  @AuditAction('warehouse.restore')
  @ApiOperation({ summary: 'Omborni arxivdan qaytarish' })
  @ApiOkResponse({ type: WarehouseDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiPlanLimit()
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<WarehouseDto> {
    return this.warehouses.restore(id)
  }
}
