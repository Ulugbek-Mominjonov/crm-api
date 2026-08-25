"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const argon2_1 = __importDefault(require("argon2"));
const shared_1 = require("@crm/shared");
/**
 * Ishlab chiqish uchun demo do'kon.
 *
 * Mijoz ilovasidagi mock ma'lumot bilan mos: shunda frontend serverga
 * ulangach ekranlar bo'sh ko'rinmaydi va qo'lda ma'lumot kiritish shart emas.
 *
 * PRODUCTION'da ISHLAMAYDI — real bazaga soxta sotuv tushishi mumkin emas.
 */
const prisma = new client_1.PrismaClient();
const DEMO_EMAIL = 'admin@crm.uz';
const DEMO_PASSWORD = 'admin12345';
const SUPPLIERS = [
    { name: 'Bekabad Sement', phone: '+998 71 200 10 10', contactPerson: 'Rustam Aliyev', tin: '201234567', paymentTermDays: 14 },
    { name: 'Qizilqum G‘isht Zavodi', phone: '+998 65 223 44 55', contactPerson: 'Sanjar Umarov', tin: '302556677', paymentTermDays: 30 },
    { name: 'MetalTrade MChJ', phone: '+998 71 244 77 88', contactPerson: 'Igor Petrov', tin: '403889900', paymentTermDays: 7 },
];
const PRODUCTS = [
    { name: 'Sement M400 (50 kg)', sku: 'SEM-400-50', category: 'Sement va aralashmalar', unit: 'qop', price: 62000n, wholesale: 58000n, cost: 52000n, qty: '240', min: '40', altUnit: 'kg', altFactor: '50' },
    { name: 'Sement M500 (50 kg)', sku: 'SEM-500-50', category: 'Sement va aralashmalar', unit: 'qop', price: 71000n, wholesale: 66000n, cost: 59000n, qty: '120', min: '30', altUnit: 'kg', altFactor: '50' },
    { name: 'Qizil g‘isht M100', sku: 'GISHT-M100', category: 'G‘isht va bloklar', unit: 'dona', price: 1400n, wholesale: 1250n, cost: 1050n, qty: '18000', min: '3000' },
    { name: 'Gazoblok 600×300×200', sku: 'BLOK-6032', category: 'G‘isht va bloklar', unit: 'dona', price: 24000n, wholesale: 22000n, cost: 19500n, qty: '860', min: '150' },
    { name: 'Armatura A500 12mm', sku: 'ARM-A500-12', category: 'Metall va armatura', unit: 'metr', price: 15500n, wholesale: 14200n, cost: 12800n, qty: '2400', min: '400' },
    { name: 'Suvoq aralashmasi 25 kg', sku: 'SUV-25', category: 'Sement va aralashmalar', unit: 'qop', price: 38000n, wholesale: 35000n, cost: 30000n, qty: '95', min: '25' },
    { name: 'Fasad bo‘yog‘i oq 20 l', sku: 'BOY-FAS-20', category: 'Bo‘yoq va laklar', unit: 'litr', price: 34000n, wholesale: 31000n, cost: 27500n, qty: '180', min: '40' },
    { name: 'Kabel VVG 3×2.5', sku: 'KAB-VVG-325', category: 'Elektr mollari', unit: 'metr', price: 12800n, wholesale: 11500n, cost: 9900n, qty: '1500', min: '300' },
    { name: 'PPR quvur 25mm', sku: 'PPR-25', category: 'Santexnika', unit: 'metr', price: 9600n, wholesale: 8800n, cost: 7400n, qty: '640', min: '120' },
    { name: 'Gipsokarton 12.5mm', sku: 'GKL-125', category: 'Yog‘och va gips', unit: 'm2', price: 41000n, wholesale: 38000n, cost: 33000n, qty: '310', min: '60' },
    { name: 'Perforator 850W', sku: 'ASB-PERF-850', category: 'Asboblar', unit: 'dona', price: 1450000n, wholesale: 1340000n, cost: 1180000n, qty: '12', min: '3' },
    { name: 'Qum (tonna)', sku: 'QUM-T', category: 'Boshqa', unit: 'm3', price: 180000n, wholesale: 165000n, cost: 140000n, qty: '38', min: '10' },
];
const CLIENTS = [
    { name: 'Alisher Qodirov', phone: '+998 90 123 45 67', group: 'retail', type: 'individual' },
    { name: 'Qurilish Servis MChJ', phone: '+998 71 233 22 11', group: 'wholesale', type: 'company', creditLimit: 30000000n, paymentTermDays: 21 },
    { name: 'Zafar Mahmudov', phone: '+998 93 555 11 22', group: 'vip', type: 'individual', creditLimit: 10000000n, paymentTermDays: 14 },
];
async function main() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Demo ma’lumot production bazasiga yozilmaydi');
    }
    const existing = await prisma.tenant.findFirst({ where: { name: 'Qurilish Mollari (demo)' } });
    if (existing) {
        console.warn('Demo tenant allaqachon bor, o‘tkazib yuborildi:', existing.id);
        return;
    }
    const passwordHash = await argon2_1.default.hash(DEMO_PASSWORD, { type: argon2_1.default.argon2id });
    await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { name: 'Qurilish Mollari (demo)', plan: 'pro' } });
        await tx.settings.create({
            data: {
                tenantId: tenant.id,
                storeName: 'Qurilish Mollari',
                receiptPhone: '+998 71 200 00 00',
                receiptAddress: 'Toshkent sh., Qurilish ko‘chasi 1',
                receiptFooter: 'Xaridingiz uchun rahmat!',
                onboarded: true,
            },
        });
        const main = await tx.warehouse.create({
            data: { tenantId: tenant.id, name: 'Asosiy ombor', isDefault: true },
        });
        const sklad = await tx.warehouse.create({
            data: { tenantId: tenant.id, name: 'Sklad', address: 'Sergeli, 4-uy' },
        });
        await tx.tenantState.create({
            data: { tenantId: tenant.id, activeWarehouseId: main.id },
        });
        await tx.category.createMany({
            data: shared_1.PRODUCT_CATEGORIES.map((name, i) => ({ tenantId: tenant.id, name, sortOrder: i })),
        });
        await tx.docCounter.createMany({
            data: ['CHEK', 'QAYT', 'TKLF', 'BUY'].map((prefix) => ({ tenantId: tenant.id, prefix })),
        });
        const categories = await tx.category.findMany({ where: { tenantId: tenant.id } });
        const catId = (name) => categories.find((c) => c.name === name)?.id ?? categories[0].id;
        const owner = await tx.employee.create({
            data: { tenantId: tenant.id, name: 'Bobur Toshmatov', position: 'Direktor', phone: '+998 90 111 22 33', hiredAt: new Date('2024-03-01') },
        });
        await tx.user.create({
            data: { tenantId: tenant.id, employeeId: owner.id, email: DEMO_EMAIL, passwordHash, role: 'admin' },
        });
        for (const [i, e] of [
            { name: 'Otabek Normatov', position: 'Sotuvchi', role: 'sotuvchi', email: 'sotuvchi@crm.uz' },
            { name: 'Nodira Saidova', position: 'Omborchi', role: 'omborchi', email: 'ombor@crm.uz' },
            { name: 'Jasur Aliyev', position: 'Menejer', role: 'manager', email: 'manager@crm.uz' },
        ].entries()) {
            const emp = await tx.employee.create({
                data: { tenantId: tenant.id, name: e.name, position: e.position, phone: `+998 90 222 00 0${i}`, hiredAt: new Date('2025-01-15') },
            });
            await tx.user.create({
                data: { tenantId: tenant.id, employeeId: emp.id, email: e.email, passwordHash, role: e.role },
            });
        }
        const suppliers = [];
        for (const s of SUPPLIERS) {
            suppliers.push(await tx.supplier.create({ data: { tenantId: tenant.id, ...s } }));
        }
        for (const [i, p] of PRODUCTS.entries()) {
            const product = await tx.product.create({
                data: {
                    tenantId: tenant.id,
                    name: p.name,
                    sku: p.sku,
                    barcode: `478${String(1000000 + i).padStart(10, '0')}`,
                    categoryId: catId(p.category),
                    unit: p.unit,
                    price: p.price,
                    wholesalePrice: p.wholesale,
                    cost: p.cost,
                    minStock: p.min,
                    supplierId: suppliers[i % suppliers.length].id,
                    ...('altUnit' in p ? { altUnit: p.altUnit, altFactor: p.altFactor } : {}),
                },
            });
            // Qoldiq ikki ombor bo'yicha taqsimlanadi — I1 triggeri jamini hisoblaydi
            await tx.productStock.create({
                data: { tenantId: tenant.id, productId: product.id, warehouseId: main.id, qty: p.qty },
            });
            if (i % 3 === 0) {
                await tx.productStock.create({
                    data: { tenantId: tenant.id, productId: product.id, warehouseId: sklad.id, qty: '25' },
                });
            }
        }
        for (const c of CLIENTS) {
            await tx.client.create({
                data: { tenantId: tenant.id, status: 'active', ...c },
            });
        }
    }, { timeout: 30_000 });
    const counts = {
        mahsulot: await prisma.product.count(),
        mijoz: await prisma.client.count(),
        xodim: await prisma.employee.count(),
        ombor: await prisma.warehouse.count(),
    };
    console.warn('Demo do‘kon yaratildi:', counts);
    console.warn(`Kirish: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}
main()
    .catch((err) => {
    console.error('Seed xatosi:', err);
    process.exitCode = 1;
})
    .finally(() => void prisma.$disconnect());
//# sourceMappingURL=seed.js.map