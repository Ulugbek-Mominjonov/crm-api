import { writeFileSync } from 'node:fs'
import { Logger, type INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger'

export interface SwaggerOptions {
  /** UI ochilsinmi (production'da — yo'q) */
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
    .addServer('http://localhost:3000/api/v1', 'Lokal')
    .addTag('health', 'Sog‘liq va tayyorlik')
    .addTag('auth', 'Autentifikatsiya')
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

  // Production'da UI yopiq: endpointlar ro'yxati hujum yuzasini kengaytiradi
  if (opts.serveUi) {
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    })
  }
}
