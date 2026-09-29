import { Injectable } from '@nestjs/common'
import { currentTenantId } from '@/common/context/request-context'
import { AuditService } from '@/modules/audit/audit.service'
import { TelegramService } from '@/modules/telegram/telegram.service'
import { PrismaService } from '@/prisma/prisma.service'
import { receiptPdf } from './receipt-pdf'
import { receiptCaption } from './receipt-telegram'
import { SalesQueriesService } from './sales-queries.service'

/**
 * Chekni mijozga Telegram'da yuborish (Q116): PDF (chop etiladigan chek bilan
 * bir xil, fiskal QR bilan) va qisqa izoh — bitta xabar. Darhol, navbatsiz:
 * kassir natijani (yuborildi / mijoz botga ulanmagan) shu zahoti ko'radi.
 */
@Injectable()
export class ReceiptDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: SalesQueriesService,
    private readonly telegram: TelegramService,
    private readonly audit: AuditService,
  ) {}

  /** So'rov tranzaksiyasiz (`@ManualTransaction`): o'qish va jurnal — qisqa tranzaksiyalarda, yuklash — ularsiz */
  async toTelegram(saleId: string): Promise<void> {
    const receipt = await this.queries.receipt(saleId)
    const pdf = await receiptPdf(receipt)
    await this.telegram.sendDocument(
      receipt.customer?.id ?? null,
      { name: `${receipt.sale.number}.pdf`, content: pdf, mime: 'application/pdf' },
      receiptCaption(receipt),
    )
    await this.prisma.inTenantTransaction(currentTenantId(), (tx) =>
      this.audit.log({ action: 'sale.receiptSent', entityType: 'sale', entityId: saleId, detail: 'telegram' }, tx),
    )
  }
}
