import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { ProductBulkService } from './product-bulk.service'

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductBulkService],
  exports: [ProductsService],
})
export class ProductsModule {}
