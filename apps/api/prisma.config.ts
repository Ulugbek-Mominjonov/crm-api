import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 ga tayyor konfiguratsiya.
 * `dotenv/config` ATAYLAB birinchi: prisma.config.ts ishlatilganda
 * Prisma `.env` ni o'zi yuklamaydi.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
})
