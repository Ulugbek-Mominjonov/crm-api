import { PasswordService, passwordIssues, MIN_PASSWORD_LENGTH } from './password.service'
import { DomainError } from '@/common/errors/domain.error'

describe('passwordIssues', () => {
  it('yaxshi parolda muammo yo‘q', () => {
    expect(passwordIssues('Qurilish2026!')).toEqual([])
  })

  it('qisqa parolni rad etadi', () => {
    expect(passwordIssues('abc123')).toContainEqual(
      expect.stringContaining(String(MIN_PASSWORD_LENGTH)),
    )
  })

  it('ommabop parolni rad etadi', () => {
    expect(passwordIssues('password')).toHaveLength(1)
    expect(passwordIssues('12345678')).toHaveLength(1)
  })

  it('bir xil belgilardan iborat parolni rad etadi', () => {
    expect(passwordIssues('aaaaaaaa')).toHaveLength(1)
  })

  it('chekka bo‘sh joyni rad etadi', () => {
    expect(passwordIssues(' Qurilish2026 ')).toContainEqual(
      expect.stringContaining('bo‘sh joy'),
    )
  })

  it('juda uzun parolni rad etadi', () => {
    expect(passwordIssues('a'.repeat(200)).length).toBeGreaterThan(0)
  })
})

describe('PasswordService', () => {
  const service = new PasswordService()

  it('xeshlaydi va tekshiradi', async () => {
    const hash = await service.hash('Qurilish2026!')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(await service.verify(hash, 'Qurilish2026!')).toBe(true)
    expect(await service.verify(hash, 'Boshqa2026!')).toBe(false)
  })

  it('bir xil parol har safar BOSHQA xesh beradi (tuz)', async () => {
    const a = await service.hash('Qurilish2026!')
    const b = await service.hash('Qurilish2026!')
    expect(a).not.toBe(b)
  })

  it('xeshda ochiq parol ko‘rinmaydi', async () => {
    const hash = await service.hash('Qurilish2026!')
    expect(hash).not.toContain('Qurilish2026!')
  })

  it('kuchsiz parolni xeshlamaydi', async () => {
    await expect(service.hash('12345678')).rejects.toBeInstanceOf(DomainError)
    await expect(service.hash('abc')).rejects.toThrow(/kamida/)
  })

  it('buzuq xeshda istisno tashlamaydi, faqat false qaytaradi', async () => {
    expect(await service.verify('bu-xesh-emas', 'Qurilish2026!')).toBe(false)
    expect(await service.verify('', 'Qurilish2026!')).toBe(false)
  })

  it('joriy parametrlar bilan yaratilgan xesh qayta xeshlashni talab qilmaydi', async () => {
    const hash = await service.hash('Qurilish2026!')
    expect(service.needsRehash(hash)).toBe(false)
    expect(service.needsRehash('buzuq')).toBe(true)
  })
})
