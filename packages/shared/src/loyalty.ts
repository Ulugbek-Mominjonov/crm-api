import type { Settings } from './types'

/**
 * Sotuvdan mijozga beriladigan bonus ball (I17).
 *
 * Chek summasining `loyaltyRate` foizi, pastga yaxlitlanadi. Nasiya sotuv
 * ham ball oladi (tovar topshirilgan); bekor qilinganda AYNAN shu miqdor
 * qaytarib olinadi — shuning uchun server uni chekda saqlaydi.
 */
export function bonusEarned(
  total: number,
  loyalty: Pick<Settings, 'loyaltyEnabled' | 'loyaltyRate'>,
): number {
  if (!loyalty.loyaltyEnabled || loyalty.loyaltyRate <= 0 || total <= 0) return 0
  return Math.floor((total * loyalty.loyaltyRate) / 100)
}
