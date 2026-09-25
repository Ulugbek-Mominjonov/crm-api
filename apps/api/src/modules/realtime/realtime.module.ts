import { Global, Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { DomainEvents } from './domain-events.service'
import { EventsGateway } from './events.gateway'

/** Global: har domen moduli hodisa e'lon qiladi (`DomainEvents`) */
@Global()
@Module({
  imports: [AuthModule],
  providers: [EventsGateway, DomainEvents],
  exports: [DomainEvents],
})
export class RealtimeModule {}
