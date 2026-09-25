import type { INestApplicationContext } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import type { ServerOptions } from 'socket.io'

/**
 * Socket.IO sozlamasi: CORS — HTTP bilan bir xil ro'yxat (`*` HECH QACHON),
 * mijoz skripti serverdan berilmaydi (frontend `socket.io-client` paketidan).
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: readonly string[],
  ) {
    super(app)
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      serveClient: false,
      ...(this.origins.length > 0 && { cors: { origin: [...this.origins], credentials: true } }),
    })
  }
}
