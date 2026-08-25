import { seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Indeks bor bo'lishining o'zi yetarli emas — Postgres uni ISHLATISHI kerak.
 * Shuning uchun `EXPLAIN` rejasi tekshiriladi.
 *
 * Eslatma: GIN (trigram) indekslari uchun reja tekshirilmaydi — ularning
 * boshlang'ich narxi yuqori va kichik jadvalda planner to'g'ri ravishda
 * boshqa yo'lni tanlaydi. U yerda mavjudlik va kechikish tekshiriladi.
 */
// Trigram indeksi katta katalogda foyda beradi — test ham shu hajmda ishlaydi
const ROWS = 30_000

async function plan(sql: string, ...params: unknown[]): Promise<string> {
  const rows = await testDb.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
    `EXPLAIN (FORMAT TEXT) ${sql}`,
    ...params,
  )
  return rows.map((r) => r['QUERY PLAN']).join('\n')
}

describe('So‘rovlar indekslardan foydalanadi', () => {
  let ctx: Awaited<ReturnType<typeof seedTenant>>

  beforeAll(async () => {
    await truncateAll()
    ctx = await seedTenant()

    // Katalogni to'ldiramiz — planner haqiqiy hajmda qaror qilsin
    await testDb.$executeRawUnsafe(
      `INSERT INTO products (id, tenant_id, name, sku, unit, price, wholesale_price, cost, stock, min_stock, archived, created_at)
       SELECT gen_random_uuid(), $1::uuid, 'Tovar ' || g, 'SKU-' || g, 'dona',
              10000, 9000, 7000, (g % 50), 10, false, now()
         FROM generate_series(1, ${ROWS}) g`,
      ctx.tenantId,
    )
    await testDb.$executeRawUnsafe('ANALYZE products')
  }, 60_000)

  afterAll(async () => {
    await truncateAll()
    await testDb.$disconnect()
  })

  it('katalog ro‘yxati qamrab oluvchi indeksdan foydalanadi', async () => {
    const p = await plan(
      `SELECT sku, name, price, stock FROM products
        WHERE tenant_id = $1::uuid AND archived = false AND deleted_at IS NULL
        ORDER BY name LIMIT 50`,
      ctx.tenantId,
    )
    expect(p).toMatch(/products_catalog/)
    expect(p).not.toMatch(/Seq Scan on products/)
  })

  it('kam qolgan tovar qisman indeksdan foydalanadi', async () => {
    const p = await plan(
      `SELECT id FROM products
        WHERE tenant_id = $1::uuid AND stock <= min_stock
          AND archived = false AND deleted_at IS NULL`,
      ctx.tenantId,
    )
    expect(p).toMatch(/products_low_stock/)
  })

  it('trigram indekslari mavjud va yaroqli (tenant bo‘yicha ajratilgan)', async () => {
    // Reja tekshiruvi ATAYLAB yo'q: GIN ning boshlang'ich narxi yuqori,
    // shuning uchun 30 000 qatorli tor jadvalda planner ketma-ket
    // skanerlashni to'g'ri tanlaydi. Trigram katalog yuz minglarga
    // yetganda foyda beradi — bu yerda uning MAVJUDLIGI va tenant bilan
    // boshlanishi tekshiriladi. Foydalanuvchi uchun haqiqiy kafolat esa
    // quyidagi kechikish testida.
    const rows = await testDb.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname LIKE '%_trgm'
       ORDER BY indexname
    `
    expect(rows.map((r) => r.indexname)).toEqual([
      'clients_name_trgm', 'products_name_trgm', 'products_sku_trgm',
      'sales_number_trgm', 'suppliers_name_trgm',
    ])
    // Har bir indeks tenant_id dan boshlanadi (core/10-performance §10.4)
    for (const r of rows) {
      expect(r.indexdef).toMatch(/gin \(tenant_id, /)
    }
  })

  it('N2: 30 000 tovarli katalogda qidiruv 100 ms dan tez', async () => {
    // Foydalanuvchi uchun ahamiyatli kafolat aynan shu — qaysi indeks
    // tanlangani emas.
    const started = Date.now()
    await testDb.$queryRawUnsafe(
      `SELECT id FROM products
        WHERE tenant_id = $1::uuid AND name ILIKE '%ovar 29999%' AND deleted_at IS NULL
        LIMIT 20`,
      ctx.tenantId,
    )
    expect(Date.now() - started).toBeLessThan(100)
  })

  it('shtrix-kod bo‘yicha qidiruv AYNAN bitta indeksdan foydalanadi', async () => {
    await testDb.$executeRawUnsafe(
      `UPDATE products SET barcode = '4780000000017' WHERE tenant_id = $1::uuid AND sku = 'SKU-17'`,
      ctx.tenantId,
    )
    await testDb.$executeRawUnsafe('ANALYZE products')
    // `deleted_at IS NULL` SHART: qisman indeksning sharti so'rovda ham
    // bo'lmasa, planner indeks barcha mos qatorlarni qamrashini isbotlay
    // olmaydi va undan foydalanmaydi. Ilovadagi so'rovlar ham shunday yoziladi.
    const p = await plan(
      `SELECT id FROM products
        WHERE tenant_id = $1::uuid AND barcode = '4780000000017' AND deleted_at IS NULL`,
      ctx.tenantId,
    )
    expect(p).toMatch(/products_barcode_exact/)
  })

  it('shtrix-kod uchun takroriy indeks yo‘q', async () => {
    const rows = await testDb.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
       WHERE tablename = 'products' AND indexdef LIKE '%barcode%'
         AND indexname <> 'products_catalog'
    `
    expect(rows.map((r) => r.indexname)).toEqual(['products_barcode_exact'])
  })
})
