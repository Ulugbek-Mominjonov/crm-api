import { config } from 'dotenv'
import { resolve } from 'node:path'

/**
 * Testlar uchun muhit. `.env` (ishlab chiqish) EMAS — `.env.test`.
 * Shunda mahalliy sozlama testga ta'sir qilmaydi va CI'da natija bir xil.
 */
config({ path: resolve(__dirname, '..', '.env.test'), override: true, quiet: true })
