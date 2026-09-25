import { Logger } from '@nestjs/common'
import {
  WebSocketGateway, WebSocketServer, type OnGatewayConnection, type OnGatewayDisconnect, type OnGatewayInit,
} from '@nestjs/websockets'
import type { Namespace, Socket } from 'socket.io'
import { TokenService } from '@/modules/auth/token.service'
import { EVENTS_NAMESPACE, tenantRoom, type DomainEventMap, type DomainEventType } from './domain-events'

/** Ulanish xatosi mijozga shu matn bilan (`connect_error`) — sabab aytilmaydi */
export const UNAUTHORIZED = 'unauthorized'
/** `setTimeout` chegarasi (~24.8 kun): undan kattasi darhol ishlab yuborardi */
const MAX_TIMER_MS = 2 ** 31 - 1

interface SocketData {
  tenantId: string
  userId: string
  expiry: NodeJS.Timeout
}

/**
 * Realtime (T-094, 01 §1.9). Ulanish qo'l siqishda (handshake) access
 * token bilan tekshiriladi — tokensiz ulanish umuman ochilmaydi. Xona
 * FAQAT token'dagi tenant: mijozda xonaga qo'shilish amali yo'q, ya'ni
 * boshqa tenant hodisasini tinglab bo'lmaydi.
 *
 * Token `auth.token` da (URL'da EMAS — proksi loglariga tushardi). Token
 * muddati tugaganda ulanish uziladi — mijoz yangi token bilan qayta ulanadi.
 */
@WebSocketGateway({ namespace: EVENTS_NAMESPACE })
export class EventsGateway
  implements OnGatewayInit<Namespace>, OnGatewayConnection<Socket>, OnGatewayDisconnect<Socket>
{
  private readonly logger = new Logger(EventsGateway.name)
  @WebSocketServer() private readonly server!: Namespace

  constructor(private readonly tokens: TokenService) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        () => next(new Error(UNAUTHORIZED)),
      )
    })
  }

  async handleConnection(socket: Socket): Promise<void> {
    await socket.join(tenantRoom((socket.data as SocketData).tenantId))
  }

  handleDisconnect(socket: Socket): void {
    clearTimeout((socket.data as Partial<SocketData>).expiry)
  }

  emit<T extends DomainEventType>(tenantId: string, type: T, payload: DomainEventMap[T]): void {
    this.server.to(tenantRoom(tenantId)).emit(type, payload)
  }

  private async authenticate(socket: Socket): Promise<void> {
    const token: unknown = socket.handshake.auth?.token
    if (typeof token !== 'string' || token === '') throw new Error(UNAUTHORIZED)
    const payload = (await this.tokens.verifyAccess(token)) as Awaited<ReturnType<TokenService['verifyAccess']>> & {
      exp: number
    }
    const expiry = setTimeout(() => socket.disconnect(true), Math.min(payload.exp * 1000 - Date.now(), MAX_TIMER_MS))
    expiry.unref()
    socket.data = { tenantId: payload.tid, userId: payload.sub, expiry } satisfies SocketData
    this.logger.debug({ tenantId: payload.tid, userId: payload.sub }, 'Realtime ulanish')
  }
}
