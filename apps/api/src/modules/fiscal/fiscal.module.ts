import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FiscalDispatcher } from './fiscal-dispatcher'
import { createFiscalProvider, FISCAL_PROVIDER } from './fiscal.provider'
import { FiscalService } from './fiscal.service'

@Module({
  providers: [
    FiscalService,
    FiscalDispatcher,
    { provide: FISCAL_PROVIDER, useFactory: createFiscalProvider, inject: [ConfigService] },
  ],
  exports: [FiscalService],
})
export class FiscalModule {}
