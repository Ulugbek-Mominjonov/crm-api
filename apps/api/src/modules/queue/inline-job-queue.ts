import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { JobQueue, type JobData, type JobHandler, type JobName, type JobOptions } from './job-queue'

/**
 * Redis'siz zaxira rejim: ish SHU jarayonda, nom bo'yicha ketma-ket.
 * `add` ish tugashini kutadigan va'da qaytaradi (xato loglanadi, otilmaydi);
 * COMMIT'dan keyingi chaqiruvchi uni kutmaydi — javob kechikmaydi. Jarayon
 * o'lsa ish yo'qoladi, lekin holat bazada qoladi (yuqoriga qarang).
 */
@Injectable()
export class InlineJobQueue extends JobQueue implements OnApplicationShutdown {
  private readonly logger = new Logger('JobQueue')
  private readonly handlers = new Map<JobName, JobHandler>()
  /** Har nomning oxirgi ishi — keyingisi uning ortidan */
  private readonly tails = new Map<JobName, Promise<void>>()
  private readonly pendingKeys = new Set<string>()

  register(name: JobName, handler: JobHandler): void {
    this.handlers.set(name, handler)
  }

  add(name: JobName, data: JobData = {}, opts: JobOptions = {}): Promise<void> {
    const handler = this.handlers.get(name)
    if (!handler) return Promise.resolve()
    const key = opts.dedupeKey
    if (key !== undefined) {
      if (this.pendingKeys.has(key)) return Promise.resolve()
      this.pendingKeys.add(key)
    }
    const job = (this.tails.get(name) ?? Promise.resolve()).then(async () => {
      try {
        await handler(data)
      } catch (err) {
        this.logger.error({ err, job: name }, 'Fon ishi yiqildi')
      } finally {
        if (key !== undefined) this.pendingKeys.delete(key)
      }
    })
    this.tails.set(name, job)
    return job
  }

  /** To'xtashda boshlangan ishlar tugatiladi (graceful shutdown) */
  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.tails.values())
  }
}
