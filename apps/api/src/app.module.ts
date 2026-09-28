import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { ConfigModule } from '@/config/config.module'
import { PrismaModule } from '@/prisma/prisma.module'
import { LoggingModule } from '@/common/logging/logging.module'
import { RequestContextMiddleware } from '@/common/middleware/request-context.middleware'
import { FieldVisibilityInterceptor } from '@/common/interceptors/field-visibility.interceptor'
import { HealthModule } from '@/modules/health/health.module'
import { AuthModule } from '@/modules/auth/auth.module'
import { AuditModule } from '@/modules/audit/audit.module'
import { AuditInterceptor } from '@/modules/audit/audit.interceptor'
import { TenantTransactionInterceptor } from '@/prisma/tenant-transaction.interceptor'
import { ReadOnlyTenantInterceptor } from '@/modules/tenants/read-only.interceptor'
import { IdempotencyModule } from '@/modules/idempotency/idempotency.module'
import { IdempotencyInterceptor } from '@/modules/idempotency/idempotency.interceptor'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { SettingsModule } from '@/modules/settings/settings.module'
import { WarehousesModule } from '@/modules/warehouses/warehouses.module'
import { CategoriesModule } from '@/modules/categories/categories.module'
import { ProductsModule } from '@/modules/products/products.module'
import { ClientsModule } from '@/modules/clients/clients.module'
import { SuppliersModule } from '@/modules/suppliers/suppliers.module'
import { EmployeesModule } from '@/modules/employees/employees.module'
import { UsersModule } from '@/modules/users/users.module'
import { StockModule } from '@/modules/stock/stock.module'
import { SalesModule } from '@/modules/sales/sales.module'
import { QuotesModule } from '@/modules/quotes/quotes.module'
import { CashModule } from '@/modules/cash/cash.module'
import { ExpensesModule } from '@/modules/expenses/expenses.module'
import { DebtsModule } from '@/modules/debts/debts.module'
import { PurchaseOrdersModule } from '@/modules/purchase-orders/purchase-orders.module'
import { DeliveriesModule } from '@/modules/deliveries/deliveries.module'
import { MessagesModule } from '@/modules/messages/messages.module'
import { ReportCacheModule } from '@/modules/reports/report-cache.service'
import { ReportsModule } from '@/modules/reports/reports.module'
import { FilesModule } from '@/modules/files/files.module'
import { ExportsModule } from '@/modules/exports/exports.module'
import { MigrationModule } from '@/modules/migration/migration.module'
import { InvariantsModule } from '@/modules/invariants/invariants.module'
import { BillingModule } from '@/modules/billing/billing.module'
import { AccountModule } from '@/modules/account/account.module'
import { BackupModule } from '@/modules/backup/backup.module'
import { RealtimeModule } from '@/modules/realtime/realtime.module'
import { QueueModule } from '@/modules/queue/queue.module'

/** Ildiz modul — qolgan modullar bosqichma-bosqich shu yerga ulanadi. */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    // Umumiy chegara: bir IP dan daqiqasiga 300 so'rov.
    // Kirish uchun qattiqroq chegara AuthController da (`@Throttle`).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    // Fon ishlari (kalitlarni tozalash, takrorlanuvchi xarajatlar, MV yangilash, fayllar GC)
    ScheduleModule.forRoot(),
    // Hisobot keshi global: audit jurnali (har pul amali) uni bekor qiladi
    ReportCacheModule,
    AuditModule,
    IdempotencyModule,
    // Realtime hodisalar global: har domen moduli COMMIT'dan keyin e'lon qiladi
    RealtimeModule,
    // Fon navbati global: BullMQ (Redis) yoki jarayon ichida
    QueueModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    // Spravochniklar (E4)
    SettingsModule,
    WarehousesModule,
    CategoriesModule,
    ProductsModule,
    ClientsModule,
    SuppliersModule,
    EmployeesModule,
    UsersModule,
    // Ombor amallari (E5)
    StockModule,
    // Savdo yadrosi (E6)
    SalesModule,
    QuotesModule,
    // Kassa va moliya (E7)
    CashModule,
    ExpensesModule,
    DebtsModule,
    // Ta'minot va kreditorlik (E8)
    PurchaseOrdersModule,
    // Yetkazib berish va xabarlar (E9)
    DeliveriesModule,
    MessagesModule,
    // Hisobot va analitika (E10)
    ReportsModule,
    // Fayl saqlash (E11) va eksport (T-084)
    FilesModule,
    ExportsModule,
    // localStorage → server migratsiyasi (E14)
    MigrationModule,
    // Tunlik invariant tekshiruvi (T-123)
    InvariantsModule,
    // Obuna: to'lovlar va do'kon hisobi (E16)
    BillingModule,
    AccountModule,
    BackupModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // TARTIB MUHIM: birinchisi — tashqi.
    //  0. maxfiy maydonlar (03 §3.6) — javob va idempotent takror ham rolga qarab tozalanadi;
    //     sotuvchida ulgurji narx do'kon sozlamasiga bog'liq (SettingsService)
    //  1. faqat-o'qish holatidagi do'kon yozuvi — tranzaksiya ochilmasdan rad (T-127)
    //  2. tenant tranzaksiyasi — qolgan hamma narsa uning ICHIDA
    //  3. idempotentlik — takroriy so'rov handler va jurnalga yetmaydi
    //  4. audit — jurnal amal bilan birga saqlanadi yoki birga bekor bo'ladi
    { provide: APP_INTERCEPTOR, useClass: FieldVisibilityInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ReadOnlyTenantInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*splat')
  }
}
