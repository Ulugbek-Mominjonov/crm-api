import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import sharp from 'sharp'
import { TtlCache } from '@/common/cache/ttl-cache'
import { currentTenantId } from '@/common/context/request-context'
import type { Env } from '@/config/env.schema'
import { bucketOf, variantKey } from '@/modules/files/files.service'
import { S3Service } from '@/modules/files/s3.service'
import { PrismaService } from '@/prisma/prisma.service'
import type { ReceiptDto } from './dto/sale.dto'
import { LOGO_MAX_HEIGHT, LOGO_MAX_WIDTH, receiptPdf, type ReceiptLogo } from './receipt-pdf'

/** Termal printer (203 dpi) ikki barobar zichlikda — chop etishda tiniq, PDF esa kichik */
const LOGO_DPI = 406
const PT_PER_INCH = 72
const LOGO_MAX_PX = {
  width: Math.round((LOGO_MAX_WIDTH / PT_PER_INCH) * LOGO_DPI),
  height: Math.round((LOGO_MAX_HEIGHT / PT_PER_INCH) * LOGO_DPI),
}
/** Variant yasash bilan bir xil himoya — "dekompressiya bombasi" */
const MAX_INPUT_PIXELS = 25_000_000
/**
 * Fayl id → tayyor logotip. Tarkib o'zgarmaydi (yangi logotip — yangi fayl),
 * shuning uchun muddat faqat xotirani bo'shatish uchun
 */
const CACHE_TTL_MS = 60 * 60_000
const CACHE_MAX_LOGOS = 500

/**
 * Chek PDF'i do'kon logotipi bilan (B5): `GET /sales/:id/receipt?format=pdf`
 * va Telegram'dagi chek. Logotip oq-qora (termoprinter rang chiqarmaydi),
 * shaffof joyi oq. Keshlanadi: takroriy chekda baza ham, S3 ham so'ralmaydi.
 * Logotip yo'q, o'chirilgan yoki buzilgan bo'lsa — chek logotipsiz (xato emas).
 */
@Injectable()
export class ReceiptPdfService {
  private readonly logger = new Logger(ReceiptPdfService.name)
  private readonly logos: TtlCache<string, ReceiptLogo>

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    config: ConfigService<Env, true>,
  ) {
    this.logos =
      config.get('CACHE_DRIVER', { infer: true }) === 'none'
        ? TtlCache.disabled()
        : new TtlCache(CACHE_TTL_MS, CACHE_MAX_LOGOS)
  }

  /** Tranzaksiyasiz chaqiriladi: S3 dan o'qish ulanishni band qilmasin */
  async render(receipt: ReceiptDto): Promise<Buffer> {
    return receiptPdf(receipt, await this.logo(receipt.store.logoFileId))
  }

  private async logo(fileId: string | null): Promise<ReceiptLogo | null> {
    if (!fileId) return null
    const cached = this.logos.get(fileId)
    if (cached) return cached
    try {
      const file = await this.prisma.inTenantTransaction(currentTenantId(), (tx) =>
        tx.file.findFirst({
          where: { id: fileId, kind: 'store_logo', status: 'ready', deletedAt: null },
          select: { key: true, bucket: true, variants: true },
        }),
      )
      if (!file) return null
      const source = await this.s3.getBuffer(bucketOf(file), variantKey(file, '512'))
      const { data, info } = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
        .flatten({ background: '#ffffff' })
        .grayscale()
        .resize({ ...LOGO_MAX_PX, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true })
      const logo = { image: data, width: info.width, height: info.height }
      this.logos.set(fileId, logo)
      return logo
    } catch (err) {
      this.logger.warn({ err, fileId }, 'Chek logotipi o‘qilmadi — chek logotipsiz chiqadi')
      return null
    }
  }
}
