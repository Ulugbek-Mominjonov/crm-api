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
import { AuditAction, AuditedInService } from '@/modules/audit/audit.decorator'
import { ProductsService } from './products.service'
import { ProductBulkService } from './product-bulk.service'
import {
  CreateProductDto, ProductDto, ProductListQueryDto, ProductStatsDto, ProductSummaryDto, UpdateProductDto,
} from './dto/product.dto'
import {
  BulkPriceDto, BulkPriceResultDto, ImportProductsDto, ImportResultDto,
} from './dto/product-bulk.dto'

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly bulk: ProductBulkService,
  ) {}

  @Get('summary')
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: 'Katalog xulosasi', description: 'Faol turlar, kam qolganlar, ombor qiymati (tannarxda; sotuvchiga chiqmaydi).' })
  @ApiOkResponse({ type: ProductSummaryDto })
  summary(): Promise<ProductSummaryDto> {
    return this.products.summary()
  }

  @Get()
  @RequirePermission('products', 'view')
  @ApiOperation({
    summary: 'Mahsulotlar katalogi',
    description:
      'Qidiruv: nom va SKU bo‘yicha qism, shtrix-kod bo‘yicha aniq moslik. ' +
      'Har mahsulotda ombor bo‘yicha qoldiq (`stocks`). Sotuvchi rolida `cost` va ' +
      '`wholesalePrice` qaytmaydi. So‘rov byudjeti — 2.',
  })
  @ApiPagedResponse(ProductDto)
  list(@Query() query: ProductListQueryDto): Promise<Paged<ProductDto>> {
    return this.products.list(query)
  }

  @Get(':id/stats')
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: 'Mahsulot kartasi raqamlari', description: 'Sof sotilgan miqdor (asosiy birlikda) va oxirgi sotuv — bitta so‘rov.' })
  @ApiOkResponse({ type: ProductStatsDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  stats(@Param('id', ParseUUIDPipe) id: string): Promise<ProductStatsDto> {
    return this.products.stats(id)
  }

  @Get(':id')
  @RequirePermission('products', 'view')
  @ApiOperation({ summary: 'Bitta mahsulot (ombor qoldiqlari bilan)' })
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductDto> {
    return this.products.get(id)
  }

  @Post()
  @RequirePermission('products', 'create')
  @AuditAction('product.create')
  @ApiOperation({
    summary: 'Mahsulot qo‘shish',
    description: 'Qoldiq bu yerda berilmaydi — u kirim (ombor amali) orqali keladi.',
  })
  @ApiCreatedResponse({ type: ProductDto })
  @ApiConflictResponse({ description: 'DUPLICATE_SKU | ALREADY_EXISTS (shtrix-kod)', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'REFERENCE_NOT_FOUND — kategoriya/ta’minotchi', type: ApiErrorDto })
  create(@Body() dto: CreateProductDto): Promise<ProductDto> {
    return this.products.create(dto)
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission('products', 'create')
  @AuditedInService()
  @ApiOperation({
    summary: 'Mahsulotlarni import qilish',
    description:
      'Har qator alohida tekshiriladi: xato qatorlar `errors` da qaytadi, to‘g‘rilari saqlanadi ' +
      '(bitta tranzaksiyada, 1000 qator — bitta INSERT). Maksimal 5000 qator. Qoldiq importda ' +
      'yo‘q — u kirim orqali keladi. `upsert` — SKU bo‘yicha mavjudini yangilaydi.',
  })
  @ApiOkResponse({ type: ImportResultDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED — so‘rov shakli', type: ApiErrorDto })
  import(@Body() dto: ImportProductsDto): Promise<ImportResultDto> {
    return this.bulk.import(dto)
  }

  @Post('bulk-price')
  @HttpCode(200)
  @RequirePermission('products', 'edit')
  @AuditedInService()
  @ApiOperation({
    summary: 'Narxni ommaviy o‘zgartirish',
    description:
      'Bitta so‘rov bilan. Eski va yangi narxlar audit jurnaliga yoziladi. Natija manfiy bo‘lmaydi; ' +
      'foizda butun so‘mga yaxlitlanadi.',
  })
  @ApiOkResponse({ type: BulkPriceResultDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED', type: ApiErrorDto })
  bulkPrice(@Body() dto: BulkPriceDto): Promise<BulkPriceResultDto> {
    return this.bulk.bulkPrice(dto)
  }

  @Patch(':id')
  @RequirePermission('products', 'edit')
  @AuditAction('product.update')
  @ApiOperation({
    summary: 'Mahsulotni tahrirlash',
    description: 'Qoldiqni bu yerda o‘zgartirib bo‘lmaydi (`stock` maydoni rad etiladi).',
  })
  @ApiIfMatch()
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'DUPLICATE_SKU | ALREADY_EXISTS', type: ApiErrorDto })
  @ApiUnprocessableEntityResponse({ description: 'REFERENCE_NOT_FOUND', type: ApiErrorDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @IfMatch() version?: Date,
  ): Promise<ProductDto> {
    return this.products.update(id, dto, version)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('products', 'delete')
  @AuditAction('product.delete')
  @ApiOperation({ summary: 'Mahsulotni o‘chirish (yumshoq)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.products.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('products', 'delete')
  @AuditAction('product.restore')
  @ApiOperation({ summary: 'O‘chirilgan mahsulotni tiklash (undo)' })
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: 'ALREADY_EXISTS — shtrix-kod boshqa mahsulotda', type: ApiErrorDto })
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<ProductDto> {
    return this.products.restore(id)
  }
}
