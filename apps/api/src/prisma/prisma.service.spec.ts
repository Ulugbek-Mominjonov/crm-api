import { withConnectionLimit } from './prisma.service'

describe('withConnectionLimit', () => {
  it('parametrsiz URL ga `?` bilan qo‘shadi', () => {
    expect(withConnectionLimit('postgresql://u:p@h:5432/db', 10)).toBe(
      'postgresql://u:p@h:5432/db?connection_limit=10',
    )
  })

  it('parametri bor URL ga `&` bilan qo‘shadi', () => {
    expect(withConnectionLimit('postgresql://u:p@h:5432/db?schema=public', 7)).toBe(
      'postgresql://u:p@h:5432/db?schema=public&connection_limit=7',
    )
  })

  it('allaqachon belgilangan chegarani o‘zgartirmaydi', () => {
    const url = 'postgresql://u:p@h:5432/db?connection_limit=25'
    expect(withConnectionLimit(url, 10)).toBe(url)
  })
})
