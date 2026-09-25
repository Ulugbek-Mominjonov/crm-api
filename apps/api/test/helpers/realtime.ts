import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { io, type Socket } from 'socket.io-client'

export interface Received {
  type: string
  payload: unknown
}

/** Ilova vaqtinchalik portda; natija — `/events` manzili */
export async function listen(app: INestApplication): Promise<string> {
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo
  return `http://127.0.0.1:${port}/events`
}

/** Brauzer kabi ulanish (`auth.token`); rad etilsa — `connect_error` xatosi */
export function connect(url: string, auth: Record<string, unknown>): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', (err) => {
      socket.close()
      reject(err)
    })
  })
}

/** Kelgan hodisalar ro'yxati (kelish tartibida) */
export function record(socket: Socket): Received[] {
  const received: Received[] = []
  socket.onAny((type: string, payload: unknown) => received.push({ type, payload }))
  return received
}

/** Hodisa asinxron keladi — shart bajarilguncha kutadi */
export async function until(check: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Kutilgan hodisa kelmadi')
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** "Hech narsa kelmadi" — kechikkan hodisaga ham imkon beriladi */
export const settle = (ms = 300): Promise<void> => new Promise((r) => setTimeout(r, ms))
