import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SettingsModule } from '@/modules/settings/settings.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { MessageDispatcher } from './message-dispatcher'
import { MessagesController } from './messages.controller'
import { MessagesService } from './messages.service'
import { createSmsProvider } from './sms/sms-provider.factory'
import { SMS_PROVIDER } from './sms/sms.provider'

@Module({
  imports: [SettingsModule, TenantsModule],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    MessageDispatcher,
    { provide: SMS_PROVIDER, useFactory: createSmsProvider, inject: [ConfigService] },
  ],
  exports: [MessageDispatcher],
})
export class MessagesModule {}
