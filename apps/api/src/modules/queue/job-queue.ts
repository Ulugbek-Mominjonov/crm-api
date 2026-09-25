/** Fon ishlari (T-096) — yagona ro'yxat: navbat va ishlovchi bir-birini nom bo'yicha topadi */
export const JOB_NAMES = ['image-variants', 'sms-dispatch', 'refresh-report-views', 'export', 'fiscalize'] as const
export type JobName = (typeof JOB_NAMES)[number]
export type JobData = Record<string, unknown>
export type JobHandler = (data: JobData) => Promise<unknown>

export interface JobOptions {
  /** Shu kalitli ish navbatda (yoki bajarilmoqda) bo'lsa — qayta qo'shilmaydi */
  dedupeKey?: string
}

/**
 * Fon navbati (T-096). Ish — "uyg'otuvchi": asl holat bazada (SMS
 * navbati, `variants IS NULL`, eksport qatori), shuning uchun ish yo'qolsa
 * ham interval ishchi yoki keyingi ish uni topadi. Har nom uchun bitta
 * ishlovchi, bir vaqtda BITTA ish (512 MB instansiya, 09 §9.8).
 *
 * Ishchisi o'chiq ish (`register` chaqirilmagan) qo'shilmaydi — masalan
 * testda `FILE_VARIANTS_INTERVAL_MS=0`.
 */
export abstract class JobQueue {
  abstract register(name: JobName, handler: JobHandler): void
  abstract add(name: JobName, data?: JobData, opts?: JobOptions): Promise<void>
}
