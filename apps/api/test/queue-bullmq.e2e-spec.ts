import { randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'
import { BullJobQueue } from '@/modules/queue/bull-job-queue'
import type { JobData } from '@/modules/queue/job-queue'

/**
 * BullMQ navbati (T-096) — haqiqiy Redis bilan. Har test o'z prefiksida:
 * boshqa ilova yoki test kalitlariga tegmaydi, oxirida tozalanadi.
 */
describe('BullJobQueue (Redis)', () => {
  const url = process.env.REDIS_URL!
  const connection = { url, maxRetriesPerRequest: null }
  const prefix = `crm-test-${randomUUID()}`
  const queues: BullJobQueue[] = []

  afterAll(async () => {
    await Promise.all(queues.map((q) => q.onApplicationShutdown()))
    const redis = new Redis(url)
    const keys = await redis.keys(`${prefix}:*`)
    if (keys.length > 0) await redis.del(...keys)
    await redis.quit()
  })

  const instance = () => {
    const queue = new BullJobQueue(connection, prefix)
    queues.push(queue)
    return queue
  }

  const waitFor = async (check: () => boolean, timeoutMs = 5_000) => {
    const deadline = Date.now() + timeoutMs
    while (!check()) {
      if (Date.now() > deadline) throw new Error('Ish bajarilmadi')
      await new Promise((r) => setTimeout(r, 25))
    }
  }

  it('ish ma’lumoti bilan bajariladi; ishchisi yo‘q ish qo‘shilmaydi', async () => {
    const queue = instance()
    const seen: JobData[] = []
    queue.register('export', async (data) => void seen.push(data))
    await queue.add('export', { exportId: 'e-1' })
    await queue.add('image-variants')
    await waitFor(() => seen.length === 1)
    expect(seen).toEqual([{ exportId: 'e-1' }])
  })

  it('ikki instansiya — har ish BIR marta; kunlik kalit takrorini birlashtiradi', async () => {
    const runs: string[] = []
    const [x, y] = [instance(), instance()]
    x.register('refresh-report-views', async () => void runs.push('x'))
    y.register('refresh-report-views', async () => void runs.push('y'))

    // Ikkala instansiya cron'i bir kunda — bitta ish
    await Promise.all([
      x.add('refresh-report-views', {}, { dedupeKey: 'refresh-2026-09-23' }),
      y.add('refresh-report-views', {}, { dedupeKey: 'refresh-2026-09-23' }),
    ])
    for (let i = 0; i < 4; i += 1) await x.add('refresh-report-views', { n: i })
    await waitFor(() => runs.length === 5)
    await new Promise((r) => setTimeout(r, 300))
    expect(runs).toHaveLength(5)
  })
})
