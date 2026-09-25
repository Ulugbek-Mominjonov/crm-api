import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common'
import {
  ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags,
} from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { ApiIfMatch, IfMatch } from '@/common/http/if-match.decorator'
import { RequirePermission } from '@/modules/auth/decorators/require-permission.decorator'
import { AuditAction } from '@/modules/audit/audit.decorator'
import { CategoriesService } from './categories.service'
import {
  CategoryDto, CategoryListQueryDto, CreateCategoryDto, UpdateCategoryDto,
} from './dto/category.dto'

/** Kategoriyalar katalog bilan bir huquqda (04-api §1: `products`) */
@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: 'Kategoriyalar ro‘yxati', description: 'Har biri mahsulotlar soni bilan.' })
  @ApiPagedResponse(CategoryDto)
  list(@Query() query: CategoryListQueryDto): Promise<Paged<CategoryDto>> {
    return this.categories.list(query)
  }

  @Get(':id')
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: 'Bitta kategoriya' })
  @ApiOkResponse({ type: CategoryDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryDto> {
    return this.categories.get(id)
  }

  @Post()
  @RequirePermission('products', 'create')
  @AuditAction('category.create')
  @ApiOperation({ summary: 'Kategoriya qo‘shish', description: 'Nom do‘kon ichida noyob.' })
  @ApiCreatedResponse({ type: CategoryDto })
  @ApiConflictResponse({ description: 'ALREADY_EXISTS', type: ApiErrorDto })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryDto> {
    return this.categories.create(dto)
  }

  @Patch(':id')
  @RequirePermission('products', 'edit')
  @AuditAction('category.update')
  @ApiOperation({
    summary: 'Kategoriyani tahrirlash',
    description: 'Nomni o‘zgartirish mahsulotlarga tegmaydi — ular `categoryId` bilan bog‘langan (D4).',
  })
  @ApiIfMatch()
  @ApiOkResponse({ type: CategoryDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'ALREADY_EXISTS', type: ApiErrorDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @IfMatch() version?: Date,
  ): Promise<CategoryDto> {
    return this.categories.update(id, dto, version)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('products', 'delete')
  @AuditAction('category.delete')
  @ApiOperation({ summary: 'Kategoriyani o‘chirish (yumshoq)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'CATEGORY_IN_USE — kategoriyada mahsulot bor', type: ApiErrorDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.categories.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('products', 'delete')
  @AuditAction('category.restore')
  @ApiOperation({ summary: 'O‘chirilgan kategoriyani tiklash (undo)' })
  @ApiOkResponse({ type: CategoryDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryDto> {
    return this.categories.restore(id)
  }
}
