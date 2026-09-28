import { isSensitiveKey, redact, REDACT_PATHS } from './redaction'

describe('redaction', () => {
  it('maxfiy kalitlarni tanidi', () => {
    for (const k of ['password', 'passwordHash', 'refreshToken', 'API_KEY', 'Authorization']) {
      expect(isSensitiveKey(k)).toBe(true)
    }
    expect(isSensitiveKey('name')).toBe(false)
    expect(isSensitiveKey('total')).toBe(false)
  })

  it('ichma-ich obyektdagi parolni yashiradi', () => {
    const input = {
      user: { email: 'a@b.uz', password: 'sirli', profile: { token: 'abc' } },
      total: 1000,
    }
    const out = redact(input)
    expect(out.user.password).toBe('[redacted]')
    expect(out.user.profile.token).toBe('[redacted]')
    expect(out.user.email).toBe('a@b.uz')
    expect(out.total).toBe(1000)
  })

  it('Error obyektini buzmaydi (xabar va stack saqlanadi)', () => {
    const out = redact({ err: new Error('ulanish uzildi'), password: 'x' })
    expect(out.err).toBeInstanceOf(Error)
    expect(out.err.message).toBe('ulanish uzildi')
    expect(out.password).toBe('[redacted]')
  })

  it('massivlarni ham tozalaydi', () => {
    const out = redact([{ password: 'x' }, { qty: 2 }])
    expect(out[0]?.password).toBe('[redacted]')
    expect(out[1]?.qty).toBe(2)
  })

  it('pino uchun redact yo‘llari authorization va cookie ni qamraydi', () => {
    expect(REDACT_PATHS).toContain('req.headers.authorization')
    expect(REDACT_PATHS).toContain('req.headers.cookie')
  })
})
