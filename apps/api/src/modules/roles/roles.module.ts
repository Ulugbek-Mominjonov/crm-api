import { Module } from '@nestjs/common'
import { AccessService } from './access.service'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'

/** Auth (har so'rovda huquq) va foydalanuvchilar (rol berish) shu moduldan foydalanadi */
@Module({
  controllers: [RolesController],
  providers: [AccessService, RolesService],
  exports: [AccessService, RolesService],
})
export class RolesModule {}
