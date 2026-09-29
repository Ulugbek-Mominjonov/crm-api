import { renderTelegram, renderTemplate } from './message-template'

const vars = { name: 'Bahrom', phone: '+998901234567', debt: 1_250_000, bonus: 3_500, store: 'Qurilish Mollari' }

describe('renderTemplate', () => {
  it('o‘zgaruvchilar almashtiriladi, summa guruhlanadi', () => {
    const text = renderTemplate('Hurmatli {name}, qarzingiz {debt} so‘m. {store}', vars)
    expect(text.replace(/\s/g, ' ')).toBe('Hurmatli Bahrom, qarzingiz 1 250 000 so‘m. Qurilish Mollari')
  })

  it('noma’lum o‘zgaruvchi o‘zgarmaydi; takrorlanganlar hammasi almashadi', () => {
    expect(renderTemplate('{name} {name} {unknown}', vars)).toBe('Bahrom Bahrom {unknown}')
  })

  it('Telegram: matn ekranlanadi, qiymatlar qalin (qiymatdagi belgilar ham ekranlanadi)', () => {
    const text = renderTelegram('{name}, qarz {debt} so‘m <tez orada> & {unknown}', { ...vars, name: 'Ali <VIP>' })
    expect(text.replace(/\s/g, ' ')).toBe('<b>Ali &lt;VIP&gt;</b>, qarz <b>1 250 000</b> so‘m &lt;tez orada&gt; &amp; {unknown}')
  })
})
