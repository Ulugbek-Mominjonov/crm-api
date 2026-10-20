import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { IsCardNumber, luhnValid } from './card'

class Body {
  @IsCardNumber()
  number!: string
}

const check = async (number: unknown): Promise<{ ok: boolean; value: unknown }> => {
  const body = plainToInstance(Body, { number })
  return { ok: (await validate(body)).length === 0, value: body.number }
}

describe('karta raqami (T-149)', () => {
  it('Luhn: Uzcard (Payme sinov kartasi), Visa sinov kartasi — to‘g‘ri; bitta raqam xatosi va almashuv — xato', () => {
    expect(luhnValid('8600069195406311')).toBe(true)
    expect(luhnValid('4111111111111111')).toBe(true)
    expect(luhnValid('8600069195406312')).toBe(false)
    expect(luhnValid('8600069195403611')).toBe(false)
  })

  it('bo‘sh joy va chiziqcha olib tashlanadi; 16 raqam va nazorat raqami shart; `""` — olib tashlash', async () => {
    expect(await check('8600 0691 9540 6311')).toEqual({ ok: true, value: '8600069195406311' })
    expect(await check('8600-0691-9540-6311')).toEqual({ ok: true, value: '8600069195406311' })
    expect(await check('')).toEqual({ ok: true, value: '' })
    expect((await check('8600 0691 9540 6312')).ok).toBe(false)
    expect((await check('8600069195406')).ok).toBe(false)
    expect((await check('86000691954063110')).ok).toBe(false)
    expect((await check(8600069195406311)).ok).toBe(false)
  })
})
