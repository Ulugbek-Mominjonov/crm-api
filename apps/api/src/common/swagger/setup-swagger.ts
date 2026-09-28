import { writeFileSync } from 'node:fs'
import { Logger, type INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger'

export interface SwaggerOptions {
  /** UI ochilsinmi (`SWAGGER_ENABLED`; berilmasa — production'dan boshqa muhitda) */
  serveUi: boolean
  /** Spec faylga yozilsinmi (CI va mijoz generatsiyasi uchun) */
  emitPath?: string
  version: string
}

/**
 * OpenAPI hujjati koddan yig'iladi.
 *
 * Qo'lda yozilgan API hujjati muqarrar eskiradi: shuning uchun yagona
 * manba — dekoratorlar. `openapi.json` CI'da solishtiriladi, ya'ni
 * hujjat kod bilan ajralib qololmaydi (core/12-standards.md §12.6).
 */
export function buildDocument(app: INestApplication, version: string): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Qurilish CRM API')
    .setDescription(
      'Qurilish mollari do‘koni uchun savdo, ombor va kassa tizimi. ' +
        'Barcha summalar — **butun so‘m**; miqdorlar — 3 kasr xonagacha.',
    )
    .setVersion(version)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    // `servers` ATAYLAB yo'q: yo'llarda `/api/v1` bor, Swagger UI so'rovni o'zi ochilgan manzilga
    // yuboradi (lokal ham, production ham). Mutlaq manzil production'da localhost'ga yuborardi
    .addTag('health', 'Sog‘liq va tayyorlik')
    .addTag('auth', 'Autentifikatsiya')
    .addTag('settings', 'Do‘kon sozlamalari')
    .addTag('warehouses', 'Omborlar')
    .addTag('categories', 'Mahsulot kategoriyalari')
    .addTag('products', 'Mahsulotlar katalogi, import va ommaviy narx')
    .addTag('clients', 'Mijozlar')
    .addTag('suppliers', 'Ta’minotchilar')
    .addTag('employees', 'Xodimlar (shaxs)')
    .addTag('users', 'Foydalanuvchilar (kirish hisoblari)')
    .addTag('stock', 'Ombor amallari: kirim, chiqim, inventarizatsiya, ko‘chirish, jurnal')
    .addTag('sales', 'Sotuvlar: chek, qaytarish, bekor qilish')
    .addTag('quotes', 'Takliflar (smeta) va ularni sotuvga aylantirish')
    .addTag('cash', 'Kassa: smena, naqd kirim/chiqim, X/Z hisobot')
    .addTag('expenses', 'Xarajatlar va takrorlanuvchi shablonlar')
    .addTag('debts', 'Qarzlar: qarzdorlar ro‘yxati va to‘lovlar')
    .addTag('purchase-orders', 'Kirim buyurtmalari: qabul va ta’minotchiga to‘lov')
    .addTag('deliveries', 'Yetkazib berish, haydovchi ko‘rinishi, marshrut')
    .addTag('messages', 'Xabarlar (SMS): qabul qiluvchilar, navbat, jurnal')
    .addTag('reports', 'Hisobotlar: boshqaruv paneli, foyda/zarar, analitika')
    .addTag('files', 'Fayllar: presigned yuklash, tasdiqlash, o‘qish, hajm')
    .addTag('exports', 'Eksport: CSV/JSON — kichigi darhol, kattasi fonda (S3 havola)')
    .addTag('migration', 'Brauzerdagi (localStorage) ma’lumotni serverga ko‘chirish')
    .addTag('billing', 'Obuna: hisob-faktura, Payme va Click to‘lovlari')
    .addTag('account', 'Do‘kon hisobi: tarif, chegaralar, o‘chirish')
    .addTag('backup', 'Do‘kon zaxirasi: butun ma’lumot JSON (gzip), havola 1 soat')
    .addTag('audit', 'Amallar jurnali (faqat o‘qish)')
    .build()

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method) =>
      `${controller.replace('Controller', '')}_${method}`,
  })
}

export function setupSwagger(app: INestApplication, opts: SwaggerOptions): void {
  const document = buildDocument(app, opts.version)

  if (opts.emitPath) {
    writeFileSync(opts.emitPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    new Logger('Swagger').log(`OpenAPI spec yozildi: ${opts.emitPath}`)
  }

  // Sukut bo'yicha production'da UI yopiq (endpointlar ro'yxati hujum yuzasini kengaytiradi);
  // `SWAGGER_ENABLED=true` bilan ochiladi
  if (opts.serveUi) {
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    })
  }
}
