import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'
import { BullJobQueue } from './bull-job-queue'
import { InlineJobQueue } from './inline-job-queue'
import { JobQueue } from './job-queue'

/** `QUEUE_DRIVER=bullmq` — Redis orqali; aks holda (Redis yo'q) — jarayon ichida */
export function createJobQueue(config: ConfigService<Env, true>): JobQueue {
  if (config.get('QUEUE_DRIVER', { infer: true }) !== 'bullmq') return new InlineJobQueue()
  // `maxRetriesPerRequest: null` — BullMQ ishchisining bloklovchi so'rovlari uchun shart
  return new BullJobQueue({ url: config.get('REDIS_URL', { infer: true }), maxRetriesPerRequest: null })
}

@Global()
@Module({
  providers: [{ provide: JobQueue, useFactory: createJobQueue, inject: [ConfigService] }],
  exports: [JobQueue],
})
export class QueueModule {}
