import type { Prisma } from '@prisma/client'
import { appDb, testDb } from './db'

/**
 * ILOVA bajargan SQL so'rovlarini sanash — so'rov byudjeti testlari uchun
 * (core/10-performance.md §10.1, §10.10).
 *
 * Prisma har bir SQL statement uchun `query` hodisasini beradi (testda
 * yoqilgan — prisma.service.ts). `$on` tinglovchisini olib tashlab
 * bo'lmaydi, shuning uchun u bir marta ulanadi va faqat yozish rejimida
 * to'playdi.
 *
 * Sanalmaydi: tranzaksiya chegaralari va tenant o'rnatish (`BEGIN`,
 * `set_config`, `COMMIT`) — ular har autentifikatsiyalangan so'rovda
 * o'zgarmas 3 ta buyruq (RLS narxi), byudjet esa MA'LUMOT so'rovlari haqida.
 */
const SERVICE_STATEMENT = /^\s*(BEGIN|COMMIT|ROLLBACK|SELECT set_config\()/i

const recorded: Prisma.QueryEvent[] = []
let recording = false

// `$on('query')` tipi mijoz konstruktoridagi `log` sozlamasidan chiqariladi;
// PrismaService uni muhitga qarab beradi, shuning uchun tip bu yerda aniq
;(appDb as unknown as {
  $on(event: 'query', cb: (e: Prisma.QueryEvent) => void): void
}).$on('query', (e) => {
  if (recording && !SERVICE_STATEMENT.test(e.query)) recorded.push(e)
})

/**
 * `fn` davomida bajarilgan SQL'lar. HTTP javobi qaytgach bir tsikl
 * kutiladi — oxirgi hodisa ham yetib kelsin.
 */
export async function captureQueries<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; queries: string[]; events: Prisma.QueryEvent[] }> {
  recorded.length = 0
  recording = true
  try {
    const result = await fn()
    await new Promise((resolve) => setImmediate(resolve))
    const events = [...recorded]
    return { result, queries: events.map((e) => e.query), events }
  } finally {
    recording = false
  }
}

/**
 * Ilova yuborgan AYNAN o'sha so'rovning rejasi — indeks haqiqatan
 * ishlatilayotganini ko'rish uchun (qo'lda yozilgan "o'xshash" SQL emas).
 *
 * Parametrlar literal sifatida qo'yiladi: tipini Postgres kontekstdan
 * aniqlaydi (uuid, enum). Faqat testdagi ma'lum qiymatlar uchun.
 */
export async function explain(event: Prisma.QueryEvent): Promise<string> {
  const params = JSON.parse(event.params) as unknown[]
  const sql = event.query.replace(/\$(\d+)/g, (_, n: string) => literal(params[Number(n) - 1]))
  const rows = await testDb.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(`EXPLAIN ${sql}`)
  return rows.map((r) => r['QUERY PLAN']).join('\n')
}

function literal(value: unknown): string {
  if (typeof value === 'number') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}
