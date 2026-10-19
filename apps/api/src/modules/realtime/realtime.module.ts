import { Global, Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { RolesModule } from '@/modules/roles/roles.module'
import { DomainEvents } from './domain-events.service'
import { EventsGateway } from './events.gateway'

/** Global: har domen moduli hodisa e'lon qiladi (`DomainEvents`) */
@Global()
@Module({
  // RolesModule — qo'l siqishda huquq va sessiya holati (HTTP guard bilan bir xil)
  imports: [AuthModule, RolesModule],
  providers: [EventsGateway, DomainEvents],
  exports: [DomainEvents],
})
export class RealtimeModule {}
