import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'
import { PasswordService } from '@/modules/auth/password.service'
import { PrismaService } from '@/prisma/prisma.service'
import { PlatformAuditService } from './platform-audit.service'

/**
 * Birinchi egasi hisobi (T-135): `PLATFORM_OWNER_EMAIL` + `PLATFORM_OWNER_PASSWORD`
 * berilgan bo'lsa ishga tushishda yaratiladi — serverga kirib SQL yozish
 * shart emas. Hisob allaqachon bor bo'lsa TEGILMAYDI (parol qayta
 * yozilmaydi): env'dagi parol keyin almashtirilgan bo'lishi mumkin.
 * Kuchsiz parol — server ko'tarilmaydi (parol siyosati).
 */
@Injectable()
export class PlatformBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(PlatformBootstrapService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: PlatformAuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get('PLATFORM_OWNER_EMAIL', { infer: true })?.toLowerCase()
    const password = this.config.get('PLATFORM_OWNER_PASSWORD', { infer: true })
    if (!email || !password) return

    const existing = await this.prisma.platformAdmin.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      this.logger.log({ email }, 'Egasi hisobi mavjud — env parolga tegilmadi')
      return
    }
    const admin = await this.prisma.platformAdmin.create({
      data: { email, name: 'Egasi', role: 'owner', passwordHash: await this.passwords.hash(password) },
      select: { id: true },
    })
    await this.audit.log({ action: 'platform.bootstrap', adminId: null, entityType: 'admin', entityId: admin.id, diff: { email } })
    this.logger.log({ email, adminId: admin.id }, 'Egasi hisobi yaratildi (PLATFORM_OWNER_EMAIL)')
  }
}
