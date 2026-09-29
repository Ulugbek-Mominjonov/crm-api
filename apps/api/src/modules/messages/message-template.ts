import { escapeHtml } from '@/modules/telegram/telegram-texts'

/** Shablon o'zgaruvchilari — har qabul qiluvchi uchun alohida */
export interface TemplateVars {
  name: string
  phone: string
  /** Qolgan qarz, so'm */
  debt: number
  bonus: number
  store: string
}

const MONEY = new Intl.NumberFormat('ru-RU')

/**
 * `{name}`, `{debt}` … ni almashtiradi (T-076). Noma'lum o'zgaruvchi
 * o'zgarmay qoladi — matn yo'qolmaydi. Summa guruhlab yoziladi: 1 250 000.
 * `value` — qiymat ko'rinishi (Telegram'da qalin).
 */
export function renderTemplate(text: string, vars: TemplateVars, value: (v: string) => string = (v) => v): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    switch (key) {
      case 'name':
        return value(vars.name)
      case 'phone':
        return value(vars.phone)
      case 'store':
        return value(vars.store)
      case 'debt':
        return value(MONEY.format(vars.debt))
      case 'bonus':
        return value(MONEY.format(vars.bonus))
      default:
        return whole
    }
  })
}

/**
 * Telegram uchun (HTML, Q116): matn ekranlanadi, o'zgaruvchi qiymatlari —
 * qalin (qarz summasi, ism ko'zga tashlanadi). `{…}` ekranlashdan o'zgarmaydi
 */
export function renderTelegram(text: string, vars: TemplateVars): string {
  return renderTemplate(escapeHtml(text), vars, (v) => `<b>${escapeHtml(v)}</b>`)
}
