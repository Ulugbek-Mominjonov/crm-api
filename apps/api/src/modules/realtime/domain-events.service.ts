import { Injectable } from '@nestjs/common'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import type { DomainEventMap, DomainEventType } from './domain-events'
import { EventsGateway } from './events.gateway'

/**
 * Domen hodisalari (T-095). Servis amal ICHIDA e'lon qiladi, yuborish esa
 * tranzaksiya COMMIT bo'lgandan KEYIN: bekor bo'lgan chek haqida ikkinchi
 * kassir hech narsa eshitmaydi. Tenant — joriy tranzaksiyadan (so'rovdan emas).
 */
@Injectable()
export class DomainEvents {
  constructor(private readonly gateway: EventsGateway) {}

  publish<T extends DomainEventType>(type: T, payload: DomainEventMap[T]): void {
    const { tenantId } = requireTenantTx()
    onCommit(() => this.gateway.emit(tenantId, type, payload))
  }
}
