import { generateKeyPairSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Socket } from 'socket.io-client'
import { EventsGateway, UNAUTHORIZED } from '@/modules/realtime/events.gateway'
import { createTestApp } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { connect, listen, record, settle, until } from './helpers/realtime'

/**
 * Realtime ulanish (T-094): token qo'l siqishda tekshiriladi, xona —
 * token'dagi tenant. Boshqa tenant hodisasini hech qanday yo'l bilan
 * tinglab bo'lmaydi.
 */
describe('WebSocket autentifikatsiyasi (/events)', () => {
  let app: INestApplication
  let url: string
  let gateway: EventsGateway
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
  const sockets: Socket[] = []

  beforeAll(async () => {
    app = await createTestApp()
    url = await listen(app)
    gateway = app.get(EventsGateway)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    await truncateAll()
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
  })

  afterEach(() => {
    for (const s of sockets.splice(0)) s.close()
  })

  const tokenOf = async (who: typeof a) => (await bearer(app, who)).slice('Bearer '.length)
  const open = async (auth: Record<string, unknown>) => {
    const socket = await connect(url, auth)
    sockets.push(socket)
    return socket
  }
  /** Imzolash — TokenService chetlab (muddat va kalitni boshqarish uchun) */
  const sign = (who: typeof a, opts: { expiresIn?: number; exp?: number; key?: string } = {}) =>
    app.get(JwtService).signAsync(
      { sub: who.userId, tid: who.tenantId, role: 'admin', eid: who.employeeId, ...(opts.exp && { exp: opts.exp }) },
      {
        algorithm: 'RS256',
        privateKey: opts.key ?? readFileSync(process.env.JWT_PRIVATE_KEY_PATH!, 'utf8'),
        ...(opts.expiresIn && { expiresIn: opts.expiresIn }),
      },
    )

  it('tokensiz, buzuq, soxta kalit bilan va muddati o‘tgan token — ulanish ochilmaydi', async () => {
    const foreignKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })
    const attempts: Record<string, unknown>[] = [
      {},
      { token: '' },
      { token: 'buzuq.token.qiymat' },
      { token: await sign(a, { expiresIn: 60, key: String(foreignKey) }) },
      { token: await sign(a, { exp: Math.floor(Date.now() / 1000) - 10 }) },
    ]
    for (const auth of attempts) {
      await expect(connect(url, auth)).rejects.toThrow(UNAUTHORIZED)
    }
  })

  it('hodisa faqat o‘z tenanti xonasiga: A — o‘zinikini oladi, B nikini emas', async () => {
    const receivedA = record(await open({ token: await tokenOf(a) }))
    const receivedB = record(await open({ token: await tokenOf(b) }))

    gateway.emit(b.tenantId, 'shift.opened', { shiftId: 'b-smena' })
    gateway.emit(a.tenantId, 'shift.opened', { shiftId: 'a-smena' })
    await until(() => receivedA.length === 1 && receivedB.length === 1)
    await settle()
    expect(receivedA).toEqual([{ type: 'shift.opened', payload: { shiftId: 'a-smena' } }])
    expect(receivedB).toEqual([{ type: 'shift.opened', payload: { shiftId: 'b-smena' } }])
  })

  it('boshqa xonaga qo‘shilib bo‘lmaydi: auth’dagi tenantId va `join` e’tiborsiz', async () => {
    const socket = await open({ token: await tokenOf(a), tenantId: b.tenantId })
    const received = record(socket)
    socket.emit('join', `tenant:${b.tenantId}`)
    socket.emit('subscribe', { tenantId: b.tenantId })
    await settle()

    gateway.emit(b.tenantId, 'sale.cancelled', { saleId: 'b-chek' })
    await settle()
    expect(received).toEqual([])
    expect(socket.connected).toBe(true)
  })

  it('token muddati tugaganda server ulanishni uzadi', async () => {
    const socket = await open({ token: await sign(a, { expiresIn: 1 }) })
    const reason = await new Promise<string>((resolve) => socket.once('disconnect', resolve))
    expect(reason).toBe('io server disconnect')
  })
})
