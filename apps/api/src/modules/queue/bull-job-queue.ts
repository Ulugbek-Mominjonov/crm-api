import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { Queue, Worker, type ConnectionOptions } from 'bullmq'
import { JobQueue, type JobData, type JobHandler, type JobName, type JobOptions } from './job-queue'

/** Redis kalitlari prefiksi — bitta Redis'da boshqa ilovalar bilan aralashmasin */
export const QUEUE_PREFIX = 'crm'
/** Tugagan ish tarixi (kuzatish uchun) va dedupe kaliti shuncha saqlanadi */
const KEEP_COMPLETED_SEC = 24 * 3600
const KEEP_FAILED_SEC = 7 * 24 * 3600

/**
 * BullMQ (Redis): ish instansiyalar orasida bir marta bajariladi, jarayon
 * o'lsa ish yo'qolmaydi. Qayta urinish bazadagi holat bilan (SMS
 * `next_attempt_at`, variantlar `NULL`) — navbat faqat uyg'otadi, shuning
 * uchun BullMQ `attempts` 1.
 */
@Injectable()
export class BullJobQueue extends JobQueue implements OnApplicationShutdown {
  private readonly logger = new Logger('JobQueue')
  private readonly queues = new Map<JobName, Queue>()
  private readonly workers: Worker[] = []

  constructor(
    private readonly connection: ConnectionOptions,
    private readonly prefix = QUEUE_PREFIX,
  ) {
    super()
  }

  register(name: JobName, handler: JobHandler): void {
    const worker = new Worker(name, async (job) => handler(job.data as JobData), {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: 1,
    })
    worker.on('failed', (job, err) => this.logger.error({ err, job: name, id: job?.id }, 'Fon ishi yiqildi'))
    worker.on('error', (err) => this.logger.error({ err, job: name }, 'Navbat ishchisi xatosi'))
    this.workers.push(worker)
    this.queues.set(name, new Queue(name, { connection: this.connection, prefix: this.prefix }))
  }

  async add(name: JobName, data: JobData = {}, opts: JobOptions = {}): Promise<void> {
    const queue = this.queues.get(name)
    if (!queue) return
    await queue.add(name, data, {
      ...(opts.dedupeKey !== undefined && { jobId: opts.dedupeKey }),
      removeOnComplete: { age: KEEP_COMPLETED_SEC },
      removeOnFail: { age: KEEP_FAILED_SEC },
    })
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()))
    await Promise.all([...this.queues.values()].map((q) => q.close()))
  }
}
