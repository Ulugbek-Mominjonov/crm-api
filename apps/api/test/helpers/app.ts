import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '@/app.module'
import { PrismaService } from '@/prisma/prisma.service'
import { setupApp } from '@/bootstrap/setup-app'
import { testDb } from './db'

/**
 * To'liq ilova — e2e testlar uchun.
 * Prisma o'rniga test bazasi mijozi qo'yiladi (ikkita pул ochilmasin).
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(testDb)
    .compile()

  const app = setupApp(moduleRef.createNestApplication(), {
    origins: ['http://localhost:5173'],
  })
  await app.init()
  return app
}
