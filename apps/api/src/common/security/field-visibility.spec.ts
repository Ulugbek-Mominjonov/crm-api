import { canSeeField, canSeePurchaseAmounts, hiddenFieldsFor, stripHidden, visibilityPolicy } from './field-visibility'

describe('Maydon ko‘rinuvchanligi', () => {
  it('sotuvchi tannarx va ulgurji narxni ko‘rmaydi', () => {
    expect(canSeeField('sotuvchi', 'cost')).toBe(false)
    expect(canSeeField('sotuvchi', 'wholesalePrice')).toBe(false)
    expect(canSeeField('sotuvchi', 'profit')).toBe(false)
    // Sotuv uchun kerakli maydonlar ko'rinadi
    expect(canSeeField('sotuvchi', 'price')).toBe(true)
    expect(canSeeField('sotuvchi', 'stock')).toBe(true)
    expect(canSeeField('sotuvchi', 'name')).toBe(true)
  })

  it('admin va menejer hammasini ko‘radi', () => {
    for (const role of ['admin', 'manager'] as const) {
      expect(canSeeField(role, 'cost')).toBe(true)
      expect(canSeeField(role, 'profit')).toBe(true)
    }
  })

  it('parol xeshi HECH KIMGA ko‘rinmaydi', () => {
    for (const role of ['admin', 'manager', 'sotuvchi', 'omborchi'] as const) {
      expect(canSeeField(role, 'passwordHash')).toBe(false)
      expect(hiddenFieldsFor(role).has('tokenHash')).toBe(true)
    }
  })

  it('omborchi maoshni ko‘rmaydi, lekin tannarxni ko‘radi', () => {
    expect(canSeeField('omborchi', 'salary')).toBe(false)
    // Omborchi kirim qiladi — tannarx unga kerak
    expect(canSeeField('omborchi', 'cost')).toBe(true)
  })

  it('ulgurji narx sotuvchiga faqat do‘kon ruxsat bersa ko‘rinadi (ikkala sozlama yoqilgan)', () => {
    const policy = (wholesaleEnabled: boolean, sellerWholesaleEnabled: boolean) =>
      visibilityPolicy({ wholesaleEnabled, sellerWholesaleEnabled })
    expect(canSeeField('sotuvchi', 'wholesalePrice', policy(true, true))).toBe(true)
    expect(canSeeField('sotuvchi', 'wholesalePrice', policy(true, false))).toBe(false)
    expect(canSeeField('sotuvchi', 'wholesalePrice', policy(false, true))).toBe(false)
    // Siyosat faqat ulgurji narxga tegadi — tannarx baribir yashirin
    expect(canSeeField('sotuvchi', 'cost', policy(true, true))).toBe(false)
  })

  it('xarid summalari (buyurtma, ta’minotchi qarzi) tannarxni ko‘radigan rolga', () => {
    expect(canSeePurchaseAmounts('sotuvchi')).toBe(false)
    for (const role of ['admin', 'manager', 'omborchi'] as const) expect(canSeePurchaseAmounts(role)).toBe(true)
    expect(canSeeField('sotuvchi', 'payables')).toBe(false)
  })

  it('ichma-ich obyektdan ham olib tashlanadi', () => {
    const hidden = hiddenFieldsFor('sotuvchi')
    const out = stripHidden(
      { id: '1', name: 'Sement', price: 60000, cost: 45000, supplier: { name: 'X', cost: 1 } },
      hidden,
    )
    expect(out).toEqual({ id: '1', name: 'Sement', price: 60000, supplier: { name: 'X' } })
  })

  it('massivlarda ham ishlaydi', () => {
    const out = stripHidden([{ price: 1, cost: 2 }], hiddenFieldsFor('sotuvchi'))
    expect(out).toEqual([{ price: 1 }])
  })

  it('sanalarni buzmaydi', () => {
    const date = new Date('2026-08-25')
    const out = stripHidden({ date, cost: 1 }, hiddenFieldsFor('sotuvchi'))
    expect(out.date).toBeInstanceOf(Date)
    expect(out.date.getTime()).toBe(date.getTime())
  })

  it('admin uchun obyekt o‘zgarmaydi (parol maydonidan tashqari)', () => {
    const input = { id: '1', cost: 100, passwordHash: 'x' }
    expect(stripHidden(input, hiddenFieldsFor('admin'))).toEqual({ id: '1', cost: 100 })
  })
})
