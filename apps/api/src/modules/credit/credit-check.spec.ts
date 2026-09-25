import { DomainError } from '@/common/errors/domain.error'
import { assertCreditAllowed, type CustomerPosition } from './credit.service'

/** Nasiya limiti qoidasi (T-066, I15, I16) — shared `evaluateCredit` ustida */
const customer = (over: Partial<CustomerPosition> = {}): CustomerPosition => ({
  id: 'c1', bonusPoints: 0, limit: 1_000_000, current: 800_000, overdue: 0, ...over,
})

const errorOf = (fn: () => void): DomainError => {
  try {
    fn()
  } catch (err) {
    if (err instanceof DomainError) return err
    throw err
  }
  throw new Error('xato kutilgan edi')
}

describe('assertCreditAllowed', () => {
  it('limitdan oshsa — CREDIT_LIMIT_EXCEEDED, aniq raqamlar bilan', () => {
    const err = errorOf(() => assertCreditAllowed(customer(), 300_000))
    expect(err.code).toBe('CREDIT_LIMIT_EXCEEDED')
    expect(err.status).toBe(422)
    expect(err.errors?.[0]).toEqual({
      field: 'customerId', code: 'CREDIT_LIMIT_EXCEEDED', meta: { limit: 1_000_000, current: 800_000, extra: 300_000 },
    })
  })

  it('limitgacha — ruxsat; limit 0 — cheklanmagan', () => {
    expect(() => assertCreditAllowed(customer(), 200_000)).not.toThrow()
    expect(() => assertCreditAllowed(customer({ limit: 0, current: 9e9 }), 1e9)).not.toThrow()
  })

  it('muddati o‘tgan qarz limitsiz ham to‘sadi', () => {
    const err = errorOf(() => assertCreditAllowed(customer({ limit: 0, overdue: 10_000 }), 5_000))
    expect(err.code).toBe('CREDIT_OVERDUE')
    expect(err.errors?.[0]?.meta).toEqual({ overdue: 10_000 })
  })

  it('mijozsiz nasiya — CREDIT_REQUIRES_CUSTOMER; qarz yo‘q — tekshirilmaydi', () => {
    expect(errorOf(() => assertCreditAllowed(undefined, 1)).code).toBe('CREDIT_REQUIRES_CUSTOMER')
    expect(() => assertCreditAllowed(undefined, 0)).not.toThrow()
    expect(() => assertCreditAllowed(customer({ overdue: 1 }), 0)).not.toThrow()
  })
})
