import { Injectable } from '@nestjs/common'
import { currentContext } from '@/common/context/request-context'
import { DomainError } from '@/common/errors/domain.error'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { StockService, type ProductStockState, type StockResult } from './stock.service'
import type {
  AdjustDto, AdjustResultDto, IntakeDto, StockOperationResultDto, TransferDto, TransferResultDto,
  WriteoffDto,
} from './dto/stock.dto'

const ADJUST_NOTE = 'Inventarizatsiya'

/**
 * Ombor amallari (04-api §3): kirim, chiqim, inventarizatsiya, ko'chirish.
 *
 * Har biri so'rov tranzaksiyasida: harakat va audit yozuvi birga saqlanadi
 * yoki birga bekor bo'ladi. Jurnalga miqdor va tannarx o'zgarishi (diff)
 * bilan tushadi (03 §3.9: `stock.intake|writeoff|adjust|transfer`).
 */
@Injectable()
export class StockOperationsService {
  constructor(
    private readonly stock: StockService,
    private readonly audit: AuditService,
  ) {}

  /** Kirim: qoldiq ortadi, kirim narxi berilsa o'rtacha tannarx yangilanadi (I11) */
  async intake(dto: IntakeDto): Promise<StockOperationResultDto> {
    const result = await this.stock.apply(
      [{
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        type: 'intake',
        qty: dto.qty,
        unitCost: dto.unitCost,
        supplierId: dto.supplierId,
        note: dto.note,
      }],
      this.meta(),
    )
    const [movement] = result.movements
    const product = productOf(result, dto.productId)
    await this.audit.log({
      action: 'stock.intake',
      entityType: 'product',
      entityId: dto.productId,
      diff: {
        warehouseId: movement!.warehouseId,
        qty: dto.qty,
        unitCost: dto.unitCost ?? null,
        supplierId: dto.supplierId ?? null,
        costAfter: product.cost,
      },
    })
    return { movementId: movement!.movementId, product }
  }

  /** Chiqim: sabab majburiy; qoldiqdan ko'p chiqarib bo'lmaydi (I2) */
  async writeoff(dto: WriteoffDto): Promise<StockOperationResultDto> {
    const result = await this.stock.apply(
      [{
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        type: 'writeoff',
        qty: -dto.qty,
        note: dto.reason,
      }],
      this.meta(),
    )
    const [movement] = result.movements
    await this.audit.log({
      action: 'stock.writeoff',
      entityType: 'product',
      entityId: dto.productId,
      diff: { warehouseId: movement!.warehouseId, qty: dto.qty, reason: dto.reason },
    })
    return { movementId: movement!.movementId, product: productOf(result, dto.productId) }
  }

  /**
   * Inventarizatsiya: sanalgan miqdor bilan farq BITTA `adjustment`
   * harakatiga yoziladi; farq 0 bo'lsa harakat yozilmaydi. Farq qulf ostida
   * hisoblanadi — sanoq paytidagi parallel sotuv hisobni buzmaydi.
   */
  async adjust(dto: AdjustDto): Promise<AdjustResultDto> {
    const ids = dto.items.map((i) => i.productId)
    if (new Set(ids).size !== ids.length) {
      throw new DomainError('VALIDATION_FAILED', 'Bir mahsulot sanoqda bir marta bo‘ladi', [
        { field: 'items', code: 'VALIDATION_FAILED' },
      ])
    }

    const result = await this.stock.apply(
      dto.items.map((item, i) => ({
        productId: item.productId,
        warehouseId: dto.warehouseId,
        type: 'adjustment' as const,
        countTo: item.countedQty,
        note: dto.note ?? ADJUST_NOTE,
        field: `items[${i}].productId`,
      })),
      this.meta(),
    )
    const adjusted = result.movements.map((m) => ({
      productId: m.productId,
      movementId: m.movementId,
      delta: m.qty,
      balanceAfter: m.balanceAfter,
    }))
    if (adjusted.length > 0) {
      await this.audit.log({
        action: 'stock.adjust',
        entityType: 'product',
        diff: { warehouseId: result.movements[0]!.warehouseId, lines: adjusted.map(({ productId, delta }) => ({ productId, delta })) },
      })
    }
    return { adjusted, unchanged: result.unchanged.length }
  }

  /**
   * Ko'chirish: IKKI harakat (`transfer_out` + `transfer_in`) bitta
   * amalda — jami qoldiq O'ZGARMAYDI (I1), faqat taqsimot.
   */
  async transfer(dto: TransferDto): Promise<TransferResultDto> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new DomainError('WAREHOUSE_SAME', 'Manba va qabul ombori bir xil', [
        { field: 'toWarehouseId', code: 'WAREHOUSE_SAME' },
      ])
    }
    const result = await this.stock.apply(
      [
        {
          productId: dto.productId,
          warehouseId: dto.fromWarehouseId,
          type: 'transfer_out',
          qty: -dto.qty,
          counterWarehouseId: dto.toWarehouseId,
          note: dto.note,
        },
        {
          productId: dto.productId,
          warehouseId: dto.toWarehouseId,
          type: 'transfer_in',
          qty: dto.qty,
          counterWarehouseId: dto.fromWarehouseId,
          note: dto.note,
        },
      ],
      this.meta(),
    )
    const [out, into] = result.movements
    await this.audit.log({
      action: 'stock.transfer',
      entityType: 'product',
      entityId: dto.productId,
      diff: { from: dto.fromWarehouseId, to: dto.toWarehouseId, qty: dto.qty },
    })
    return {
      outMovementId: out!.movementId,
      inMovementId: into!.movementId,
      product: productOf(result, dto.productId),
    }
  }

  private meta(): { date: string; userId?: string } {
    return { date: businessDate(), userId: currentContext().userId }
  }
}

function productOf(result: StockResult, productId: string): ProductStockState {
  return result.products.get(productId)!
}
