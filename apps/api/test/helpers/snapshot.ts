/**
 * Brauzerdagi (localStorage, store v15) do'kon nusxasi — migratsiya
 * testlari uchun. Frontend `CrmSnapshot` shaklida; ataylab "iflos"
 * yozuvlar ham bor (07 §7.4): osilgan havola, manfiy qoldiq, ikkita
 * ochiq smena, takroriy SKU.
 */
export interface SnapshotOptions {
  /** Buzuq yozuvlarsiz (to'liq ko'chishi kerak bo'lgan) nusxa */
  clean?: boolean
}

export const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export function storeSnapshot(opts: SnapshotOptions = {}) {
  const item = (productId: string, qty: number, price: number, cost = 45_000) => ({
    productId, name: 'Sement M400', unit: 'qop', qty, baseQty: qty, price, cost, discount: 0,
  })
  const data = {
    warehouses: [
      { id: 'wh_main', name: 'Do‘kon zali', address: 'Chilonzor 5', isDefault: true },
      { id: 'wh_2', name: 'Sklad', archived: false },
    ],
    categories: ['Sement', 'G‘isht'],
    suppliers: [{ id: 'sp_1', name: 'Bekabad Sement', phone: '+998 71 200-10-10', paymentTermDays: 15 }],
    employees: [{ id: 'em_1', name: 'Ali Sotuvchi', position: 'Sotuvchi', phone: '+998901112233', status: 'active', salary: 3_000_000, hiredAt: '2025-01-10' }],
    clients: [
      { id: 'cl_1', name: 'Vali', type: 'individual', phone: '+998 90 111 22 33', email: '', status: 'active', group: 'retail', bonusPoints: 500, creditLimit: 0, source: 'tanish', createdAt: '2025-03-01T10:00:00Z' },
      { id: 'cl_2', name: 'Qurilish MChJ', type: 'company', phone: '+998901234567', email: 'info@qm.uz', status: 'active', group: 'wholesale', bonusPoints: 0, creditLimit: 5_000_000, paymentTermDays: 30, source: '', createdAt: '2025-03-02T10:00:00Z' },
    ],
    products: [
      { id: 'pr_1', name: 'Sement M400', sku: 'SEM-400', barcode: '4780000000011', category: 'Sement', unit: 'qop', price: 60_000, wholesalePrice: 55_000, cost: 45_000, stock: 120, stocks: { wh_main: 100, wh_2: 20 }, minStock: 10, supplierId: 'sp_1' },
      { id: 'pr_2', name: 'G‘isht', sku: 'GSH-1', category: 'G‘isht', unit: 'dona', price: 1_200, wholesalePrice: 1_000, cost: 800, stock: 5_000, stocks: { wh_main: 5_000 }, minStock: 500, image: PNG_1X1 },
      ...(opts.clean ? [] : [
        { id: 'pr_3', name: 'Qum', sku: 'SEM-400', category: 'Qum', unit: 'm3', price: 90_000, wholesalePrice: 85_000, cost: 70_000, stock: -3, stocks: { wh_main: -3 }, minStock: 0 },
      ]),
    ],
    sales: [
      { id: 'sa_1', number: 'CHEK-1845', type: 'sale', sellerId: 'em_1', items: [item('pr_1', 2, 60_000)], priceTier: 'retail', subtotal: 120_000, discount: 0, taxRate: 0, tax: 0, total: 120_000, paid: { cash: 150_000, card: 0, transfer: 0 }, debtPaid: 0, change: 30_000, status: 'completed', date: '2026-09-20T09:15:00Z', warehouseId: 'wh_main' },
      { id: 'sa_2', number: 'CHEK-1846', type: 'sale', customerId: 'cl_2', items: [item('pr_1', 10, 55_000)], priceTier: 'wholesale', subtotal: 550_000, discount: 0, taxRate: 0, tax: 0, total: 550_000, paid: { cash: 0, card: 0, transfer: 0 }, debtPaid: 200_000, change: 0, status: 'pending', date: '2026-09-21T11:00:00Z', dueDate: '2026-10-21', warehouseId: 'wh_2' },
      { id: 'sa_3', number: 'QAYT-1001', type: 'return', items: [item('pr_1', 1, 60_000)], priceTier: 'retail', subtotal: 60_000, discount: 0, taxRate: 0, tax: 0, total: 60_000, paid: { cash: 60_000, card: 0, transfer: 0 }, debtPaid: 0, change: 0, status: 'completed', date: '2026-09-22', relatedSaleId: 'sa_1', warehouseId: 'wh_main' },
      ...(opts.clean ? [] : [
        { id: 'sa_4', number: 'CHEK-1847', type: 'sale', items: [item('pr_zzz', 1, 10_000)], priceTier: 'retail', subtotal: 10_000, discount: 0, taxRate: 0, tax: 0, total: 10_000, paid: { cash: 10_000, card: 0, transfer: 0 }, debtPaid: 0, change: 0, status: 'completed', date: '2026-09-22' },
        { id: 'sa_5', number: 'CHEK-1840', type: 'sale', customerId: 'cl_gone', items: [item('pr_2', 100, 1_200, 800)], priceTier: 'retail', subtotal: 120_000, discount: 0, taxRate: 0, tax: 0, total: 120_000, paid: { cash: 120_000, card: 0, transfer: 0 }, debtPaid: 0, change: 0, status: 'completed', date: '2026-09-19' },
        { id: 'sa_6', number: 'CHEK-1841', type: 'sale', customerId: 'cl_gone', items: [item('pr_2', 10, 1_200, 800)], priceTier: 'retail', subtotal: 12_000, discount: 0, taxRate: 0, tax: 0, total: 12_000, paid: { cash: 0, card: 0, transfer: 0 }, debtPaid: 0, change: 0, status: 'pending', date: '2026-09-19' },
      ]),
    ],
    debtPayments: [{ id: 'dp_1', saleId: 'sa_2', customerId: 'cl_2', amount: 200_000, method: 'cash', date: '2026-09-22' }],
    shifts: [
      { id: 'sh_1', openedAt: '2026-09-20T08:00:00Z', openingBalance: 100_000, cashIn: 150_000, cashOut: 0, status: 'closed', closedAt: '2026-09-20T18:00:00Z', expectedBalance: 250_000, countedBalance: 250_000, difference: 0 },
      { id: 'sh_2', openedAt: '2026-09-22T08:00:00Z', openingBalance: 250_000, cashIn: 200_000, cashOut: 60_000, status: 'open' },
      ...(opts.clean ? [] : [{ id: 'sh_0', openedAt: '2026-09-10T08:00:00Z', openingBalance: 0, cashIn: 0, cashOut: 0, status: 'open' }]),
    ],
    cashBalance: 390_000,
    activeShiftId: 'sh_2',
    cashMovements: [
      { id: 'cm_1', shiftId: 'sh_2', direction: 'out', amount: 60_000, reason: 'Qaytarish', createdAt: '2026-09-22T12:00:00Z' },
      ...(opts.clean ? [] : [{ id: 'cm_2', direction: 'in', amount: 5_000, reason: 'Smenasiz', createdAt: '2026-09-22T12:00:00Z' }]),
    ],
    expenseTemplates: [{ id: 'et_1', name: 'Ijara', category: 'rent', amount: 2_000_000, method: 'bank', period: 'monthly', dayOfPeriod: 1, active: true, lastRunKey: '2026-09' }],
    expenses: [{ id: 'ex_1', category: 'rent', amount: 2_000_000, method: 'bank', date: '2026-09-01', note: 'Sentabr ijarasi', templateId: 'et_1' }],
    purchaseOrders: [
      { id: 'po_1', number: 'BUY-1003', supplierId: 'sp_1', items: [{ productId: 'pr_1', name: 'Sement M400', qty: 100, receivedQty: 60, cost: 45_000 }], total: 4_500_000, paid: 1_000_000, status: 'partial', date: '2026-09-15', warehouseId: 'wh_2', dueDate: '2026-09-30' },
    ],
    supplierPayments: [{ id: 'spay_1', poId: 'po_1', supplierId: 'sp_1', amount: 1_000_000, method: 'bank', date: '2026-09-16' }],
    quotes: [{ id: 'qt_1', number: 'TKLF-1005', customerId: 'cl_1', items: [item('pr_1', 5, 60_000)], subtotal: 300_000, discount: 0, taxRate: 0, tax: 0, total: 300_000, status: 'sent', date: '2026-09-18', validUntil: '2026-09-25' }],
    deliveries: [{ id: 'dl_1', saleId: 'sa_2', customerId: 'cl_2', address: 'Yunusobod 7', phone: '+998901234567', fee: 50_000, driverId: 'em_1', status: 'pending', scheduledDate: '2026-09-23', createdAt: '2026-09-21T11:05:00Z' }],
    messages: [{ id: 'ms_1', target: 'debtors', recipientLabel: 'Qarzdorlar', recipients: 1, text: 'Qarzingizni to‘lang', date: '2026-09-22T09:00:00Z' }],
    movements: [
      { id: 'mv_1', productId: 'pr_1', productName: 'Sement M400', type: 'intake', qty: 60, balanceAfter: 60, warehouseId: 'wh_2', date: '2026-09-16', supplierId: 'sp_1', unitCost: 45_000 },
      { id: 'mv_2', productId: 'pr_1', productName: 'Sement M400', type: 'sale', qty: -2, balanceAfter: 98, warehouseId: 'wh_main', date: '2026-09-20', refId: 'sa_1' },
      ...(opts.clean ? [] : [{ id: 'mv_3', productId: 'pr_gone', productName: 'Eski tovar', type: 'writeoff', qty: -1, balanceAfter: 0, date: '2026-09-01' }]),
    ],
    audit: [{ id: 'au_1', date: '2026-09-20T09:15:00Z', userName: 'Admin', action: 'sale.create', detail: 'CHEK-1845' }],
  }
  return {
    source: 'localStorage' as const,
    version: 15,
    exportedAt: '2026-09-22T19:00:00Z',
    data,
    settings: { storeName: 'Ali Qurilish', taxEnabled: false, taxRate: 12, loyaltyRate: 2, maxDiscountPct: 15, receiptFooter: 'Rahmat!' },
    users: [{ name: 'Vali Kassir', email: 'Kassir@Dokon.uz', role: 'sotuvchi' as const }],
  }
}
