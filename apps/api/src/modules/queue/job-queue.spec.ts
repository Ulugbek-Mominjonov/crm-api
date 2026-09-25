import { ConfigService } from '@nestjs/config'
import { parseEnv, type Env } from '@/config/env.schema'
import { BullJobQueue } from './bull-job-queue'
import { InlineJobQueue } from './inline-job-queue'
import { createJobQueue } from './queue.module'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('InlineJobQueue — Redis’siz zaxira rejim', () => {
  it('ish ma’lumoti bilan ishlovchiga yetadi; ishchisi yo‘q ish — e’tiborsiz', async () => {
    const queue = new InlineJobQueue()
    const seen: unknown[] = []
    queue.register('export', async (data) => void seen.push(data))
    await queue.add('export', { exportId: 'e1' })
    await queue.add('image-variants')
    expect(seen).toEqual([{ exportId: 'e1' }])
  })

  it('bir nom bo‘yicha ketma-ket (concurrency 1), chaqiruvchini kutdirmaydi', async () => {
    const queue = new InlineJobQueue()
    const gate = deferred()
    const order: string[] = []
    queue.register('image-variants', async (data) => {
      order.push(`start:${String(data.n)}`)
      if (data.n === 1) await gate.promise
      order.push(`end:${String(data.n)}`)
    })
    const first = queue.add('image-variants', { n: 1 })
    const second = queue.add('image-variants', { n: 2 })
    await Promise.resolve()
    expect(order).toEqual(['start:1'])
    gate.resolve()
    await Promise.all([first, second])
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2'])
  })

  it('yiqilgan ish keyingisini to‘xtatmaydi (xato loglanadi, otilmaydi)', async () => {
    const queue = new InlineJobQueue()
    const done: number[] = []
    queue.register('sms-dispatch', async (data) => {
      if (data.n === 1) throw new Error('provayder yiqildi')
      done.push(data.n as number)
    })
    await expect(queue.add('sms-dispatch', { n: 1 })).resolves.toBeUndefined()
    await queue.add('sms-dispatch', { n: 2 })
    expect(done).toEqual([2])
  })

  it('dedupeKey: navbatdagi yoki bajarilayotgan ish bilan bir xil kalit — qo‘shilmaydi', async () => {
    const queue = new InlineJobQueue()
    const gate = deferred()
    let runs = 0
    queue.register('refresh-report-views', async () => {
      runs += 1
      await gate.promise
    })
    const first = queue.add('refresh-report-views', {}, { dedupeKey: 'kun-1' })
    await queue.add('refresh-report-views', {}, { dedupeKey: 'kun-1' })
    gate.resolve()
    await first
    await queue.add('refresh-report-views', {}, { dedupeKey: 'kun-1' })
    expect(runs).toBe(2)
  })

  it('to‘xtashda boshlangan ish tugatiladi', async () => {
    const queue = new InlineJobQueue()
    let finished = false
    queue.register('export', async () => {
      await new Promise((r) => setTimeout(r, 20))
      finished = true
    })
    void queue.add('export')
    await queue.onApplicationShutdown()
    expect(finished).toBe(true)
  })
})

describe('createJobQueue — drayver tanlovi', () => {
  const configOf = (overrides: NodeJS.ProcessEnv) =>
    new ConfigService<Env, true>(parseEnv({ ...process.env, ...overrides }))

  it('sukut — jarayon ichida; `bullmq` — Redis (REDIS_URL majburiy)', async () => {
    expect(createJobQueue(configOf({ QUEUE_DRIVER: undefined }))).toBeInstanceOf(InlineJobQueue)
    const bull = createJobQueue(configOf({ QUEUE_DRIVER: 'bullmq', REDIS_URL: 'redis://localhost:6380' }))
    expect(bull).toBeInstanceOf(BullJobQueue)
    await (bull as BullJobQueue).onApplicationShutdown()
    expect(() => configOf({ QUEUE_DRIVER: 'bullmq', REDIS_URL: undefined })).toThrow('REDIS_URL')
  })
})
