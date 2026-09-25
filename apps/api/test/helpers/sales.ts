import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/** Hisobot testlari uchun: API orqali sotuv, qaytarish, bekor qilish, xarajat */
export function salesApi(app: INestApplication, auth: string) {
  const post = async (path: string, body: Record<string, unknown>, status: number) =>
    (await request(app.getHttpServer())
      .post(`/api/v1/${path}`)
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(status)).body
  return {
    sell: (body: Record<string, unknown>) => post('sales', body, 201),
    giveBack: (saleId: string, items: { saleItemId: string; qty: number }[]) =>
      post(`sales/${saleId}/return`, { items, reason: 'Test' }, 201),
    cancel: (saleId: string) => post(`sales/${saleId}/cancel`, {}, 200),
    expense: (body: Record<string, unknown>) => post('expenses', body, 201),
  }
}
