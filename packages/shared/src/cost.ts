/**
 * O'rtacha tortilgan tannarx (I11).
 *
 *   yangi tannarx = (eski qoldiq × eski tannarx + kirim × kirim narxi)
 *                   ÷ (eski qoldiq + kirim)
 *
 * Nega: kirim eski tannarxni butunlay almashtirsa, 100 dona 10 000 dan bor
 * bo'lib, 10 dona 20 000 dan kelganda barcha 110 donaning tannarxi 20 000
 * bo'lib qolardi — foyda soxta pasayardi (frontenddagi K8 xatosi).
 *
 * Qoldiq — butun do'kon bo'yicha JAMI: tannarx omborlar bo'yicha ajratilmaydi.
 * Natija butun so'mga yaxlitlanadi.
 */
export function averageCost(
  oldStock: number,
  oldCost: number,
  inQty: number,
  inCost: number,
): number {
  if (!(inQty > 0) || !(inCost > 0)) return oldCost
  // Qoldiq yo'q (yoki tannarx noma'lum) — kirim narxi to'g'ridan-to'g'ri olinadi
  if (oldStock <= 0 || oldCost <= 0) return inCost
  const total = oldStock + inQty
  return Math.round((oldStock * oldCost + inQty * inCost) / total)
}
