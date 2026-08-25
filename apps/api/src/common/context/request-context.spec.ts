import {
  currentContext, enrichContext, newRequestId, runWithContext, tryContext,
} from './request-context'

describe('So‘rov konteksti', () => {
  it('kontekst ichida qiymat ko‘rinadi', () => {
    runWithContext({ requestId: 'r1' }, () => {
      expect(currentContext().requestId).toBe('r1')
    })
  })

  it('kontekstdan tashqarida `currentContext` XATO tashlaydi', () => {
    // Bu dasturchi xatosi (middleware ishlamagan) — jimgina davom etmaymiz
    expect(() => currentContext()).toThrow(/middleware/)
  })

  it('`tryContext` kontekstsiz undefined qaytaradi', () => {
    expect(tryContext()).toBeUndefined()
  })

  it('kontekstlar bir-biriga aralashmaydi (parallel so‘rovlar)', async () => {
    const seen: string[] = []
    await Promise.all([
      new Promise<void>((done) =>
        runWithContext({ requestId: 'a' }, async () => {
          await new Promise((r) => setTimeout(r, 20))
          seen.push(currentContext().requestId)
          done()
        }),
      ),
      new Promise<void>((done) =>
        runWithContext({ requestId: 'b' }, async () => {
          seen.push(currentContext().requestId)
          done()
        }),
      ),
    ])
    expect(seen.sort()).toEqual(['a', 'b'])
  })

  it('autentifikatsiyadan keyin kontekst to‘ldiriladi', () => {
    runWithContext({ requestId: 'r2' }, () => {
      enrichContext({ tenantId: 't1', userId: 'u1', role: 'sotuvchi' })
      expect(currentContext()).toEqual({
        requestId: 'r2', tenantId: 't1', userId: 'u1', role: 'sotuvchi',
      })
    })
  })

  it('kontekstsiz `enrichContext` yiqilmaydi', () => {
    expect(() => enrichContext({ tenantId: 't1' })).not.toThrow()
  })

  it('har so‘rov uchun noyob identifikator', () => {
    expect(newRequestId()).not.toBe(newRequestId())
  })
})
