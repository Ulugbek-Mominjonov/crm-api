import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { testDb } from './db'

/** Ta'minot testlari uchun umumiy: ta'minotchi va HTTP yordamchilari */
export async function seedSupplier(tenantId: string, overrides: Partial<{ name: string; paymentTermDays: number }> = {}) {
  const supplier = await testDb.supplier.create({
    data: {
      tenantId,
      name: overrides.name ?? 'Bekabad Sement',
      phone: '+998712001010',
      paymentTermDays: overrides.paymentTermDays ?? null,
    },
  })
  return supplier.id
}

export function purchaseApi(app: INestApplication, auth: string) {
  const api = () => request(app.getHttpServer())
  return {
    create: (body: Record<string, unknown>, token = auth) =>
      api().post('/api/v1/purchase-orders').set('Authorization', token).send(body),
    receive: (id: string, body: Record<string, unknown> = {}, token = auth) =>
      api().post(`/api/v1/purchase-orders/${id}/receive`).set('Authorization', token).set('Idempotency-Key', randomUUID()).send(body),
    pay: (id: string, body: Record<string, unknown>, token = auth) =>
      api().post(`/api/v1/purchase-orders/${id}/pay`).set('Authorization', token).set('Idempotency-Key', randomUUID()).send(body),
    get: (id: string) => api().get(`/api/v1/purchase-orders/${id}`).set('Authorization', auth),
  }
}
