import type { INestApplication } from '@nestjs/common'
import { ReportViewJobs } from '@/modules/reports/report-views.jobs'
import { createTestApp } from './helpers/app'
import { testDb } from './helpers/db'

/** Ko'rinishlarni yangilash ishi (T-080): bir vaqtda faqat bitta instansiya */
describe('Ko‘rinishlarni yangilash (mv-refresh-lock)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  // Holat qatori yo'q bo'lsa ham (testlar jadvallarni tozalaydi) yangilash uni yaratadi
  const refreshedAt = async () =>
    (await testDb.$queryRaw<{ at: Date }[]>`SELECT refreshed_at AS at FROM report_refresh_state`)[0]!.at

  it('qulf band — o‘tkazib yuboradi; bo‘shagach — yangilaydi va vaqtni yozadi', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let locked!: () => void
    const isLocked = new Promise<void>((resolve) => { locked = resolve })
    // Boshqa instansiya yangilayapti: o'sha qulfni ushlab turamiz
    const other = testDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('refresh-report-views'))`
      locked()
      await held
    }, { timeout: 20_000 })
    await isLocked

    try {
      expect(await app.get(ReportViewJobs).refresh()).toBe(false)
    } finally {
      release()
      await other
    }
    const before = Date.now()
    expect(await app.get(ReportViewJobs).refresh()).toBe(true)
    expect((await refreshedAt()).getTime()).toBeGreaterThanOrEqual(before - 1_000)
  })

  it('parallel ikki chaqiruv — hech biri yiqilmaydi, kamida bittasi yangilaydi', async () => {
    const results = await Promise.all([app.get(ReportViewJobs).refresh(), app.get(ReportViewJobs).refresh()])
    expect(results).toContain(true)
  })
})
