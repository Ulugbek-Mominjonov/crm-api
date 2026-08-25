import { Global, Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config'
import { parseEnv, type Env } from './env.schema'

/** Tipli konfiguratsiya: `config.get('PORT')` → number */
export type AppConfigService = ConfigService<Env, true>

/**
 * Global konfiguratsiya moduli.
 *
 * `validate` ishga tushishda chaqiriladi — sxemadan o'tmagan muhitda
 * Nest umuman ko'tarilmaydi.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: (raw) => parseEnv(raw as NodeJS.ProcessEnv),
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
