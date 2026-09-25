/**
 * Miqdor — Decimal(14,3) (kg, m², metr). Server hisobni BUTUN mingdan
 * birlarda (milli) yuritadi: `0.1 + 0.2` kabi suzuvchi nuqta xatosi
 * qoldiqqa to'planmaydi (frontendda I1 aynan shu sabab buzilgan edi).
 *
 * Eng katta qiymat 99 999 999 999.999 → milli 1e14 dan kichik, ya'ni
 * `Number.MAX_SAFE_INTEGER` (≈9·10¹⁵) ichida — butun son aniq.
 */
export const toMilli = (value: number | string | { toString(): string }): number =>
  Math.round(Number(value.toString()) * 1000)

export const fromMilli = (milli: number): number => milli / 1000

/** Decimal ustun uchun satr — aniq 3 kasr */
export const milliToDb = (milli: number): string => (milli / 1000).toFixed(3)
