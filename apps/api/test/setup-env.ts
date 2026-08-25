import { config } from 'dotenv'
import { isAbsolute, resolve } from 'node:path'

const APP_DIR = resolve(__dirname, '..')

/**
 * Testlar uchun muhit. `.env` (ishlab chiqish) EMAS — `.env.test`.
 * Shunda mahalliy sozlama testga ta'sir qilmaydi va CI'da natija bir xil.
 */
config({ path: resolve(APP_DIR, '.env.test'), override: true, quiet: true })

/**
 * Nisbiy yo'llar `apps/api` ga nisbatan yoziladi, lekin vitest'ning ishchi
 * papkasi repo ildizi bo'lishi mumkin. Shuning uchun ularni mutlaq qilamiz.
 */
for (const key of ['JWT_PRIVATE_KEY_PATH', 'JWT_PUBLIC_KEY_PATH'] as const) {
  const value = process.env[key]
  if (value && !isAbsolute(value)) process.env[key] = resolve(APP_DIR, value)
}
