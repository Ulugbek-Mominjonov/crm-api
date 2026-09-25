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
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    switch (key) {
      case 'name':
        return vars.name
      case 'phone':
        return vars.phone
      case 'store':
        return vars.store
      case 'debt':
        return MONEY.format(vars.debt)
      case 'bonus':
        return MONEY.format(vars.bonus)
      default:
        return whole
    }
  })
}
