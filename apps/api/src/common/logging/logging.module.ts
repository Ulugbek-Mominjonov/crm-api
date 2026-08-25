import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Logger as PinoLogger } from 'pino'
import type { Env } from '@/config/env.schema'
import { AppLogger, createRootLogger } from './logger.service'

export const ROOT_LOGGER = Symbol('ROOT_LOGGER')

@Global()
@Module({
  providers: [
    {
      provide: ROOT_LOGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PinoLogger =>
        createRootLogger({
          level: config.get('LOG_LEVEL', { infer: true }),
          // Production'da JSON: mashina o'qiydi. Dev'da odam o'qiydi.
          pretty: config.get('NODE_ENV', { infer: true }) === 'development',
        }),
    },
    {
      provide: AppLogger,
      inject: [ROOT_LOGGER],
      useFactory: (root: PinoLogger): AppLogger => new AppLogger(root),
    },
  ],
  exports: [AppLogger, ROOT_LOGGER],
})
export class LoggingModule {}
