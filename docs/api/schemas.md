# Sxemalar (DTO) ma’lumotnomasi

> **Generatsiya qilingan** — manba: `apps/api/openapi.json`. Endpointlar — [endpoints.md](endpoints.md), qoidalar — [README.md](README.md). TypeScript tiplari shu fayldan `openapi-typescript` bilan olinadi (README → Tiplar).

**Ustunlar:** so‘rov DTO’sida «Majburiy» ✔ — yuborilishi shart; javob DTO’sida «Doim bor» ✔ — har doim keladi. Javobda ✔ bo‘lmagan maydon — rolga qarab yashirilishi mumkin (masalan `cost`, `wholesalePrice`, `stockValue` sotuvchiga chiqmaydi) yoki ixtiyoriy. `| null` — qiymat `null` bo‘lishi mumkin (maydon baribir keladi).

**Birliklar:** barcha pul maydonlari — butun so‘m (`number`, tiyinsiz); miqdorlar — 3 kasr xonagacha; `date-time` — ISO 8601 (UTC, `Z`); sana (`YYYY-MM-DD`) — Toshkent kuni.

## Mundarija

[AbcRowDto](#abcrowdto) · [AdjustDto](#adjustdto) · [AdjustedLineDto](#adjustedlinedto) · [AdjustItemDto](#adjustitemdto) · [AdjustResultDto](#adjustresultdto) · [AnalyticsDto](#analyticsdto) · [ApiErrorDto](#apierrordto) · [ArchivedWarehouseDto](#archivedwarehousedto) · [AudiencePreviewDto](#audiencepreviewdto) · [AuditEntryDto](#auditentrydto) · [AuditPageDto](#auditpagedto) · [AuditUserDto](#audituserdto) · [AuthUserDto](#authuserdto) · [BackupDto](#backupdto) · [BulkPriceDto](#bulkpricedto) · [BulkPriceResultDto](#bulkpriceresultdto) · [CashMovementDto](#cashmovementdto) · [CashMovementInputDto](#cashmovementinputdto) · [CashMovementPageDto](#cashmovementpagedto) · [CategoryAmountDto](#categoryamountdto) · [CategoryDto](#categorydto) · [CategoryRevenueDto](#categoryrevenuedto) · [CategoryValueDto](#categoryvaluedto) · [ChangePasswordDto](#changepassworddto) · [CheckoutDto](#checkoutdto) · [ClickRequestDto](#clickrequestdto) · [ClientDto](#clientdto) · [ClientStatsDto](#clientstatsdto) · [CloseShiftDto](#closeshiftdto) · [ConvertQuoteDto](#convertquotedto) · [CreateCategoryDto](#createcategorydto) · [CreateClientDto](#createclientdto) · [CreateDeliveryDto](#createdeliverydto) · [CreateEmployeeDto](#createemployeedto) · [CreateExpenseDto](#createexpensedto) · [CreateExpenseTemplateDto](#createexpensetemplatedto) · [CreateInvoiceDto](#createinvoicedto) · [CreateProductDto](#createproductdto) · [CreatePurchaseOrderDto](#createpurchaseorderdto) · [CreateQuoteDto](#createquotedto) · [CreateSaleDto](#createsaledto) · [CreateSupplierDto](#createsupplierdto) · [CreateUserDto](#createuserdto) · [CreateWarehouseDto](#createwarehousedto) · [CurrentShiftDto](#currentshiftdto) · [CustomerDebtDto](#customerdebtdto) · [DashboardDto](#dashboarddto) · [DayTotalsDto](#daytotalsdto) · [DeadStockDto](#deadstockdto) · [DeadStockItemDto](#deadstockitemdto) · [DebtPageDto](#debtpagedto) · [DebtPartyDto](#debtpartydto) · [DebtPaymentDto](#debtpaymentdto) · [DebtPaymentInputDto](#debtpaymentinputdto) · [DebtPaymentPageDto](#debtpaymentpagedto) · [DebtPaymentResultDto](#debtpaymentresultdto) · [DebtReceiptDto](#debtreceiptdto) · [DebtSaleStateDto](#debtsalestatedto) · [DebtSummaryDto](#debtsummarydto) · [DeleteTenantDto](#deletetenantdto) · [DeliveryDto](#deliverydto) · [DeliveryInputDto](#deliveryinputdto) · [DeliveryPageDto](#deliverypagedto) · [DeliveryPartyDto](#deliverypartydto) · [DeliveryStatusDto](#deliverystatusdto) · [DeliverySummaryDto](#deliverysummarydto) · [DriverLoadDto](#driverloaddto) · [EmployeeDto](#employeedto) · [ExpenseCategoryTotalDto](#expensecategorytotaldto) · [ExpenseDto](#expensedto) · [ExpensePageDto](#expensepagedto) · [ExpenseSummaryDto](#expensesummarydto) · [ExpenseTemplateDto](#expensetemplatedto) · [ExportJobDto](#exportjobdto) · [FieldErrorDto](#fielderrordto) · [FileDto](#filedto) · [FileUrlsDto](#fileurlsdto) · [ImportProductsDto](#importproductsdto) · [ImportResultDto](#importresultdto) · [ImportRowErrorDto](#importrowerrordto) · [IntakeDto](#intakedto) · [InvoiceDto](#invoicedto) · [LoginDto](#logindto) · [LoginResponseDto](#loginresponsedto) · [LowStockItemDto](#lowstockitemdto) · [MessageAudienceDto](#messageaudiencedto) · [MessageDto](#messagedto) · [MessagePageDto](#messagepagedto) · [MessageStatsDto](#messagestatsdto) · [MigrationDto](#migrationdto) · [MigrationIssueDto](#migrationissuedto) · [MigrationReportDto](#migrationreportdto) · [MigrationResultDto](#migrationresultdto) · [MigrationUserDto](#migrationuserdto) · [MovementDto](#movementdto) · [MovementPageDto](#movementpagedto) · [NamedValueDto](#namedvaluedto) · [OpenShiftDto](#openshiftdto) · [PaidDto](#paiddto) · [PartyRefDto](#partyrefdto) · [PaymentMixDto](#paymentmixdto) · [PaymeRequestDto](#paymerequestdto) · [PayPurchaseOrderDto](#paypurchaseorderdto) · [PeriodDto](#perioddto) · [PlanLimitsDto](#planlimitsdto) · [PlanUsageDto](#planusagedto) · [PnlChangeDto](#pnlchangedto) · [PnlDto](#pnldto) · [PnlTotalsDto](#pnltotalsdto) · [PoItemDto](#poitemdto) · [PoItemInputDto](#poiteminputdto) · [PoPaymentResultDto](#popaymentresultdto) · [PoSupplierRefDto](#posupplierrefdto) · [PresignDto](#presigndto) · [PresignResultDto](#presignresultdto) · [ProductDto](#productdto) · [ProductImportRowDto](#productimportrowdto) · [ProductSalesDto](#productsalesdto) · [ProductStatsDto](#productstatsdto) · [ProductStockDto](#productstockdto) · [ProductSummaryDto](#productsummarydto) · [PurchaseOrderDto](#purchaseorderdto) · [PurchaseOrderPageDto](#purchaseorderpagedto) · [PurchaseOrderSummaryDto](#purchaseordersummarydto) · [QuoteDto](#quotedto) · [QuoteItemDto](#quoteitemdto) · [QuotePageDto](#quotepagedto) · [QuotePartyDto](#quotepartydto) · [QuoteSummaryDto](#quotesummarydto) · [ReceiptDto](#receiptdto) · [ReceiptFiscalDto](#receiptfiscaldto) · [ReceiptStoreDto](#receiptstoredto) · [ReceiveItemDto](#receiveitemdto) · [ReceivePurchaseOrderDto](#receivepurchaseorderdto) · [RecentSaleDto](#recentsaledto) · [RegisterDto](#registerdto) · [ReorderGroupDto](#reordergroupdto) · [ReorderItemDto](#reorderitemdto) · [ReturnItemInputDto](#returniteminputdto) · [ReturnSaleDto](#returnsaledto) · [RouteSheetDto](#routesheetdto) · [RouteStopDto](#routestopdto) · [RunDueResultDto](#rundueresultdto) · [SaleDeliveryRefDto](#saledeliveryrefdto) · [SaleDto](#saledto) · [SaleItemDto](#saleitemdto) · [SaleItemInputDto](#saleiteminputdto) · [SaleListItemDto](#salelistitemdto) · [SalePageDto](#salepagedto) · [SalePaidDto](#salepaiddto) · [SellerSalesDto](#sellersalesdto) · [SendMessageDto](#sendmessagedto) · [SettingsDto](#settingsdto) · [ShiftDto](#shiftdto) · [ShiftPageDto](#shiftpagedto) · [ShiftReportDto](#shiftreportdto) · [ShiftReturnsDto](#shiftreturnsdto) · [ShiftSalesDto](#shiftsalesdto) · [StockOperationResultDto](#stockoperationresultdto) · [StockWarningDto](#stockwarningdto) · [SupplierCardDto](#suppliercarddto) · [SupplierDto](#supplierdto) · [SupplierListItemDto](#supplierlistitemdto) · [SupplierOrderSummaryDto](#supplierordersummarydto) · [SupplierPaymentDto](#supplierpaymentdto) · [SupplierPaymentSummaryDto](#supplierpaymentsummarydto) · [SupplierRefDto](#supplierrefdto) · [SupplierSummaryDto](#suppliersummarydto) · [TemporaryPasswordDto](#temporarypassworddto) · [TenantAccountDto](#tenantaccountdto) · [TenantSummaryDto](#tenantsummarydto) · [TransferDto](#transferdto) · [TransferResultDto](#transferresultdto) · [TrendPointDto](#trendpointdto) · [UpdateCategoryDto](#updatecategorydto) · [UpdateClientDto](#updateclientdto) · [UpdateDeliveryDto](#updatedeliverydto) · [UpdateEmployeeDto](#updateemployeedto) · [UpdateExpenseDto](#updateexpensedto) · [UpdateExpenseTemplateDto](#updateexpensetemplatedto) · [UpdateProductDto](#updateproductdto) · [UpdatePurchaseOrderDto](#updatepurchaseorderdto) · [UpdateQuoteDto](#updatequotedto) · [UpdateSettingsDto](#updatesettingsdto) · [UpdateSupplierDto](#updatesupplierdto) · [UpdateUserDto](#updateuserdto) · [UpdateWarehouseDto](#updatewarehousedto) · [UploadTargetDto](#uploadtargetdto) · [UsageDto](#usagedto) · [UserDto](#userdto) · [WarehouseDto](#warehousedto) · [WarehouseStockDto](#warehousestockdto) · [WriteoffDto](#writeoffdto)

### AbcRowDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `productId` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `revenue` | `number` | ✔ |  |
| `share` | `number` | ✔ | Ulush, % |
| `cumulative` | `number` | ✔ | Yig‘ma ulush, % |
| `class` | `A` \| `B` \| `C` | ✔ | A ≤ 80%, B ≤ 95%, C — qolgani |

[↑ Mundarija](#mundarija)

### AdjustDto

Ishlatiladi: [`POST /stock/adjust`](endpoints.md#post-stock-adjust) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `items` | [`AdjustItemDto`](#adjustitemdto)[] | ✔ | ko‘pi bilan `500` |
| `warehouseId` | `string` (uuid) |  | Berilmasa — joriy ombor |
| `note` | `string` |  | maks. uzunlik `500`, misol `Oylik inventarizatsiya` |

[↑ Mundarija](#mundarija)

### AdjustedLineDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `productId` | `string` | ✔ |  |
| `movementId` | `string` | ✔ |  |
| `delta` | `number` | ✔ | Farq: sanalgan − hisobdagi — misol `-2` |
| `balanceAfter` | `number` | ✔ | misol `118` |

[↑ Mundarija](#mundarija)

### AdjustItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `productId` | `string` (uuid) | ✔ |  |
| `countedQty` | `number` | ✔ | SANALGAN miqdor (asosiy birlikda) — misol `118` |

[↑ Mundarija](#mundarija)

### AdjustResultDto

Ishlatiladi: [`POST /stock/adjust`](endpoints.md#post-stock-adjust) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `adjusted` | [`AdjustedLineDto`](#adjustedlinedto)[] | ✔ |  |
| `unchanged` | `number` | ✔ | Farqi 0 bo‘lgan qatorlar — harakat yozilmadi — misol `3` |

[↑ Mundarija](#mundarija)

### AnalyticsDto

Ishlatiladi: [`GET /analytics`](endpoints.md#get-analytics) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `period` | [`PeriodDto`](#perioddto) | ✔ |  |
| `totalRevenue` | `number` | ✔ |  |
| `trend` | [`TrendPointDto`](#trendpointdto)[] | ✔ | Kunlik tushum (sotuvlar) |
| `categories` | [`CategoryRevenueDto`](#categoryrevenuedto)[] | ✔ |  |
| `payments` | [`PaymentMixDto`](#paymentmixdto) | ✔ |  |
| `abc` | [`AbcRowDto`](#abcrowdto)[] | ✔ |  |

[↑ Mundarija](#mundarija)

### ApiErrorDto

Ishlatiladi: [`POST /auth/login`](endpoints.md#post-auth-login) (javob 401), [`POST /auth/login`](endpoints.md#post-auth-login) (javob 409), [`POST /auth/refresh`](endpoints.md#post-auth-refresh) (javob 401), [`POST /auth/change-password`](endpoints.md#post-auth-change-password) (javob 401), [`POST /tenants/register`](endpoints.md#post-tenants-register) (javob 400), [`PATCH /settings`](endpoints.md#patch-settings) (javob 400), [`PATCH /settings`](endpoints.md#patch-settings) (javob 403), [`POST /warehouses`](endpoints.md#post-warehouses) (javob 402), [`POST /warehouses`](endpoints.md#post-warehouses) (javob 409), [`GET /warehouses/:id`](endpoints.md#get-warehouses-id) (javob 404), [`PATCH /warehouses/:id`](endpoints.md#patch-warehouses-id) (javob 404), [`PATCH /warehouses/:id`](endpoints.md#patch-warehouses-id) (javob 409), [`POST /warehouses/:id/archive`](endpoints.md#post-warehouses-id-archive) (javob 404), [`POST /warehouses/:id/archive`](endpoints.md#post-warehouses-id-archive) (javob 422), [`POST /warehouses/:id/restore`](endpoints.md#post-warehouses-id-restore) (javob 402), [`POST /warehouses/:id/restore`](endpoints.md#post-warehouses-id-restore) (javob 404), [`POST /categories`](endpoints.md#post-categories) (javob 409), [`GET /categories/:id`](endpoints.md#get-categories-id) (javob 404), [`PATCH /categories/:id`](endpoints.md#patch-categories-id) (javob 404), [`PATCH /categories/:id`](endpoints.md#patch-categories-id) (javob 409), [`DELETE /categories/:id`](endpoints.md#delete-categories-id) (javob 404), [`DELETE /categories/:id`](endpoints.md#delete-categories-id) (javob 409), [`POST /categories/:id/restore`](endpoints.md#post-categories-id-restore) (javob 404), [`POST /products`](endpoints.md#post-products) (javob 409), [`POST /products`](endpoints.md#post-products) (javob 422), [`GET /products/:id/stats`](endpoints.md#get-products-id-stats) (javob 404), [`GET /products/:id`](endpoints.md#get-products-id) (javob 404), [`PATCH /products/:id`](endpoints.md#patch-products-id) (javob 404), [`PATCH /products/:id`](endpoints.md#patch-products-id) (javob 409), [`PATCH /products/:id`](endpoints.md#patch-products-id) (javob 422), [`DELETE /products/:id`](endpoints.md#delete-products-id) (javob 404), [`POST /products/import`](endpoints.md#post-products-import) (javob 400), [`POST /products/bulk-price`](endpoints.md#post-products-bulk-price) (javob 400), [`POST /products/:id/restore`](endpoints.md#post-products-id-restore) (javob 404), [`POST /products/:id/restore`](endpoints.md#post-products-id-restore) (javob 409), [`GET /clients/:id/stats`](endpoints.md#get-clients-id-stats) (javob 404), [`GET /clients/:id`](endpoints.md#get-clients-id) (javob 404), [`PATCH /clients/:id`](endpoints.md#patch-clients-id) (javob 404), [`DELETE /clients/:id`](endpoints.md#delete-clients-id) (javob 404), [`DELETE /clients/:id`](endpoints.md#delete-clients-id) (javob 409), [`POST /clients/:id/restore`](endpoints.md#post-clients-id-restore) (javob 404), [`POST /suppliers`](endpoints.md#post-suppliers) (javob 400), [`GET /suppliers/:id`](endpoints.md#get-suppliers-id) (javob 404), [`PATCH /suppliers/:id`](endpoints.md#patch-suppliers-id) (javob 404), [`DELETE /suppliers/:id`](endpoints.md#delete-suppliers-id) (javob 404), [`DELETE /suppliers/:id`](endpoints.md#delete-suppliers-id) (javob 409), [`POST /suppliers/:id/restore`](endpoints.md#post-suppliers-id-restore) (javob 404), [`GET /employees/:id`](endpoints.md#get-employees-id) (javob 404), [`PATCH /employees/:id`](endpoints.md#patch-employees-id) (javob 404), [`PATCH /employees/:id`](endpoints.md#patch-employees-id) (javob 422), [`DELETE /employees/:id`](endpoints.md#delete-employees-id) (javob 404), [`DELETE /employees/:id`](endpoints.md#delete-employees-id) (javob 409), [`POST /employees/:id/restore`](endpoints.md#post-employees-id-restore) (javob 404), [`POST /users`](endpoints.md#post-users) (javob 400), [`POST /users`](endpoints.md#post-users) (javob 402), [`POST /users`](endpoints.md#post-users) (javob 409), [`POST /users`](endpoints.md#post-users) (javob 422), [`GET /users/:id`](endpoints.md#get-users-id) (javob 404), [`PATCH /users/:id`](endpoints.md#patch-users-id) (javob 402), [`PATCH /users/:id`](endpoints.md#patch-users-id) (javob 404), [`PATCH /users/:id`](endpoints.md#patch-users-id) (javob 409), [`PATCH /users/:id`](endpoints.md#patch-users-id) (javob 422), [`DELETE /users/:id`](endpoints.md#delete-users-id) (javob 404), [`DELETE /users/:id`](endpoints.md#delete-users-id) (javob 422), [`POST /users/:id/restore`](endpoints.md#post-users-id-restore) (javob 402), [`POST /users/:id/restore`](endpoints.md#post-users-id-restore) (javob 404), [`POST /users/:id/restore`](endpoints.md#post-users-id-restore) (javob 422), [`POST /stock/intake`](endpoints.md#post-stock-intake) (javob 409), [`POST /stock/intake`](endpoints.md#post-stock-intake) (javob 422), [`POST /stock/writeoff`](endpoints.md#post-stock-writeoff) (javob 422), [`POST /stock/adjust`](endpoints.md#post-stock-adjust) (javob 400), [`POST /stock/transfer`](endpoints.md#post-stock-transfer) (javob 422), [`POST /sales`](endpoints.md#post-sales) (javob 403), [`POST /sales`](endpoints.md#post-sales) (javob 422), [`POST /sales`](endpoints.md#post-sales) (javob 423), [`GET /sales/:id`](endpoints.md#get-sales-id) (javob 404), [`GET /sales/:id/receipt`](endpoints.md#get-sales-id-receipt) (javob 404), [`GET /sales/:id/receipt`](endpoints.md#get-sales-id-receipt) (javob 404), [`POST /sales/:id/return`](endpoints.md#post-sales-id-return) (javob 409), [`POST /sales/:id/return`](endpoints.md#post-sales-id-return) (javob 422), [`POST /sales/:id/cancel`](endpoints.md#post-sales-id-cancel) (javob 409), [`POST /cash/shifts/open`](endpoints.md#post-cash-shifts-open) (javob 409), [`POST /cash/shifts/close`](endpoints.md#post-cash-shifts-close) (javob 409), [`GET /cash/shifts/:id/report`](endpoints.md#get-cash-shifts-id-report) (javob 404), [`POST /cash/movements`](endpoints.md#post-cash-movements) (javob 423), [`POST /quotes`](endpoints.md#post-quotes) (javob 403), [`POST /quotes`](endpoints.md#post-quotes) (javob 422), [`GET /quotes/:id`](endpoints.md#get-quotes-id) (javob 404), [`PATCH /quotes/:id`](endpoints.md#patch-quotes-id) (javob 403), [`PATCH /quotes/:id`](endpoints.md#patch-quotes-id) (javob 409), [`DELETE /quotes/:id`](endpoints.md#delete-quotes-id) (javob 409), [`POST /quotes/:id/restore`](endpoints.md#post-quotes-id-restore) (javob 404), [`POST /quotes/:id/convert`](endpoints.md#post-quotes-id-convert) (javob 409), [`POST /quotes/:id/convert`](endpoints.md#post-quotes-id-convert) (javob 422), [`POST /expenses`](endpoints.md#post-expenses) (javob 423), [`GET /expenses/:id`](endpoints.md#get-expenses-id) (javob 404), [`POST /debts/payments`](endpoints.md#post-debts-payments) (javob 422), [`POST /debts/payments`](endpoints.md#post-debts-payments) (javob 423), [`POST /purchase-orders`](endpoints.md#post-purchase-orders) (javob 422), [`GET /purchase-orders/:id`](endpoints.md#get-purchase-orders-id) (javob 404), [`PATCH /purchase-orders/:id`](endpoints.md#patch-purchase-orders-id) (javob 409), [`POST /purchase-orders/:id/cancel`](endpoints.md#post-purchase-orders-id-cancel) (javob 409), [`POST /purchase-orders/:id/restore`](endpoints.md#post-purchase-orders-id-restore) (javob 404), [`POST /purchase-orders/:id/receive`](endpoints.md#post-purchase-orders-id-receive) (javob 409), [`POST /purchase-orders/:id/receive`](endpoints.md#post-purchase-orders-id-receive) (javob 422), [`POST /purchase-orders/:id/pay`](endpoints.md#post-purchase-orders-id-pay) (javob 422), [`POST /purchase-orders/:id/pay`](endpoints.md#post-purchase-orders-id-pay) (javob 423), [`GET /deliveries/:id`](endpoints.md#get-deliveries-id) (javob 404), [`POST /deliveries/:id/status`](endpoints.md#post-deliveries-id-status) (javob 403), [`POST /deliveries/:id/status`](endpoints.md#post-deliveries-id-status) (javob 422), [`POST /deliveries/:id/restore`](endpoints.md#post-deliveries-id-restore) (javob 404), [`POST /messages`](endpoints.md#post-messages) (javob 429), [`POST /files/presign`](endpoints.md#post-files-presign) (javob 413), [`POST /files/presign`](endpoints.md#post-files-presign) (javob 422), [`POST /files/:id/confirm`](endpoints.md#post-files-id-confirm) (javob 404), [`POST /files/:id/confirm`](endpoints.md#post-files-id-confirm) (javob 409), [`POST /files/:id/confirm`](endpoints.md#post-files-id-confirm) (javob 413), [`POST /files/:id/confirm`](endpoints.md#post-files-id-confirm) (javob 422), [`GET /files/:id`](endpoints.md#get-files-id) (javob 404), [`DELETE /files/:id`](endpoints.md#delete-files-id) (javob 404), [`GET /files/:id/raw`](endpoints.md#get-files-id-raw) (javob 404), [`GET /exports/jobs/:id`](endpoints.md#get-exports-jobs-id) (javob 404), [`GET /exports/jobs/:id/download`](endpoints.md#get-exports-jobs-id-download) (javob 404), [`POST /migration/validate`](endpoints.md#post-migration-validate) (javob 403), [`POST /migration/import`](endpoints.md#post-migration-import) (javob 402), [`POST /migration/import`](endpoints.md#post-migration-import) (javob 403), [`POST /tenants/current/delete`](endpoints.md#post-tenants-current-delete) (javob 401), [`GET /backup/export`](endpoints.md#get-backup-export) (javob 403), [`GET /backup/export`](endpoints.md#get-backup-export) (javob 413)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `type` | `string` | ✔ | misol `https://api.example.uz/errors/stock-insufficient` |
| `title` | `string` | ✔ | misol `Omborda yetarli tovar yo‘q` |
| `status` | `number` | ✔ | misol `422` |
| `code` | `string` | ✔ | misol `STOCK_INSUFFICIENT` |
| `detail` | `string` |  | misol `Sement M400: kerak 20, mavjud 12` |
| `instance` | `string` | ✔ | misol `/api/v1/sales` |
| `traceId` | `string` | ✔ | misol `01J9F3K8QW2M4X7Y` |
| `errors` | [`FieldErrorDto`](#fielderrordto)[] |  |  |
| `current` | `object` |  | `VERSION_CONFLICT` da — serverdagi joriy yozuv |

[↑ Mundarija](#mundarija)

### ArchivedWarehouseDto

Ishlatiladi: [`POST /warehouses/:id/archive`](endpoints.md#post-warehouses-id-archive) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Asosiy ombor` |
| `address` | `string` \| `null` | ✔ | misol `Toshkent, Chilonzor 5` |
| `isDefault` | `boolean` | ✔ | Sukut ombor — arxivlab bo‘lmaydi |
| `archived` | `boolean` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |
| `stockWarning` | [`StockWarningDto`](#stockwarningdto) \| `null` | ✔ | Arxivlangan omborda tovar qolgan bo‘lsa — ogohlantirish (amal bekor qilinmaydi) |

[↑ Mundarija](#mundarija)

### AudiencePreviewDto

Ishlatiladi: [`POST /messages/preview`](endpoints.md#post-messages-preview) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `recipients` | `number` | ✔ | misol `42` |
| `label` | `string` | ✔ | misol `Qarzdorlar` |

[↑ Mundarija](#mundarija)

### AuditEntryDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |
| `action` | `string` | ✔ | misol `sale.create` |
| `detail` | `string` \| `null` | ✔ |  |
| `entityType` | `string` \| `null` | ✔ | misol `sale` |
| `entityId` | `string` \| `null` | ✔ |  |
| `diff` | `object` \| `null` | ✔ | O‘zgarish (maxfiy maydonlar tozalangan) |
| `user` | [`AuditUserDto`](#audituserdto) \| `null` | ✔ | `null` — tizim (fon ishi) |

[↑ Mundarija](#mundarija)

### AuditPageDto

Ishlatiladi: [`GET /audit`](endpoints.md#get-audit) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`AuditEntryDto`](#auditentrydto)[] | ✔ |  |
| `nextCursor` | `string` \| `null` | ✔ |  |
| `hasMore` | `boolean` | ✔ |  |

[↑ Mundarija](#mundarija)

### AuditUserDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Bobur Toshmatov` |

[↑ Mundarija](#mundarija)

### AuthUserDto

Ishlatiladi: [`GET /auth/me`](endpoints.md#get-auth-me) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Bobur Toshmatov` |
| `email` | `string` | ✔ | misol `admin@crm.uz` |
| `role` | `admin` \| `manager` \| `sotuvchi` \| `omborchi` | ✔ |  |
| `position` | `string` | ✔ | misol `Direktor` |
| `employeeId` | `string` | ✔ |  |
| `tenant` | [`TenantSummaryDto`](#tenantsummarydto) | ✔ |  |

[↑ Mundarija](#mundarija)

### BackupDto

Ishlatiladi: [`GET /backup/export`](endpoints.md#get-backup-export) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `fileId` | `string` (uuid) | ✔ |  |
| `filename` | `string` | ✔ | misol `crm-zaxira-2026-09-24.json.gz` |
| `sizeBytes` | `number` | ✔ | Siqilgan (gzip) hajm, bayt — misol `48213` |
| `url` | `string` | ✔ | Imzolangan havola (`attachment`) — `expiresAt` gacha amal qiladi |
| `expiresAt` | `string` (date-time) | ✔ | Yaratilgandan 1 soat |

[↑ Mundarija](#mundarija)

### BulkPriceDto

Ishlatiladi: [`POST /products/bulk-price`](endpoints.md#post-products-bulk-price) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `ids` | (`string` (uuid))[] | ✔ | ko‘pi bilan `1000` |
| `mode` | `percent` \| `fixed` \| `set` | ✔ | `percent` — foizga (−100…1000), `fixed` — so‘mga (±), `set` — aniq narx |
| `value` | `number` | ✔ | misol `10` |
| `target` | `price` \| `wholesalePrice` | ✔ | Tannarx bu yerda o‘zgarmaydi — u kirimda hisoblanadi (I11) |

[↑ Mundarija](#mundarija)

### BulkPriceResultDto

Ishlatiladi: [`POST /products/bulk-price`](endpoints.md#post-products-bulk-price) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `updated` | `number` | ✔ | Yangilangan mahsulotlar (topilmagan id’lar sanalmaydi) — misol `12` |

[↑ Mundarija](#mundarija)

### CashMovementDto

Ishlatiladi: [`POST /cash/movements`](endpoints.md#post-cash-movements) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `shiftId` | `string` | ✔ |  |
| `direction` | `in` \| `out` | ✔ |  |
| `amount` | `number` | ✔ |  |
| `reason` | `string` | ✔ |  |
| `userId` | `string` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |

[↑ Mundarija](#mundarija)

### CashMovementInputDto

Ishlatiladi: [`POST /cash/movements`](endpoints.md#post-cash-movements) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `direction` | `in` \| `out` | ✔ |  |
| `amount` | `number` | ✔ | misol `500000` |
| `reason` | `string` | ✔ | maks. uzunlik `500`, misol `Egasi oldi` |

[↑ Mundarija](#mundarija)

### CashMovementPageDto

Ishlatiladi: [`GET /cash/movements`](endpoints.md#get-cash-movements) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`CashMovementDto`](#cashmovementdto)[] | ✔ |  |
| `page` | `number` | ✔ |  |
| `pageSize` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `pageCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### CategoryAmountDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` | ✔ |  |
| `amount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### CategoryDto

Ishlatiladi: [`POST /categories`](endpoints.md#post-categories) (javob 201), [`GET /categories/:id`](endpoints.md#get-categories-id) (javob 200), [`PATCH /categories/:id`](endpoints.md#patch-categories-id) (javob 200), [`POST /categories/:id/restore`](endpoints.md#post-categories-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Sement va aralashmalar` |
| `sortOrder` | `number` | ✔ | misol `0` |
| `productCount` | `number` | ✔ | O‘chirilmagan mahsulotlar soni — misol `12` |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |

[↑ Mundarija](#mundarija)

### CategoryRevenueDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `categoryId` | `string` \| `null` | ✔ |  |
| `name` | `string` | ✔ | misol `Sement va aralashmalar` |
| `revenue` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### CategoryValueDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | Kategoriyasizlar — bo‘sh satr — misol `Sement va aralashmalar` |
| `value` | `number` | ✔ | misol `12400000` |

[↑ Mundarija](#mundarija)

### ChangePasswordDto

Ishlatiladi: [`POST /auth/change-password`](endpoints.md#post-auth-change-password) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `currentPassword` | `string` | ✔ |  |
| `newPassword` | `string` | ✔ | Kamida 8 belgi; ommabop parollar rad etiladi |

[↑ Mundarija](#mundarija)

### CheckoutDto

Ishlatiladi: [`POST /billing/invoices`](endpoints.md#post-billing-invoices) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `invoice` | [`InvoiceDto`](#invoicedto) | ✔ |  |
| `payme` | `string` \| `null` | ✔ | Payme to‘lov sahifasi (kassa sozlangan bo‘lsa) |
| `click` | `string` \| `null` | ✔ | Click to‘lov sahifasi |

[↑ Mundarija](#mundarija)

### ClickRequestDto

Ishlatiladi: [`POST /billing/click/prepare`](endpoints.md#post-billing-click-prepare) (so‘rov), [`POST /billing/click/complete`](endpoints.md#post-billing-click-complete) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `click_trans_id` | `string` | ✔ |  |
| `service_id` | `string` | ✔ |  |
| `click_paydoc_id` | `string` |  |  |
| `merchant_trans_id` | `string` | ✔ | Bizdagi hisob-faktura id |
| `merchant_prepare_id` | `string` |  | Faqat complete |
| `amount` | `string` | ✔ | misol `99000.00` |
| `action` | `string` | ✔ | 0 — prepare, 1 — complete — misol `0` |
| `error` | `string` | ✔ | misol `0` |
| `error_note` | `string` |  |  |
| `sign_time` | `string` | ✔ | misol `2026-09-23 12:00:00` |
| `sign_string` | `string` | ✔ |  |

[↑ Mundarija](#mundarija)

### ClientDto

Ishlatiladi: [`POST /clients`](endpoints.md#post-clients) (javob 201), [`GET /clients/:id`](endpoints.md#get-clients-id) (javob 200), [`PATCH /clients/:id`](endpoints.md#patch-clients-id) (javob 200), [`POST /clients/:id/restore`](endpoints.md#post-clients-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Alisher Qodirov` |
| `type` | `individual` \| `company` | ✔ |  |
| `phone` | `string` | ✔ | misol `+998901234567` |
| `email` | `string` | ✔ | misol `` |
| `status` | `lead` \| `active` \| `inactive` | ✔ |  |
| `group` | `retail` \| `wholesale` \| `vip` | ✔ | Narx darajasi |
| `bonusPoints` | `number` | ✔ | Sodiqlik ballari — faqat sotuvda o‘zgaradi (I17) — misol `1200` |
| `creditLimit` | `number` \| `null` | ✔ | Nasiya limiti, so‘m; null — cheklanmagan — misol `30000000` |
| `paymentTermDays` | `number` \| `null` | ✔ | Nasiya to‘lov muddati, kun — misol `21` |
| `source` | `string` | ✔ | misol `Instagram` |
| `company` | `string` \| `null` | ✔ |  |
| `notes` | `string` \| `null` | ✔ |  |
| `salesCount` | `number` | ✔ | Sotuv cheklari soni (qaytarishsiz) — misol `12` |
| `createdAt` | `string` (date-time) | ✔ |  |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |

[↑ Mundarija](#mundarija)

### ClientStatsDto

Ishlatiladi: [`GET /clients/:id/stats`](endpoints.md#get-clients-id-stats) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `totalSpent` | `number` | ✔ | Sof xarid: sotuvlar − qaytarishlar (bekor qilinganlarsiz) — misol `12500000` |
| `debt` | `number` | ✔ | To‘lanmagan nasiya (I13) — misol `350000` |
| `overdue` | `number` | ✔ | Shundan muddati o‘tgani — misol `0` |
| `lastPurchase` | `string` (date) \| `null` | ✔ | Oxirgi xarid kuni |

[↑ Mundarija](#mundarija)

### CloseShiftDto

Ishlatiladi: [`POST /cash/shifts/close`](endpoints.md#post-cash-shifts-close) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `countedBalance` | `number` | ✔ | Yopishda sanalgan naqd — misol `1450000` |
| `note` | `string` |  | maks. uzunlik `500`, misol `5000 kam chiqdi` |
| `denominations` | `Record<string, integer>` |  | Kupyura → soni. Berilsa, yig‘indisi `countedBalance` ga teng bo‘lishi shart |

[↑ Mundarija](#mundarija)

### ConvertQuoteDto

Ishlatiladi: [`POST /quotes/:id/convert`](endpoints.md#post-quotes-id-convert) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `method` | `cash` \| `card` \| `transfer` \| `debt` | ✔ | To‘lov usuli chaqiruvchidan (I20) — `debt`: nasiya |
| `warehouseId` | `string` (uuid) |  | Chiqim ombori (kassada tanlangani); berilmasa — joriy ombor |

[↑ Mundarija](#mundarija)

### CreateCategoryDto

Ishlatiladi: [`POST /categories`](endpoints.md#post-categories) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `60`, misol `Tom yopish materiallari` |
| `sortOrder` | `number` |  | Berilmasa — ro‘yxat oxiriga qo‘shiladi — min `0` |

[↑ Mundarija](#mundarija)

### CreateClientDto

Ishlatiladi: [`POST /clients`](endpoints.md#post-clients) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `200`, misol `Alisher Qodirov` |
| `phone` | `string` | ✔ | Saqlashda raqamlar va boshidagi `+` qoladi — misol `+998 90 123-45-67` |
| `type` | `individual` \| `company` |  | sukut `"individual"` |
| `email` | `string` |  | misol `ali@mail.uz` |
| `status` | `lead` \| `active` \| `inactive` |  | sukut `"lead"` |
| `group` | `retail` \| `wholesale` \| `vip` |  | sukut `"retail"` |
| `creditLimit` | `number` \| `null` |  | Nasiya limiti, butun so‘m; null yoki 0 — cheklanmagan |
| `paymentTermDays` | `number` \| `null` |  | min `0`, max `365` |
| `source` | `string` |  | maks. uzunlik `100`, misol `Instagram` |
| `company` | `string` \| `null` |  | maks. uzunlik `200` |
| `notes` | `string` \| `null` |  | maks. uzunlik `1000` |

[↑ Mundarija](#mundarija)

### CreateDeliveryDto

Ishlatiladi: [`POST /deliveries`](endpoints.md#post-deliveries) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `saleId` | `string` (uuid) |  | Chekka bog‘langan yetkazish — narx chekdan (D3) |
| `customerId` | `string` (uuid) |  |  |
| `address` | `string` | ✔ | misol `Toshkent, Chilonzor 7` |
| `phone` | `string` | ✔ | misol `+998901234567` |
| `scheduledDate` | `string` | ✔ | misol `2026-09-24` |
| `driverId` | `string` (uuid) |  | Haydovchi — xodim |
| `fee` | `number` |  | Faqat chekSIZ (alohida xizmat) yetkazishda — misol `20000` |
| `note` | `string` |  | maks. uzunlik `500` |
| `lat` | `number` |  | misol `41.31` |
| `lng` | `number` |  | misol `69.24` |

[↑ Mundarija](#mundarija)

### CreateEmployeeDto

Ishlatiladi: [`POST /employees`](endpoints.md#post-employees) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `200`, misol `Bobur Toshmatov` |
| `position` | `string` | ✔ | maks. uzunlik `100`, misol `Kassir` |
| `phone` | `string` | ✔ | misol `+998 90 123 45 67` |
| `status` | `active` \| `on_leave` \| `fired` |  | sukut `"active"` |
| `salary` | `number` |  | Butun so‘m — misol `4500000` |
| `hiredAt` | `string` | ✔ | misol `2026-01-15` |

[↑ Mundarija](#mundarija)

### CreateExpenseDto

Ishlatiladi: [`POST /expenses`](endpoints.md#post-expenses) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` | ✔ |  |
| `amount` | `number` | ✔ | misol `500000` |
| `method` | `cash` \| `bank` | ✔ | `cash` — kassadan chiqadi (ochiq smena shart, I8) |
| `date` | `string` |  | Berilmasa — bugun — misol `2026-09-23` |
| `note` | `string` |  | maks. uzunlik `500` |

[↑ Mundarija](#mundarija)

### CreateExpenseTemplateDto

Ishlatiladi: [`POST /expense-templates`](endpoints.md#post-expense-templates) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | misol `Do‘kon ijarasi` |
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` | ✔ |  |
| `amount` | `number` | ✔ | misol `5000000` |
| `method` | `cash` \| `bank` | ✔ |  |
| `period` | `monthly` \| `weekly` | ✔ |  |
| `dayOfPeriod` | `number` | ✔ | Oylik: 1–28, haftalik: 1–7 (dushanba = 1) — misol `1` |
| `active` | `boolean` |  | sukut `true` |
| `note` | `string` |  | maks. uzunlik `500` |

[↑ Mundarija](#mundarija)

### CreateInvoiceDto

Ishlatiladi: [`POST /billing/invoices`](endpoints.md#post-billing-invoices) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `plan` | `basic` \| `pro` | ✔ |  |
| `months` | `number` | ✔ | min `1`, max `12`, misol `1` |

[↑ Mundarija](#mundarija)

### CreateProductDto

Ishlatiladi: [`POST /products`](endpoints.md#post-products) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `200`, misol `Portland sement M400` |
| `sku` | `string` | ✔ | Do‘kon ichida noyob — maks. uzunlik `64`, misol `SEM-400` |
| `barcode` | `string` \| `null` |  | maks. uzunlik `64`, misol `4780000000011` |
| `categoryId` | `string` (uuid) \| `null` |  |  |
| `supplierId` | `string` (uuid) \| `null` |  |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ |  |
| `price` | `number` | ✔ | Butun so‘m — misol `60000` |
| `wholesalePrice` | `number` | ✔ | Butun so‘m — misol `55000` |
| `cost` | `number` | ✔ | Butun so‘m — misol `40000` |
| `minStock` | `number` |  | 3 kasr xonagacha — misol `20` |
| `archived` | `boolean` |  |  |
| `altUnit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` \| `null` |  | `altFactor` bilan birga beriladi |
| `altFactor` | `number` \| `null` |  | `altUnit` bilan birga beriladi — misol `50` |
| `imageFileId` | `string` (uuid) \| `null` |  | Tasdiqlangan (`ready`) `product_image` fayli; `null` — rasmni olib tashlash |

[↑ Mundarija](#mundarija)

### CreatePurchaseOrderDto

Ishlatiladi: [`POST /purchase-orders`](endpoints.md#post-purchase-orders) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `supplierId` | `string` (uuid) | ✔ |  |
| `warehouseId` | `string` (uuid) |  | Qabul ombori; berilmasa — qabul paytidagi joriy ombor |
| `items` | [`PoItemInputDto`](#poiteminputdto)[] | ✔ | ko‘pi bilan `500` |
| `date` | `string` |  | Berilmasa — bugun — misol `2026-09-23` |
| `dueDate` | `string` |  | Berilmasa — ta’minotchi to‘lov muddatidan — misol `2026-10-23` |
| `note` | `string` |  | maks. uzunlik `1000` |

[↑ Mundarija](#mundarija)

### CreateQuoteDto

Ishlatiladi: [`POST /quotes`](endpoints.md#post-quotes) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `customerId` | `string` (uuid) |  |  |
| `sellerId` | `string` (uuid) |  | Berilmasa — joriy foydalanuvchining xodimi |
| `priceTier` | `retail` \| `wholesale` |  | Berilmasa — mijoz guruhidan. `wholesale` — `wholesaleEnabled` bo‘lsa; sotuvchiga — `sellerWholesaleEnabled` bilan (aks holda so‘ralgani 403, mijoz guruhidan kelgani — chakana) |
| `items` | [`SaleItemInputDto`](#saleiteminputdto)[] | ✔ | ko‘pi bilan `200` |
| `discount` | `number` |  | misol `50000` |
| `validUntil` | `string` |  | Amal muddati — misol `2026-10-01` |
| `note` | `string` |  | maks. uzunlik `1000` |

[↑ Mundarija](#mundarija)

### CreateSaleDto

Ishlatiladi: [`POST /sales`](endpoints.md#post-sales) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `type` | `sale` |  | Faqat `sale`; qaytarish — `POST /sales/:id/return` |
| `customerId` | `string` (uuid) |  | Nasiyada MAJBURIY (I15) |
| `sellerId` | `string` (uuid) |  | Berilmasa — joriy foydalanuvchining xodimi |
| `warehouseId` | `string` (uuid) |  | Berilmasa — joriy ombor |
| `priceTier` | `retail` \| `wholesale` |  | `wholesale` — `wholesaleEnabled` bo‘lsa (aks holda chakana). Sotuvchiga — `sellerWholesaleEnabled` bilan, aks holda 403 — sukut `"retail"` |
| `items` | [`SaleItemInputDto`](#saleiteminputdto)[] | ✔ | ko‘pi bilan `200` |
| `discount` | `number` |  | Umumiy chegirma, so‘m (`maxDiscountPct` gacha) — misol `20000` |
| `bonusUsed` | `number` |  | Ishlatiladigan bonus ball (mavjudigacha) — misol `5000` |
| `roundTo` | `0` \| `500` \| `1000` |  | sukut `0` |
| `delivery` | [`DeliveryInputDto`](#deliveryinputdto) |  |  |
| `paid` | [`PaidDto`](#paiddto) | ✔ |  |
| `date` | `string` |  | Berilmasa — bugun; kelajak sana rad etiladi — misol `2026-09-23` |
| `total` | `number` |  | Mijoz ko‘rsatgan jami — faqat SOLISHTIRILADI; farq bo‘lsa 422 TOTAL_MISMATCH (yozilmaydi) — misol `188600` |

[↑ Mundarija](#mundarija)

### CreateSupplierDto

Ishlatiladi: [`POST /suppliers`](endpoints.md#post-suppliers) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `200`, misol `Bekabad Sement` |
| `phone` | `string` | ✔ | misol `+998 71 200 10 10` |
| `contactPerson` | `string` \| `null` |  | maks. uzunlik `200` |
| `address` | `string` \| `null` |  | maks. uzunlik `300` |
| `notes` | `string` \| `null` |  | maks. uzunlik `1000` |
| `email` | `string` \| `null` |  | misol `savdo@bekabad.uz` |
| `tin` | `string` \| `null` |  | STIR — aniq 9 raqam — misol `201234567` |
| `paymentTermDays` | `number` \| `null` |  | min `0`, max `365` |

[↑ Mundarija](#mundarija)

### CreateUserDto

Ishlatiladi: [`POST /users`](endpoints.md#post-users) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `employeeId` | `string` | ✔ | Mavjud xodim — kirish hisobi DOIM xodimga tegishli (D1) |
| `email` | `string` | ✔ | misol `kassir@crm.uz` |
| `password` | `string` | ✔ | Kamida 8 belgi; ommabop parollar rad etiladi |
| `role` | `admin` \| `manager` \| `sotuvchi` \| `omborchi` | ✔ |  |

[↑ Mundarija](#mundarija)

### CreateWarehouseDto

Ishlatiladi: [`POST /warehouses`](endpoints.md#post-warehouses) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `100`, misol `Sklad №2` |
| `address` | `string` \| `null` |  | maks. uzunlik `200`, misol `Toshkent, Sergeli 12` |

[↑ Mundarija](#mundarija)

### CurrentShiftDto

Ishlatiladi: [`GET /cash/shifts/current`](endpoints.md#get-cash-shifts-current) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `shift` | [`ShiftDto`](#shiftdto) \| `null` | ✔ | Ochiq smena yoki null |
| `cashBalance` | `number` | ✔ | Kassa yashigidagi hisobiy naqd — misol `1455000` |

[↑ Mundarija](#mundarija)

### CustomerDebtDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `customer` | [`DebtPartyDto`](#debtpartydto) | ✔ |  |
| `debt` | `number` | ✔ | misol `1250000` |
| `receipts` | `number` | ✔ | Qarzi bor cheklar soni — misol `3` |
| `oldestDate` | `string` | ✔ | misol `2026-07-01` |
| `oldestDue` | `string` \| `null` | ✔ |  |
| `overdue` | `boolean` | ✔ | Muddati o‘tgan qarzi bor |
| `creditLimit` | `number` \| `null` | ✔ | Nasiya limiti (null — cheklanmagan) |

[↑ Mundarija](#mundarija)

### DashboardDto

Ishlatiladi: [`GET /dashboard`](endpoints.md#get-dashboard) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `today` | [`DayTotalsDto`](#daytotalsdto) | ✔ |  |
| `yesterday` | [`DayTotalsDto`](#daytotalsdto) | ✔ |  |
| `receivables` | `number` | ✔ | Mijozlar qarzi (debitorlik) |
| `debtors` | `number` | ✔ |  |
| `payables` | `number` |  | Ta’minotchilarga qarz (kreditorlik, I18). Sotuvchi rolida yo‘q |
| `payableOrders` | `number` | ✔ |  |
| `lowStockCount` | `number` | ✔ |  |
| `lowStock` | [`LowStockItemDto`](#lowstockitemdto)[] | ✔ |  |
| `trend` | [`TrendPointDto`](#trendpointdto)[] | ✔ |  |
| `topProducts` | [`NamedValueDto`](#namedvaluedto)[] | ✔ | Davrdagi top mahsulot (tushum) |
| `topDebtors` | [`NamedValueDto`](#namedvaluedto)[] | ✔ |  |
| `recentSales` | [`RecentSaleDto`](#recentsaledto)[] | ✔ |  |

[↑ Mundarija](#mundarija)

### DayTotalsDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `revenue` | `number` | ✔ | Tushum: sotuv − qaytarish (I4) |
| `profit` | `number` |  | Yalpi foyda. Sotuvchi rolida yo‘q |
| `expenses` | `number` | ✔ |  |
| `salesCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### DeadStockDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `stockValue` | `number` |  | Faol tovarlar ombor qiymati (tannarxda). Sotuvchi rolida yo‘q |
| `deadValue` | `number` |  | Davrda sotilmagan, qoldig‘i bor tovarlar qiymati. Sotuvchi rolida yo‘q |
| `items` | [`DeadStockItemDto`](#deadstockitemdto)[] | ✔ |  |

[↑ Mundarija](#mundarija)

### DeadStockItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `productId` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ |  |
| `stock` | `number` | ✔ |  |
| `stockValue` | `number` |  | Qoldiq × tannarx. Sotuvchi rolida yo‘q (undan tannarx tiklanadi) |

[↑ Mundarija](#mundarija)

### DebtPageDto

Ishlatiladi: [`GET /debts`](endpoints.md#get-debts) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | ([`CustomerDebtDto`](#customerdebtdto) \| [`DebtReceiptDto`](#debtreceiptdto))[] | ✔ | `view` ga qarab: `customers` — CustomerDebtDto[], `receipts` — DebtReceiptDto[] |
| `page` | `number` | ✔ |  |
| `pageSize` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `pageCount` | `number` | ✔ |  |
| `summary` | [`DebtSummaryDto`](#debtsummarydto) | ✔ |  |

[↑ Mundarija](#mundarija)

### DebtPartyDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `phone` | `string` | ✔ |  |

[↑ Mundarija](#mundarija)

### DebtPaymentDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `saleId` | `string` | ✔ |  |
| `customerId` | `string` \| `null` | ✔ |  |
| `amount` | `number` | ✔ |  |
| `method` | `cash` \| `bank` | ✔ |  |
| `date` | `string` | ✔ |  |
| `shiftId` | `string` \| `null` | ✔ |  |
| `userId` | `string` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |

[↑ Mundarija](#mundarija)

### DebtPaymentInputDto

Ishlatiladi: [`POST /debts/payments`](endpoints.md#post-debts-payments) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `saleId` | `string` (uuid) | ✔ |  |
| `amount` | `number` | ✔ | misol `100000` |
| `method` | `cash` \| `bank` | ✔ | `cash` — kassaga kiradi (ochiq smena shart, I8) |

[↑ Mundarija](#mundarija)

### DebtPaymentPageDto

Ishlatiladi: [`GET /debts/payments`](endpoints.md#get-debts-payments) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`DebtPaymentDto`](#debtpaymentdto)[] | ✔ |  |
| `page` | `number` | ✔ |  |
| `pageSize` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `pageCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### DebtPaymentResultDto

Ishlatiladi: [`POST /debts/payments`](endpoints.md#post-debts-payments) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `payment` | [`DebtPaymentDto`](#debtpaymentdto) | ✔ |  |
| `sale` | [`DebtSaleStateDto`](#debtsalestatedto) | ✔ |  |

[↑ Mundarija](#mundarija)

### DebtReceiptDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `saleId` | `string` | ✔ |  |
| `number` | `string` | ✔ |  |
| `customer` | [`DebtPartyDto`](#debtpartydto) \| `null` | ✔ |  |
| `date` | `string` | ✔ |  |
| `dueDate` | `string` \| `null` | ✔ |  |
| `total` | `number` | ✔ |  |
| `outstanding` | `number` | ✔ |  |
| `ageDays` | `number` | ✔ | Chek sanasidan beri kun |
| `overdue` | `boolean` | ✔ |  |

[↑ Mundarija](#mundarija)

### DebtSaleStateDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `number` | `string` | ✔ |  |
| `status` | `completed` \| `pending` \| `cancelled` | ✔ |  |
| `debtPaid` | `number` | ✔ |  |
| `outstanding` | `number` | ✔ | To‘lovdan keyingi qarz |

[↑ Mundarija](#mundarija)

### DebtSummaryDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `debt` | `number` | ✔ | Jami qarz (`customerId` bo‘lsa — shu mijozniki) |
| `overdue` | `number` | ✔ | Shundan muddati o‘tgani |
| `customers` | `number` | ✔ | Qarzdor mijozlar soni |
| `oldestDate` | `string` \| `null` | ✔ | Eng eski qarzli chek sanasi — misol `2026-07-01` |

[↑ Mundarija](#mundarija)

### DeleteTenantDto

Ishlatiladi: [`POST /tenants/current/delete`](endpoints.md#post-tenants-current-delete) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `password` | `string` | ✔ | Administrator paroli — tasdiq uchun |

[↑ Mundarija](#mundarija)

### DeliveryDto

Ishlatiladi: [`POST /deliveries`](endpoints.md#post-deliveries) (javob 201), [`GET /deliveries/my`](endpoints.md#get-deliveries-my) (javob 200 (massiv)), [`GET /deliveries/:id`](endpoints.md#get-deliveries-id) (javob 200), [`PATCH /deliveries/:id`](endpoints.md#patch-deliveries-id) (javob 200), [`POST /deliveries/:id/status`](endpoints.md#post-deliveries-id-status) (javob 200), [`POST /deliveries/:id/restore`](endpoints.md#post-deliveries-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `saleId` | `string` \| `null` | ✔ |  |
| `saleNumber` | `string` \| `null` | ✔ | misol `CHEK-1042` |
| `customer` | [`DeliveryPartyDto`](#deliverypartydto) \| `null` | ✔ |  |
| `address` | `string` | ✔ |  |
| `phone` | `string` | ✔ |  |
| `fee` | `number` | ✔ | Chekli — chekdagi yetkazish narxi (D3), aks holda alohida narx |
| `driver` | [`DeliveryPartyDto`](#deliverypartydto) \| `null` | ✔ |  |
| `status` | `pending` \| `on_way` \| `delivered` \| `cancelled` | ✔ |  |
| `scheduledDate` | `string` | ✔ |  |
| `overdue` | `boolean` | ✔ | Rejalangan kun o‘tgan, hali yetkazilmagan |
| `note` | `string` \| `null` | ✔ |  |
| `lat` | `number` \| `null` | ✔ |  |
| `lng` | `number` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |
| `deliveredAt` | `string` (date-time) \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### DeliveryInputDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `address` | `string` | ✔ | misol `Toshkent, Chilonzor 7` |
| `phone` | `string` | ✔ | misol `+998901234567` |
| `fee` | `number` |  | Chek summasi ICHIDA (I5) — misol `15000` |
| `scheduledDate` | `string` |  | Berilmasa — chek sanasi — misol `2026-09-24` |
| `lat` | `number` |  | misol `41.31` |
| `lng` | `number` |  | misol `69.24` |
| `note` | `string` |  | maks. uzunlik `500` |

[↑ Mundarija](#mundarija)

### DeliveryPageDto

Ishlatiladi: [`GET /deliveries`](endpoints.md#get-deliveries) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`DeliveryDto`](#deliverydto)[] | ✔ |  |
| `page` | `number` | ✔ |  |
| `pageSize` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `pageCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### DeliveryPartyDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |

[↑ Mundarija](#mundarija)

### DeliveryStatusDto

Ishlatiladi: [`POST /deliveries/:id/status`](endpoints.md#post-deliveries-id-status) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `status` | `pending` \| `on_way` \| `delivered` \| `cancelled` | ✔ | pending → on_way → delivered; faol holatdan — cancelled |

[↑ Mundarija](#mundarija)

### DeliverySummaryDto

Ishlatiladi: [`GET /deliveries/summary`](endpoints.md#get-deliveries-summary) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `pending` | `number` | ✔ |  |
| `onWay` | `number` | ✔ |  |
| `delivered` | `number` | ✔ |  |
| `feeRevenue` | `number` | ✔ | Yetkazilganlar narxi (chekli — chekdagi, D3) |
| `workload` | [`DriverLoadDto`](#driverloaddto)[] | ✔ | Haydovchilar yuki — kattasi birinchi |

[↑ Mundarija](#mundarija)

### DriverLoadDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `driver` | [`DeliveryPartyDto`](#deliverypartydto) \| `null` | ✔ | null — haydovchi biriktirilmagan |
| `count` | `number` | ✔ | Faol (kutilmoqda + yo‘lda) yetkazishlar — misol `3` |

[↑ Mundarija](#mundarija)

### EmployeeDto

Ishlatiladi: [`POST /employees`](endpoints.md#post-employees) (javob 201), [`GET /employees/:id`](endpoints.md#get-employees-id) (javob 200), [`PATCH /employees/:id`](endpoints.md#patch-employees-id) (javob 200), [`POST /employees/:id/restore`](endpoints.md#post-employees-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Bobur Toshmatov` |
| `position` | `string` | ✔ | misol `Kassir` |
| `phone` | `string` | ✔ | misol `+998901234567` |
| `status` | `active` \| `on_leave` \| `fired` | ✔ |  |
| `salary` | `number` |  | Oylik maosh, butun so‘m — misol `4500000` |
| `hiredAt` | `string` | ✔ | YYYY-MM-DD — misol `2026-01-15` |
| `userId` | `string` \| `null` | ✔ | Kirish hisobi (bo‘lsa) |
| `createdAt` | `string` (date-time) | ✔ |  |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |

[↑ Mundarija](#mundarija)

### ExpenseCategoryTotalDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` | ✔ |  |
| `amount` | `number` | ✔ | misol `5000000` |

[↑ Mundarija](#mundarija)

### ExpenseDto

Ishlatiladi: [`POST /expenses`](endpoints.md#post-expenses) (javob 201), [`GET /expenses/:id`](endpoints.md#get-expenses-id) (javob 200), [`PATCH /expenses/:id`](endpoints.md#patch-expenses-id) (javob 200), [`POST /expenses/:id/restore`](endpoints.md#post-expenses-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` | ✔ |  |
| `amount` | `number` | ✔ |  |
| `method` | `cash` \| `bank` | ✔ |  |
| `date` | `string` | ✔ | misol `2026-09-23` |
| `note` | `string` \| `null` | ✔ |  |
| `userId` | `string` \| `null` | ✔ |  |
| `shiftId` | `string` \| `null` | ✔ | Naqd ta’siri yozilgan smena |
| `templateId` | `string` \| `null` | ✔ | Takrorlanuvchi shablon |
| `createdAt` | `string` (date-time) | ✔ |  |
| `deletedAt` | `string` (date-time) \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### ExpensePageDto

Ishlatiladi: [`GET /expenses`](endpoints.md#get-expenses) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`ExpenseDto`](#expensedto)[] | ✔ |  |
| `page` | `number` | ✔ |  |
| `pageSize` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `pageCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### ExpenseSummaryDto

Ishlatiladi: [`GET /expenses/summary`](endpoints.md#get-expenses-summary) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `today` | `number` | ✔ | Bugungi xarajat (filtrsiz) |
| `month` | `number` | ✔ | Joriy oy (filtrsiz) |
| `total` | `number` | ✔ | Barcha vaqt (filtrsiz) |
| `byCategory` | [`ExpenseCategoryTotalDto`](#expensecategorytotaldto)[] | ✔ | Filtrga mos taqsimot — kattasi birinchi |

[↑ Mundarija](#mundarija)

### ExpenseTemplateDto

Ishlatiladi: [`GET /expense-templates`](endpoints.md#get-expense-templates) (javob 200 (massiv)), [`POST /expense-templates`](endpoints.md#post-expense-templates) (javob 201), [`PATCH /expense-templates/:id`](endpoints.md#patch-expense-templates-id) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` | ✔ |  |
| `amount` | `number` | ✔ |  |
| `method` | `cash` \| `bank` | ✔ |  |
| `period` | `monthly` \| `weekly` | ✔ |  |
| `dayOfPeriod` | `number` | ✔ |  |
| `active` | `boolean` | ✔ |  |
| `lastRunKey` | `string` \| `null` | ✔ | Oxirgi ishlagan davr (I21) — misol `2026-09` |
| `note` | `string` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |

[↑ Mundarija](#mundarija)

### ExportJobDto

Ishlatiladi: [`GET /exports/jobs/:id`](endpoints.md#get-exports-jobs-id) (javob 200), [`GET /exports/:resource`](endpoints.md#get-exports-resource) (javob 202), [`GET /exports/:resource`](endpoints.md#get-exports-resource) (javob 202)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `resource` | `products` \| `clients` \| `sales` \| `stock-movements` \| `expenses` \| `audit` | ✔ |  |
| `format` | `csv` \| `json` | ✔ |  |
| `status` | `queued` \| `running` \| `ready` \| `failed` | ✔ |  |
| `rowCount` | `number` \| `null` | ✔ |  |
| `fileId` | `string` \| `null` | ✔ | Tayyor bo‘lsa — fayl id’si |
| `url` | `string` \| `null` | ✔ | Tayyor bo‘lsa — imzolangan yuklab olish havolasi (`attachment`). Token talab qilmaydi: brauzerda `window.location` bilan oching (CORS’ga bog‘liq emas). Eskirsa — ishni qayta so‘rang |
| `expiresAt` | `string` (date-time) \| `null` | ✔ | `url` shu paytgacha amal qiladi |
| `error` | `string` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |
| `finishedAt` | `string` (date-time) \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### FieldErrorDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `field` | `string` |  | misol `items[0].qty` |
| `code` | `string` | ✔ | misol `STOCK_INSUFFICIENT` |
| `meta` | `object` |  |  |

[↑ Mundarija](#mundarija)

### FileDto

Ishlatiladi: [`POST /files/:id/confirm`](endpoints.md#post-files-id-confirm) (javob 200), [`GET /files/:id`](endpoints.md#get-files-id) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `kind` | `product_image` \| `document` \| `export` \| `import` \| `tenant_backup` \| `avatar` | ✔ |  |
| `mime` | `string` | ✔ |  |
| `sizeBytes` | `number` | ✔ |  |
| `sha256` | `string` | ✔ |  |
| `originalName` | `string` \| `null` | ✔ |  |
| `status` | `pending` \| `ready` \| `quarantined` | ✔ |  |
| `variants` | `string`[] | ✔ | Tayyor rasm variantlari |
| `createdAt` | `string` (date-time) | ✔ |  |

[↑ Mundarija](#mundarija)

### FileUrlsDto

Ishlatiladi: [`GET /files/urls`](endpoints.md#get-files-urls) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `urls` | `Record<string, string>` | ✔ | Fayl id → imzolangan havola. Yo‘q, tayyor bo‘lmagan yoki huquq yetmagan fayl — ro‘yxatda yo‘q |
| `expiresAt` | `string` (date-time) | ✔ | Havolalar shu paytgacha amal qiladi |

[↑ Mundarija](#mundarija)

### ImportProductsDto

Ishlatiladi: [`POST /products/import`](endpoints.md#post-products-import) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `rows` | [`ProductImportRowDto`](#productimportrowdto)[] | ✔ | ko‘pi bilan `5000` |
| `mode` | `create` \| `upsert` |  | `create` — faqat yangi; `upsert` — SKU bo‘yicha mavjudini yangilaydi — sukut `"create"` |

[↑ Mundarija](#mundarija)

### ImportResultDto

Ishlatiladi: [`POST /products/import`](endpoints.md#post-products-import) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `created` | `number` | ✔ | misol `148` |
| `updated` | `number` | ✔ | misol `0` |
| `skipped` | `number` | ✔ | Saqlanmagan qatorlar (`errors` soni) — misol `2` |
| `categoriesCreated` | `number` | ✔ | Import davomida yaratilgan kategoriyalar — misol `1` |
| `errors` | [`ImportRowErrorDto`](#importrowerrordto)[] | ✔ |  |

[↑ Mundarija](#mundarija)

### ImportRowErrorDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `row` | `number` | ✔ | `rows` massividagi tartib raqami (1 dan) — misol `15` |
| `code` | `string` | ✔ | misol `DUPLICATE_SKU` |
| `detail` | `string` | ✔ | misol `SEM-400` |

[↑ Mundarija](#mundarija)

### IntakeDto

Ishlatiladi: [`POST /stock/intake`](endpoints.md#post-stock-intake) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `productId` | `string` (uuid) | ✔ |  |
| `warehouseId` | `string` (uuid) |  | Berilmasa — joriy ombor |
| `qty` | `number` | ✔ | ASOSIY birlikda, 3 kasrgacha — misol `50` |
| `unitCost` | `number` |  | Kirim narxi, butun so‘m — o‘rtacha tannarx qayta hisoblanadi (I11) — misol `42000` |
| `supplierId` | `string` (uuid) |  |  |
| `note` | `string` |  | maks. uzunlik `500`, misol `Hujjat 4512` |

[↑ Mundarija](#mundarija)

### InvoiceDto

Ishlatiladi: [`GET /billing/invoices`](endpoints.md#get-billing-invoices) (javob 200 (massiv))

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `plan` | `basic` \| `pro` | ✔ |  |
| `months` | `number` | ✔ |  |
| `amount` | `number` | ✔ | So‘m |
| `state` | `created` \| `pending` \| `paid` \| `cancelled` | ✔ |  |
| `provider` | `payme` \| `click` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |
| `paidAt` | `string` (date-time) \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### LoginDto

Ishlatiladi: [`POST /auth/login`](endpoints.md#post-auth-login) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `email` | `string` | ✔ | misol `admin@crm.uz` |
| `password` | `string` | ✔ | misol `Qurilish2026!` |
| `tenantId` | `string` |  | Bitta email bir nechta do‘konda bo‘lsa, qaysi biriga kirish. Kerak bo‘lsa server AUTH_TENANT_REQUIRED xatosida ro‘yxatni beradi. |

[↑ Mundarija](#mundarija)

### LoginResponseDto

Ishlatiladi: [`POST /auth/login`](endpoints.md#post-auth-login) (javob 201), [`POST /auth/refresh`](endpoints.md#post-auth-refresh) (javob 201), [`POST /tenants/register`](endpoints.md#post-tenants-register) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `accessToken` | `string` | ✔ |  |
| `expiresIn` | `number` | ✔ | Soniyada — misol `900` |
| `user` | [`AuthUserDto`](#authuserdto) | ✔ |  |

[↑ Mundarija](#mundarija)

### LowStockItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ |  |
| `stock` | `number` | ✔ |  |
| `minStock` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### MessageAudienceDto

Ishlatiladi: [`POST /messages/preview`](endpoints.md#post-messages-preview) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `target` | `customer` \| `group` \| `debtors` \| `all` | ✔ | customer \| group \| debtors \| all |
| `customerId` | `string` (uuid) |  | `target=customer` da majburiy |
| `group` | `retail` \| `wholesale` \| `vip` |  | `target=group` da majburiy |

[↑ Mundarija](#mundarija)

### MessageDto

Ishlatiladi: [`POST /messages`](endpoints.md#post-messages) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `target` | `customer` \| `group` \| `debtors` \| `all` | ✔ |  |
| `recipientLabel` | `string` | ✔ |  |
| `recipients` | `number` | ✔ |  |
| `text` | `string` | ✔ |  |
| `template` | `string` \| `null` | ✔ |  |
| `deliveryStatus` | `string` | ✔ | queued \| sending \| sent \| partial \| failed \| logged — misol `queued` |
| `stats` | [`MessageStatsDto`](#messagestatsdto) | ✔ |  |
| `userId` | `string` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |

[↑ Mundarija](#mundarija)

### MessagePageDto

Ishlatiladi: [`GET /messages`](endpoints.md#get-messages) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`MessageDto`](#messagedto)[] | ✔ |  |
| `page` | `number` | ✔ |  |
| `pageSize` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `pageCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### MessageStatsDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `queued` | `number` | ✔ |  |
| `sent` | `number` | ✔ |  |
| `failed` | `number` | ✔ |  |
| `logged` | `number` | ✔ | Provayder `none` — faqat jurnal |

[↑ Mundarija](#mundarija)

### MigrationDto

Ishlatiladi: [`POST /migration/validate`](endpoints.md#post-migration-validate) (so‘rov), [`POST /migration/import`](endpoints.md#post-migration-import) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `source` | `string` | ✔ | misol `localStorage` |
| `version` | `number` | ✔ | min `12`, max `15`, misol `15` |
| `exportedAt` | `string` |  | misol `2026-08-06T09:00:00Z` |
| `data` | `object` | ✔ | Brauzerdagi `CrmSnapshot` |
| `settings` | `object` |  | Brauzer sozlamalari (`Settings`) |
| `users` | [`MigrationUserDto`](#migrationuserdto)[] |  | Parolsiz — server vaqtinchalik parol beradi |

[↑ Mundarija](#mundarija)

### MigrationIssueDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `severity` | `error` \| `warning` | ✔ | `error` — yozuv o‘tkazib yuborildi; `warning` — tuzatildi |
| `entity` | `string` | ✔ | misol `sale` |
| `id` | `string` |  | Brauzerdagi id — misol `sa_x1` |
| `code` | `string` | ✔ | misol `MISSING_PRODUCT` |
| `detail` | `string` |  | misol `pr_zzz topilmadi` |

[↑ Mundarija](#mundarija)

### MigrationReportDto

Ishlatiladi: [`POST /migration/validate`](endpoints.md#post-migration-validate) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `valid` | `boolean` | ✔ | Xato (o‘tkazib yuboriladigan yozuv) yo‘q |
| `counts` | `Record<string, number>` | ✔ | Nusxadagi yozuvlar soni |
| `accepted` | `Record<string, number>` | ✔ | Yoziladigan (yozilgan) yozuvlar |
| `existing` | `Record<string, number>` | ✔ | Serverda allaqachon bor ma’lumot (takroriy import ogohlantirishi) |
| `issues` | [`MigrationIssueDto`](#migrationissuedto)[] | ✔ |  |

[↑ Mundarija](#mundarija)

### MigrationResultDto

Ishlatiladi: [`POST /migration/import`](endpoints.md#post-migration-import) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `valid` | `boolean` | ✔ | Xato (o‘tkazib yuboriladigan yozuv) yo‘q |
| `counts` | `Record<string, number>` | ✔ | Nusxadagi yozuvlar soni |
| `accepted` | `Record<string, number>` | ✔ | Yoziladigan (yozilgan) yozuvlar |
| `existing` | `Record<string, number>` | ✔ | Serverda allaqachon bor ma’lumot (takroriy import ogohlantirishi) |
| `issues` | [`MigrationIssueDto`](#migrationissuedto)[] | ✔ |  |
| `users` | [`TemporaryPasswordDto`](#temporarypassworddto)[] | ✔ |  |

[↑ Mundarija](#mundarija)

### MigrationUserDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | maks. uzunlik `120`, misol `Vali Karimov` |
| `email` | `string` | ✔ | misol `vali@dokon.uz` |
| `role` | `admin` \| `manager` \| `sotuvchi` \| `omborchi` | ✔ |  |

[↑ Mundarija](#mundarija)

### MovementDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `productId` | `string` | ✔ |  |
| `productName` | `string` | ✔ | Nom snapshot — tovar arxivlansa ham tarix o‘qiladi |
| `type` | `intake` \| `writeoff` \| `adjustment` \| `sale` \| `return` \| `transfer_out` \| `transfer_in` | ✔ |  |
| `qty` | `number` | ✔ | Ishorali: + kirim, − chiqim (asosiy birlikda) — misol `-3` |
| `balanceAfter` | `number` | ✔ | Shu harakatdan keyingi qoldiq — AYNAN shu omborda — misol `97` |
| `warehouseId` | `string` | ✔ |  |
| `counterWarehouseId` | `string` \| `null` | ✔ |  |
| `date` | `string` | ✔ | misol `2026-09-23` |
| `note` | `string` \| `null` | ✔ |  |
| `supplierId` | `string` \| `null` | ✔ |  |
| `unitCost` | `number` \| `null` |  | Kirim narxi. Sotuvchi rolida yo‘q |
| `refId` | `string` \| `null` | ✔ | Bog‘liq hujjat (chek, buyurtma) |
| `userId` | `string` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |

[↑ Mundarija](#mundarija)

### MovementPageDto

Ishlatiladi: [`GET /stock/movements`](endpoints.md#get-stock-movements) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`MovementDto`](#movementdto)[] | ✔ |  |
| `nextCursor` | `string` \| `null` | ✔ |  |
| `hasMore` | `boolean` | ✔ |  |

[↑ Mundarija](#mundarija)

### NamedValueDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `value` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### OpenShiftDto

Ishlatiladi: [`POST /cash/shifts/open`](endpoints.md#post-cash-shifts-open) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `openingBalance` | `number` | ✔ | Yashikdagi SANALGAN naqd — kassa balansi shunga tenglashadi (I10) — misol `200000` |

[↑ Mundarija](#mundarija)

### PaidDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `cash` | `number` | ✔ | Berilgan naqd (qaytim shundan) — misol `200000` |
| `card` | `number` | ✔ | misol `0` |
| `transfer` | `number` | ✔ | misol `0` |

[↑ Mundarija](#mundarija)

### PartyRefDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |

[↑ Mundarija](#mundarija)

### PaymentMixDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `cash` | `number` | ✔ | Kassada qolgan naqd |
| `card` | `number` | ✔ |  |
| `transfer` | `number` | ✔ |  |
| `debt` | `number` | ✔ | Davr cheklarining HOZIR qolgan qarzi |

[↑ Mundarija](#mundarija)

### PaymeRequestDto

Ishlatiladi: [`POST /billing/payme`](endpoints.md#post-billing-payme) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `jsonrpc` | `string` |  | misol `2.0` |
| `id` | `object` | ✔ | So‘rov id — javobda aynan qaytadi — misol `1` |
| `method` | `string` | ✔ | misol `CheckPerformTransaction` |
| `params` | `object` | ✔ |  |

[↑ Mundarija](#mundarija)

### PayPurchaseOrderDto

Ishlatiladi: [`POST /purchase-orders/:id/pay`](endpoints.md#post-purchase-orders-id-pay) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `amount` | `number` | ✔ | misol `400000` |
| `method` | `cash` \| `bank` | ✔ | `cash` — kassadan chiqadi (ochiq smena shart) |

[↑ Mundarija](#mundarija)

### PeriodDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `from` | `string` | ✔ |  |
| `to` | `string` | ✔ |  |

[↑ Mundarija](#mundarija)

### PlanLimitsDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `users` | `number` | ✔ |  |
| `warehouses` | `number` | ✔ |  |
| `storageBytes` | `number` | ✔ |  |
| `fileBytes` | `number` | ✔ |  |
| `smsPerDay` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### PlanUsageDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `users` | `number` | ✔ |  |
| `warehouses` | `number` | ✔ |  |
| `storageBytes` | `number` | ✔ |  |
| `smsToday` | `number` | ✔ | Bugun (Toshkent kuni) |

[↑ Mundarija](#mundarija)

### PnlChangeDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `revenue` | `number` \| `null` | ✔ | % — oldingi davr 0 bo‘lsa null |
| `grossProfit` | `number` \| `null` |  |  |
| `netProfit` | `number` \| `null` |  | Sotuvchi rolida yo‘q |
| `expenses` | `number` \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### PnlDto

Ishlatiladi: [`GET /reports/pnl`](endpoints.md#get-reports-pnl) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `period` | [`PeriodDto`](#perioddto) | ✔ |  |
| `previousPeriod` | [`PeriodDto`](#perioddto) | ✔ | Xuddi shu uzunlikdagi oldingi davr |
| `current` | [`PnlTotalsDto`](#pnltotalsdto) | ✔ |  |
| `previous` | [`PnlTotalsDto`](#pnltotalsdto) | ✔ |  |
| `change` | [`PnlChangeDto`](#pnlchangedto) | ✔ |  |
| `granularity` | `day` \| `month` | ✔ | 62 kundan uzun davr — oy bo‘yicha |
| `trend` | [`TrendPointDto`](#trendpointdto)[] | ✔ |  |
| `payments` | [`PaymentMixDto`](#paymentmixdto) | ✔ |  |
| `expensesByCategory` | [`CategoryAmountDto`](#categoryamountdto)[] | ✔ |  |
| `topProducts` | [`ProductSalesDto`](#productsalesdto)[] | ✔ |  |
| `sellers` | [`SellerSalesDto`](#sellersalesdto)[] | ✔ |  |
| `deadStock` | [`DeadStockDto`](#deadstockdto) | ✔ |  |

[↑ Mundarija](#mundarija)

### PnlTotalsDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `revenue` | `number` | ✔ | Tushum: sotuv − qaytarish (I4) |
| `cogs` | `number` |  | Tannarx (COGS). Sotuvchi rolida yo‘q |
| `grossProfit` | `number` |  | Sotuvchi rolida yo‘q |
| `expenses` | `number` | ✔ |  |
| `netProfit` | `number` |  | Sotuvchi rolida yo‘q |
| `salesCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### PoItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `productId` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `qty` | `number` | ✔ |  |
| `receivedQty` | `number` | ✔ | Qabul qilingan (I19: buyurtmadan oshmaydi) |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ | Mahsulotning asosiy birligi |
| `cost` | `number` |  | Birlik tannarx. Sotuvchi rolida yo‘q |

[↑ Mundarija](#mundarija)

### PoItemInputDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `productId` | `string` (uuid) | ✔ |  |
| `qty` | `number` | ✔ | ASOSIY birlikda — misol `100` |
| `cost` | `number` | ✔ | Birlik tannarx (kirim narxi) — misol `40000` |

[↑ Mundarija](#mundarija)

### PoPaymentResultDto

Ishlatiladi: [`POST /purchase-orders/:id/pay`](endpoints.md#post-purchase-orders-id-pay) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `payment` | [`SupplierPaymentDto`](#supplierpaymentdto) | ✔ |  |
| `order` | [`PurchaseOrderDto`](#purchaseorderdto) | ✔ |  |

[↑ Mundarija](#mundarija)

### PoSupplierRefDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |

[↑ Mundarija](#mundarija)

### PresignDto

Ishlatiladi: [`POST /files/presign`](endpoints.md#post-files-presign) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `kind` | `product_image` \| `document` \| `export` \| `import` \| `tenant_backup` \| `avatar` | ✔ |  |
| `mime` | `string` | ✔ | Oq ro‘yxatdan (09 §9.6) — misol `image/webp` |
| `size` | `number` | ✔ | Bayt — imzoga kiradi — misol `153600` |
| `sha256` | `string` | ✔ | Tarkib SHA-256 (hex) — takror yuklashni aniqlash — misol `ab12…` |
| `originalName` | `string` |  | maks. uzunlik `200`, misol `sement.webp` |

[↑ Mundarija](#mundarija)

### PresignResultDto

Ishlatiladi: [`POST /files/presign`](endpoints.md#post-files-presign) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `file` | [`FileDto`](#filedto) | ✔ |  |
| `reused` | `boolean` | ✔ | Shu tarkib allaqachon bor — yuklash shart emas (09 §9.9) |
| `upload` | [`UploadTargetDto`](#uploadtargetdto) \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### ProductDto

Ishlatiladi: [`POST /products`](endpoints.md#post-products) (javob 201), [`GET /products/:id`](endpoints.md#get-products-id) (javob 200), [`PATCH /products/:id`](endpoints.md#patch-products-id) (javob 200), [`POST /products/:id/restore`](endpoints.md#post-products-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Portland sement M400` |
| `sku` | `string` | ✔ | misol `SEM-400` |
| `barcode` | `string` \| `null` | ✔ | misol `4780000000011` |
| `categoryId` | `string` (uuid) \| `null` | ✔ |  |
| `supplierId` | `string` (uuid) \| `null` | ✔ |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ | misol `qop` |
| `price` | `number` | ✔ | Chakana narx, butun so‘m — misol `60000` |
| `wholesalePrice` | `number` |  | Ulgurji narx, butun so‘m. Sotuvchi rolida yo‘q — misol `55000` |
| `cost` | `number` |  | O‘rtacha tannarx, butun so‘m. Sotuvchi rolida yo‘q — misol `40000` |
| `stock` | `number` | ✔ | JAMI qoldiq, asosiy birlikda (3 kasr) — misol `120.5` |
| `stocks` | `Record<string, number>` | ✔ | Ombor bo‘yicha taqsimot: omborId → miqdor |
| `warehouseStock` | `number` |  | Faqat `warehouseId` filtri berilganda: shu ombordagi qoldiq — misol `80.5` |
| `minStock` | `number` | ✔ | Kam qolgan chegarasi (3 kasr) — misol `20` |
| `archived` | `boolean` | ✔ |  |
| `altUnit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` \| `null` | ✔ | misol `kg` |
| `altFactor` | `number` \| `null` | ✔ | 1 altUnit = altFactor × unit — misol `50` |
| `imageFileId` | `string` (uuid) \| `null` | ✔ | Rasm: `GET /files/{imageFileId}/raw?variant=128\|512\|orig` |
| `createdAt` | `string` (date-time) | ✔ |  |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |

[↑ Mundarija](#mundarija)

### ProductImportRowDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ | misol `Sement M400 (50 kg)` |
| `sku` | `string` | ✔ | `upsert` rejimida shu bo‘yicha topiladi — misol `SEM-400-50` |
| `barcode` | `string` |  | misol `4780000000011` |
| `category` | `string` |  | Kategoriya NOMI; yo‘q bo‘lsa yaratiladi — misol `Sement va aralashmalar` |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ |  |
| `price` | `number` | ✔ | misol `62000` |
| `wholesalePrice` | `number` |  | Berilmasa — yangi mahsulotda chakana narx — misol `58000` |
| `cost` | `number` |  | Berilmasa — yangi mahsulotda 0 — misol `52000` |
| `minStock` | `number` |  | misol `40` |
| `altUnit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` |  |  |
| `altFactor` | `number` |  | misol `50` |

[↑ Mundarija](#mundarija)

### ProductSalesDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `productId` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ |  |
| `qty` | `number` | ✔ | Asosiy birlikda |
| `revenue` | `number` | ✔ |  |
| `profit` | `number` |  | Sotuvchi rolida yo‘q |

[↑ Mundarija](#mundarija)

### ProductStatsDto

Ishlatiladi: [`GET /products/:id/stats`](endpoints.md#get-products-id-stats) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `soldQty` | `number` | ✔ | Sof sotilgan miqdor, asosiy birlikda: sotuv − qaytarish (bekor qilinganlarsiz) — misol `340.5` |
| `lastSale` | `string` (date) \| `null` | ✔ | Oxirgi sotuv kuni |

[↑ Mundarija](#mundarija)

### ProductStockDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Sement M400` |
| `stock` | `number` | ✔ | JAMI qoldiq — misol `170.5` |
| `cost` | `number` |  | O‘rtacha tannarx (I11) — misol `40588` |
| `stocks` | `Record<string, number>` | ✔ | omborId → miqdor |

[↑ Mundarija](#mundarija)

### ProductSummaryDto

Ishlatiladi: [`GET /products/summary`](endpoints.md#get-products-summary) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `active` | `number` | ✔ | Faol (arxivlanmagan) mahsulot turlari — misol `137` |
| `lowStock` | `number` | ✔ | Kam qolganlar: qoldiq ≤ minimal — misol `6` |
| `stockValue` | `number` |  | Ombor qiymati tannarxda. Sotuvchi rolida yo‘q — misol `84500000` |
| `stockValueByCategory` | [`CategoryValueDto`](#categoryvaluedto)[] |  | Ombor qiymati kategoriyalar bo‘yicha (eng kattasi 8 ta). Sotuvchi rolida yo‘q |

[↑ Mundarija](#mundarija)

### PurchaseOrderDto

Ishlatiladi: [`POST /purchase-orders`](endpoints.md#post-purchase-orders) (javob 201), [`GET /purchase-orders/:id`](endpoints.md#get-purchase-orders-id) (javob 200), [`PATCH /purchase-orders/:id`](endpoints.md#patch-purchase-orders-id) (javob 200), [`POST /purchase-orders/:id/cancel`](endpoints.md#post-purchase-orders-id-cancel) (javob 200), [`POST /purchase-orders/:id/restore`](endpoints.md#post-purchase-orders-id-restore) (javob 200), [`POST /purchase-orders/:id/receive`](endpoints.md#post-purchase-orders-id-receive) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `number` | `string` | ✔ | misol `BUY-1001` |
| `supplier` | [`PoSupplierRefDto`](#posupplierrefdto) | ✔ |  |
| `warehouseId` | `string` \| `null` | ✔ |  |
| `status` | `ordered` \| `partial` \| `received` \| `cancelled` | ✔ |  |
| `total` | `number` |  | Buyurtma summasi. Sotuvchi rolida yo‘q (summadan tannarx tiklanadi) |
| `receivedValue` | `number` |  | Kelgan tovar qiymati. Sotuvchi rolida yo‘q |
| `paid` | `number` |  | To‘langan. Sotuvchi rolida yo‘q |
| `outstanding` | `number` |  | Ta’minotchiga qarz — faqat kelgan tovar uchun (I18). Sotuvchi rolida yo‘q |
| `date` | `string` | ✔ |  |
| `receivedDate` | `string` \| `null` | ✔ |  |
| `dueDate` | `string` \| `null` | ✔ |  |
| `note` | `string` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |
| `items` | [`PoItemDto`](#poitemdto)[] | ✔ |  |

[↑ Mundarija](#mundarija)

### PurchaseOrderPageDto

Ishlatiladi: [`GET /purchase-orders`](endpoints.md#get-purchase-orders) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`PurchaseOrderDto`](#purchaseorderdto)[] | ✔ |  |
| `page` | `number` | ✔ |  |
| `pageSize` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `pageCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### PurchaseOrderSummaryDto

Ishlatiladi: [`GET /purchase-orders/summary`](endpoints.md#get-purchase-orders-summary) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `outstanding` | `number` |  | Ta’minotchilarga jami qarz (kelgan tovar uchun, I18). Sotuvchi rolida yo‘q — misol `1200000` |
| `openOrders` | `number` | ✔ | Kutilayotgan (`ordered`) buyurtmalar — misol `3` |
| `monthTotal` | `number` |  | Joriy oy buyurtmalari (bekor qilinganlarsiz). Sotuvchi rolida yo‘q — misol `5400000` |
| `receivedTotal` | `number` |  | To‘liq qabul qilingan buyurtmalar summasi. Sotuvchi rolida yo‘q — misol `9800000` |

[↑ Mundarija](#mundarija)

### QuoteDto

Ishlatiladi: [`POST /quotes`](endpoints.md#post-quotes) (javob 201), [`GET /quotes/:id`](endpoints.md#get-quotes-id) (javob 200), [`PATCH /quotes/:id`](endpoints.md#patch-quotes-id) (javob 200), [`POST /quotes/:id/restore`](endpoints.md#post-quotes-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `number` | `string` | ✔ | misol `TKLF-1001` |
| `customerId` | `string` \| `null` | ✔ |  |
| `sellerId` | `string` \| `null` | ✔ |  |
| `customer` | [`QuotePartyDto`](#quotepartydto) \| `null` | ✔ |  |
| `seller` | [`QuotePartyDto`](#quotepartydto) \| `null` | ✔ |  |
| `subtotal` | `number` | ✔ |  |
| `discount` | `number` | ✔ |  |
| `taxRate` | `number` | ✔ |  |
| `tax` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `status` | `draft` \| `sent` \| `accepted` \| `rejected` \| `converted` | ✔ |  |
| `date` | `string` | ✔ | misol `2026-09-23` |
| `validUntil` | `string` \| `null` | ✔ |  |
| `expired` | `boolean` | ✔ | Amal muddati o‘tgan (aylantirilmagan/rad etilmagan taklif) |
| `note` | `string` \| `null` | ✔ |  |
| `saleId` | `string` \| `null` | ✔ | Aylantirilgan chek |
| `createdAt` | `string` (date-time) | ✔ |  |
| `items` | [`QuoteItemDto`](#quoteitemdto)[] | ✔ |  |

[↑ Mundarija](#mundarija)

### QuoteItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `productId` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ |  |
| `qty` | `number` | ✔ |  |
| `baseQty` | `number` | ✔ | Asosiy birlikda |
| `price` | `number` | ✔ |  |
| `cost` | `number` |  | Tannarx snapshot. Sotuvchi rolida yo‘q |
| `discount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### QuotePageDto

Ishlatiladi: [`GET /quotes`](endpoints.md#get-quotes) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`QuoteDto`](#quotedto)[] | ✔ |  |
| `page` | `number` | ✔ |  |
| `pageSize` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `pageCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### QuotePartyDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `phone` | `string` |  | Faqat mijozda |

[↑ Mundarija](#mundarija)

### QuoteSummaryDto

Ishlatiladi: [`GET /quotes/summary`](endpoints.md#get-quotes-summary) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `total` | `number` | ✔ | Barcha takliflar summasi |
| `accepted` | `number` | ✔ | Qabul qilinganlar |
| `pending` | `number` | ✔ | Javob kutilayotganlar (yuborilgan) |

[↑ Mundarija](#mundarija)

### ReceiptDto

Ishlatiladi: [`GET /sales/:id/receipt`](endpoints.md#get-sales-id-receipt) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `store` | [`ReceiptStoreDto`](#receiptstoredto) | ✔ |  |
| `sale` | [`SaleDto`](#saledto) | ✔ |  |
| `customer` | [`PartyRefDto`](#partyrefdto) \| `null` | ✔ |  |
| `seller` | [`PartyRefDto`](#partyrefdto) \| `null` | ✔ |  |
| `fiscal` | [`ReceiptFiscalDto`](#receiptfiscaldto) \| `null` | ✔ | `OFD_ENABLED=false` da — `null` |

[↑ Mundarija](#mundarija)

### ReceiptFiscalDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `status` | `pending` \| `sent` \| `confirmed` \| `failed` | ✔ | `pending`/`sent` — navbatda (OFD javob bermagan); `failed` — OFD rad etdi |
| `fiscalId` | `string` \| `null` | ✔ | OFD bergan fiskal raqam |
| `qrPayload` | `string` \| `null` | ✔ | Chekdagi QR mazmuni |
| `fiscalizedAt` | `string` (date-time) \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### ReceiptStoreDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `name` | `string` | ✔ |  |
| `phone` | `string` | ✔ |  |
| `address` | `string` | ✔ |  |
| `footer` | `string` | ✔ |  |
| `currency` | `string` | ✔ | misol `so'm` |

[↑ Mundarija](#mundarija)

### ReceiveItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `poItemId` | `string` (uuid) | ✔ |  |
| `qty` | `number` | ✔ | misol `7` |

[↑ Mundarija](#mundarija)

### ReceivePurchaseOrderDto

Ishlatiladi: [`POST /purchase-orders/:id/receive`](endpoints.md#post-purchase-orders-id-receive) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `items` | [`ReceiveItemDto`](#receiveitemdto)[] |  | Berilmasa — qolgan HAMMASI qabul qilinadi |

[↑ Mundarija](#mundarija)

### RecentSaleDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `number` | `string` | ✔ |  |
| `date` | `string` | ✔ |  |
| `total` | `number` | ✔ |  |
| `status` | `string` | ✔ |  |
| `type` | `string` | ✔ |  |
| `customer` | `string` \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### RegisterDto

Ishlatiladi: [`POST /tenants/register`](endpoints.md#post-tenants-register) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `storeName` | `string` | ✔ | maks. uzunlik `120`, misol `Ali Qurilish Mollari` |
| `ownerName` | `string` | ✔ | maks. uzunlik `120`, misol `Ali Valiyev` |
| `phone` | `string` | ✔ | misol `+998901234567` |
| `email` | `string` | ✔ | misol `ali@dokon.uz` |
| `password` | `string` | ✔ | Kamida 8 belgi; ommabop parollar rad etiladi — misol `Qurilish2026!` |

[↑ Mundarija](#mundarija)

### ReorderGroupDto

Ishlatiladi: [`GET /stock/reorder-suggestions`](endpoints.md#get-stock-reorder-suggestions) (javob 200 (massiv))

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `supplier` | [`SupplierRefDto`](#supplierrefdto) \| `null` | ✔ | null — ta’minotchisi belgilanmagan |
| `items` | [`ReorderItemDto`](#reorderitemdto)[] | ✔ |  |

[↑ Mundarija](#mundarija)

### ReorderItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `productId` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `sku` | `string` | ✔ |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ |  |
| `stock` | `number` | ✔ | misol `10` |
| `minStock` | `number` | ✔ | misol `40` |
| `suggestedQty` | `number` | ✔ | `max(minStock×2 − stock, minStock)` — shared/reorder — misol `70` |
| `cost` | `number` |  | Tannarx. Sotuvchi rolida yo‘q — misol `52000` |

[↑ Mundarija](#mundarija)

### ReturnItemInputDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `saleItemId` | `string` (uuid) | ✔ | Asl chek qatori |
| `qty` | `number` | ✔ | Asl qator birligida — misol `1` |

[↑ Mundarija](#mundarija)

### ReturnSaleDto

Ishlatiladi: [`POST /sales/:id/return`](endpoints.md#post-sales-id-return) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `items` | [`ReturnItemInputDto`](#returniteminputdto)[] | ✔ | ko‘pi bilan `200` |
| `reason` | `string` | ✔ | maks. uzunlik `500`, misol `Sifatsiz` |

[↑ Mundarija](#mundarija)

### RouteSheetDto

Ishlatiladi: [`GET /deliveries/route`](endpoints.md#get-deliveries-route) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `date` | `string` | ✔ |  |
| `driver` | [`DeliveryPartyDto`](#deliverypartydto) \| `null` | ✔ |  |
| `stops` | [`RouteStopDto`](#routestopdto)[] | ✔ |  |
| `collectTotal` | `number` | ✔ | Jami olinadigan pul |

[↑ Mundarija](#mundarija)

### RouteStopDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `saleId` | `string` \| `null` | ✔ |  |
| `saleNumber` | `string` \| `null` | ✔ | misol `CHEK-1042` |
| `customer` | [`DeliveryPartyDto`](#deliverypartydto) \| `null` | ✔ |  |
| `address` | `string` | ✔ |  |
| `phone` | `string` | ✔ |  |
| `fee` | `number` | ✔ | Chekli — chekdagi yetkazish narxi (D3), aks holda alohida narx |
| `driver` | [`DeliveryPartyDto`](#deliverypartydto) \| `null` | ✔ |  |
| `status` | `pending` \| `on_way` \| `delivered` \| `cancelled` | ✔ |  |
| `scheduledDate` | `string` | ✔ |  |
| `overdue` | `boolean` | ✔ | Rejalangan kun o‘tgan, hali yetkazilmagan |
| `note` | `string` \| `null` | ✔ |  |
| `lat` | `number` \| `null` | ✔ |  |
| `lng` | `number` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |
| `deliveredAt` | `string` (date-time) \| `null` | ✔ |  |
| `sequence` | `number` | ✔ | misol `1` |
| `collect` | `number` | ✔ | Mijozdan olinadigan pul — chekning qolgan qarzi |

[↑ Mundarija](#mundarija)

### RunDueResultDto

Ishlatiladi: [`POST /expense-templates/run-due`](endpoints.md#post-expense-templates-run-due) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `created` | `number` | ✔ | Yaratilgan xarajatlar soni — misol `2` |

[↑ Mundarija](#mundarija)

### SaleDeliveryRefDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `status` | `string` | ✔ | misol `pending` |

[↑ Mundarija](#mundarija)

### SaleDto

Ishlatiladi: [`POST /sales`](endpoints.md#post-sales) (javob 201), [`GET /sales/:id`](endpoints.md#get-sales-id) (javob 200), [`POST /sales/:id/return`](endpoints.md#post-sales-id-return) (javob 201), [`POST /sales/:id/cancel`](endpoints.md#post-sales-id-cancel) (javob 200), [`POST /quotes/:id/convert`](endpoints.md#post-quotes-id-convert) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `number` | `string` | ✔ | misol `CHEK-1042` |
| `type` | `sale` \| `return` | ✔ |  |
| `status` | `completed` \| `pending` \| `cancelled` | ✔ |  |
| `customerId` | `string` \| `null` | ✔ |  |
| `sellerId` | `string` \| `null` | ✔ |  |
| `warehouseId` | `string` \| `null` | ✔ |  |
| `priceTier` | `retail` \| `wholesale` | ✔ |  |
| `subtotal` | `number` | ✔ | misol `180000` |
| `discount` | `number` | ✔ | Umumiy chegirma + ishlatilgan bonus — misol `25000` |
| `taxRate` | `number` | ✔ | misol `12` |
| `tax` | `number` | ✔ | misol `18600` |
| `deliveryFee` | `number` | ✔ | Chek summasi ICHIDA (I5) — misol `15000` |
| `total` | `number` | ✔ | misol `188600` |
| `paid` | [`SalePaidDto`](#salepaiddto) | ✔ |  |
| `change` | `number` | ✔ | misol `11400` |
| `debtPaid` | `number` | ✔ | Keyinchalik to‘langan (qarz to‘lovi, qaytarish hisobi) — misol `0` |
| `outstanding` | `number` | ✔ | Qolgan qarz — bazada hisoblangan (I13) — misol `0` |
| `dueDate` | `string` \| `null` | ✔ | misol `None` |
| `date` | `string` | ✔ | misol `2026-09-23` |
| `relatedSaleId` | `string` \| `null` | ✔ | Qaytarishda — asl chek |
| `bonusUsed` | `number` | ✔ | misol `5000` |
| `bonusEarned` | `number` | ✔ | misol `1886` |
| `createdAt` | `string` (date-time) | ✔ |  |
| `cancelledAt` | `string` (date-time) \| `null` | ✔ |  |
| `items` | [`SaleItemDto`](#saleitemdto)[] | ✔ |  |
| `delivery` | [`SaleDeliveryRefDto`](#saledeliveryrefdto) \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### SaleItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `productId` | `string` | ✔ |  |
| `name` | `string` | ✔ | Snapshot — misol `Sement M400` |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` | ✔ |  |
| `qty` | `number` | ✔ | misol `3` |
| `baseQty` | `number` | ✔ | Asosiy birlikda — ombor shu bo‘yicha (I23) — misol `150` |
| `price` | `number` | ✔ | misol `60000` |
| `cost` | `number` |  | Tannarx snapshot. Sotuvchi rolida yo‘q — misol `45000` |
| `discount` | `number` | ✔ | misol `0` |
| `returnOfId` | `string` \| `null` | ✔ | Qaytarishda — asl chek qatori |
| `returnedQty` | `number` | ✔ | Shu qatordan qaytarilgani (bekor qilinmagan qaytarishlar), `unit` da. Yana qaytarish mumkin: `qty − returnedQty`. Qaytarish hujjati qatorida va yangi chekda — 0 — misol `1` |

[↑ Mundarija](#mundarija)

### SaleItemInputDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `productId` | `string` (uuid) | ✔ |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` |  | Sotuv birligi; berilmasa — asosiy birlik |
| `qty` | `number` | ✔ | `unit` da, 3 kasrgacha — misol `3` |
| `price` | `number` |  | Birlik narx (savdolashish); berilmasa — narx darajasidan — misol `60000` |
| `discount` | `number` |  | Qator chegirmasi, so‘m — misol `0` |

[↑ Mundarija](#mundarija)

### SaleListItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `number` | `string` | ✔ |  |
| `type` | `sale` \| `return` | ✔ |  |
| `status` | `completed` \| `pending` \| `cancelled` | ✔ |  |
| `customer` | [`PartyRefDto`](#partyrefdto) \| `null` | ✔ |  |
| `seller` | [`PartyRefDto`](#partyrefdto) \| `null` | ✔ |  |
| `warehouseId` | `string` \| `null` | ✔ |  |
| `subtotal` | `number` | ✔ |  |
| `discount` | `number` | ✔ |  |
| `tax` | `number` | ✔ |  |
| `deliveryFee` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `paid` | [`SalePaidDto`](#salepaiddto) | ✔ |  |
| `change` | `number` | ✔ |  |
| `debtPaid` | `number` | ✔ |  |
| `outstanding` | `number` | ✔ | Qolgan qarz — SQL’da hisoblangan (I13) |
| `dueDate` | `string` \| `null` | ✔ |  |
| `date` | `string` | ✔ |  |
| `relatedSaleId` | `string` \| `null` | ✔ |  |
| `itemCount` | `number` | ✔ | misol `3` |
| `createdAt` | `string` (date-time) | ✔ |  |

[↑ Mundarija](#mundarija)

### SalePageDto

Ishlatiladi: [`GET /sales`](endpoints.md#get-sales) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`SaleListItemDto`](#salelistitemdto)[] | ✔ |  |
| `nextCursor` | `string` \| `null` | ✔ |  |
| `hasMore` | `boolean` | ✔ |  |

[↑ Mundarija](#mundarija)

### SalePaidDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `cash` | `number` | ✔ | Berilgan naqd (qaytim bilan) — misol `200000` |
| `card` | `number` | ✔ | misol `0` |
| `transfer` | `number` | ✔ | misol `0` |

[↑ Mundarija](#mundarija)

### SellerSalesDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `sellerId` | `string` \| `null` | ✔ |  |
| `name` | `string` \| `null` | ✔ |  |
| `count` | `number` | ✔ |  |
| `revenue` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### SendMessageDto

Ishlatiladi: [`POST /messages`](endpoints.md#post-messages) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `target` | `customer` \| `group` \| `debtors` \| `all` | ✔ | customer \| group \| debtors \| all |
| `customerId` | `string` (uuid) |  | `target=customer` da majburiy |
| `group` | `retail` \| `wholesale` \| `vip` |  | `target=group` da majburiy |
| `text` | `string` | ✔ | O‘zgaruvchilar: {name}, {phone}, {debt}, {bonus}, {store} — maks. uzunlik `600`, misol `Hurmatli {name}, qarzingiz {debt} so‘m. {store}` |
| `template` | `string` |  | Qaysi shablondan (jurnal uchun) — misol `debt-reminder` |

[↑ Mundarija](#mundarija)

### SettingsDto

Ishlatiladi: [`GET /settings`](endpoints.md#get-settings) (javob 200), [`PATCH /settings`](endpoints.md#patch-settings) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `storeName` | `string` | ✔ | misol `Qurilish Mollari` |
| `currency` | `string` | ✔ | misol `so‘m` |
| `taxEnabled` | `boolean` | ✔ |  |
| `taxRate` | `number` | ✔ | QQS foizi, butun son (12 = 12%) — misol `12` |
| `wholesaleEnabled` | `boolean` | ✔ |  |
| `sellerWholesaleEnabled` | `boolean` | ✔ | Sotuvchi ham ulgurji narxda sota oladi va `wholesalePrice` ni ko‘radi (`wholesaleEnabled` bilan birga). `false` — sotuvchiga ulgurji narx yashirin, `priceTier: "wholesale"` → 403 |
| `loyaltyEnabled` | `boolean` | ✔ |  |
| `loyaltyRate` | `number` | ✔ | Xariddan bonus foizi — misol `1` |
| `maxDiscountPct` | `number` | ✔ | Kassada ruxsat etilgan maksimal chegirma, % — misol `100` |
| `receiptPhone` | `string` | ✔ | misol `+998 71 200 00 00` |
| `receiptAddress` | `string` | ✔ | misol `Toshkent sh., Qurilish ko‘chasi 1` |
| `receiptFooter` | `string` | ✔ | misol `Xaridingiz uchun rahmat!` |
| `onboarded` | `boolean` | ✔ | Dastlabki sozlash tugatilganmi |

[↑ Mundarija](#mundarija)

### ShiftDto

Ishlatiladi: [`POST /cash/shifts/open`](endpoints.md#post-cash-shifts-open) (javob 201), [`POST /cash/shifts/close`](endpoints.md#post-cash-shifts-close) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `status` | `open` \| `closed` | ✔ |  |
| `openedAt` | `string` (date-time) | ✔ |  |
| `closedAt` | `string` (date-time) \| `null` | ✔ |  |
| `openingBalance` | `number` | ✔ |  |
| `cashIn` | `number` | ✔ | Smena davomidagi naqd kirim |
| `cashOut` | `number` | ✔ | Smena davomidagi naqd chiqim |
| `expectedBalance` | `number` \| `null` | ✔ | Yopishdagi hisobiy qoldiq |
| `countedBalance` | `number` \| `null` | ✔ |  |
| `difference` | `number` \| `null` | ✔ | Sanalgan − hisobiy |
| `note` | `string` \| `null` | ✔ |  |
| `userId` | `string` \| `null` | ✔ |  |
| `cashierName` | `string` \| `null` | ✔ | Smenani ochgan kassir (xodim ismi) — misol `Bobur Toshmatov` |

[↑ Mundarija](#mundarija)

### ShiftPageDto

Ishlatiladi: [`GET /cash/shifts`](endpoints.md#get-cash-shifts) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `items` | [`ShiftDto`](#shiftdto)[] | ✔ |  |
| `page` | `number` | ✔ |  |
| `pageSize` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `pageCount` | `number` | ✔ |  |

[↑ Mundarija](#mundarija)

### ShiftReportDto

Ishlatiladi: [`GET /cash/shifts/:id/report`](endpoints.md#get-cash-shifts-id-report) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `shift` | [`ShiftDto`](#shiftdto) | ✔ |  |
| `sales` | [`ShiftSalesDto`](#shiftsalesdto) | ✔ |  |
| `returns` | [`ShiftReturnsDto`](#shiftreturnsdto) | ✔ |  |
| `manualIn` | `number` | ✔ | Qo‘lda kiritilgan naqd |
| `manualOut` | `number` | ✔ | Qo‘lda olingan naqd |
| `expenses` | `number` | ✔ | Naqd xarajatlar |
| `debtPaymentsCash` | `number` | ✔ | Naqd qarz to‘lovlari |
| `debtPaymentsBank` | `number` | ✔ | Bank orqali qarz to‘lovlari (kassaga tegmaydi) |
| `supplierPayments` | `number` | ✔ | Ta’minotchiga naqd to‘lovlar |
| `expectedBalance` | `number` | ✔ | Hisobiy qoldiq: ochiq smenada — joriy, yopilganda — yopish paytidagi |

[↑ Mundarija](#mundarija)

### ShiftReturnsDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `count` | `number` | ✔ |  |
| `total` | `number` | ✔ |  |
| `cash` | `number` | ✔ | Kassadan qaytarilgan naqd |

[↑ Mundarija](#mundarija)

### ShiftSalesDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `count` | `number` | ✔ | Cheklar soni (bekor qilinganlarsiz) |
| `total` | `number` | ✔ | Tushum — nasiya cheklar HAM (I4) |
| `cash` | `number` | ✔ | Naqd (kassada qolgan) |
| `card` | `number` | ✔ |  |
| `transfer` | `number` | ✔ |  |
| `credit` | `number` | ✔ | Nasiyaga qolgan qism (sotuv paytida) |
| `cancelled` | `number` | ✔ | Shu smenada yozilib, keyin bekor qilingan cheklar |

[↑ Mundarija](#mundarija)

### StockOperationResultDto

Ishlatiladi: [`POST /stock/intake`](endpoints.md#post-stock-intake) (javob 201), [`POST /stock/writeoff`](endpoints.md#post-stock-writeoff) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `movementId` | `string` | ✔ |  |
| `product` | [`ProductStockDto`](#productstockdto) | ✔ |  |

[↑ Mundarija](#mundarija)

### StockWarningDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `productCount` | `number` | ✔ | Omborda qoldig‘i bor mahsulotlar soni — misol `3` |

[↑ Mundarija](#mundarija)

### SupplierCardDto

Ishlatiladi: [`GET /suppliers/:id`](endpoints.md#get-suppliers-id) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Bekabad Sement` |
| `phone` | `string` | ✔ | misol `+998712001010` |
| `contactPerson` | `string` \| `null` | ✔ | misol `Rustam Aliyev` |
| `address` | `string` \| `null` | ✔ |  |
| `notes` | `string` \| `null` | ✔ |  |
| `email` | `string` \| `null` | ✔ |  |
| `tin` | `string` \| `null` | ✔ | STIR, 9 raqam — misol `201234567` |
| `paymentTermDays` | `number` \| `null` | ✔ | To‘lov muddati, kun — misol `14` |
| `createdAt` | `string` (date-time) | ✔ |  |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |
| `productCount` | `number` | ✔ | Shu ta’minotchi mahsulotlari (o‘chirilmagan) — misol `14` |
| `debt` | `number` |  | Jami qarz — kelgan, to‘lanmagan tovar (I18). Sotuvchi rolida yo‘q |
| `totalPurchased` | `number` |  | Jami xarid — kelgan tovar qiymati (qisman qabul ham). Sotuvchi rolida yo‘q |
| `openOrders` | `number` | ✔ | Ochiq buyurtmalar (kutilayotgan yoki qisman) |
| `orders` | [`SupplierOrderSummaryDto`](#supplierordersummarydto)[] | ✔ | Oxirgi buyurtmalar |
| `payments` | [`SupplierPaymentSummaryDto`](#supplierpaymentsummarydto)[] | ✔ | Oxirgi to‘lovlar |

[↑ Mundarija](#mundarija)

### SupplierDto

Ishlatiladi: [`POST /suppliers`](endpoints.md#post-suppliers) (javob 201), [`PATCH /suppliers/:id`](endpoints.md#patch-suppliers-id) (javob 200), [`POST /suppliers/:id/restore`](endpoints.md#post-suppliers-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Bekabad Sement` |
| `phone` | `string` | ✔ | misol `+998712001010` |
| `contactPerson` | `string` \| `null` | ✔ | misol `Rustam Aliyev` |
| `address` | `string` \| `null` | ✔ |  |
| `notes` | `string` \| `null` | ✔ |  |
| `email` | `string` \| `null` | ✔ |  |
| `tin` | `string` \| `null` | ✔ | STIR, 9 raqam — misol `201234567` |
| `paymentTermDays` | `number` \| `null` | ✔ | To‘lov muddati, kun — misol `14` |
| `createdAt` | `string` (date-time) | ✔ |  |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |
| `productCount` | `number` | ✔ | Shu ta’minotchi mahsulotlari (o‘chirilmagan) — misol `14` |

[↑ Mundarija](#mundarija)

### SupplierListItemDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Bekabad Sement` |
| `phone` | `string` | ✔ | misol `+998712001010` |
| `contactPerson` | `string` \| `null` | ✔ | misol `Rustam Aliyev` |
| `address` | `string` \| `null` | ✔ |  |
| `notes` | `string` \| `null` | ✔ |  |
| `email` | `string` \| `null` | ✔ |  |
| `tin` | `string` \| `null` | ✔ | STIR, 9 raqam — misol `201234567` |
| `paymentTermDays` | `number` \| `null` | ✔ | To‘lov muddati, kun — misol `14` |
| `createdAt` | `string` (date-time) | ✔ |  |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |
| `productCount` | `number` | ✔ | Shu ta’minotchi mahsulotlari (o‘chirilmagan) — misol `14` |
| `debt` | `number` |  | Kreditorlik: kelgan tovar uchun to‘lanmagan (I18). Sotuvchi rolida yo‘q — misol `2500000` |

[↑ Mundarija](#mundarija)

### SupplierOrderSummaryDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `number` | `string` | ✔ | misol `BUY-1001` |
| `status` | `ordered` \| `partial` \| `received` \| `cancelled` | ✔ |  |
| `total` | `number` |  | Sotuvchi rolida yo‘q |
| `paid` | `number` |  | Sotuvchi rolida yo‘q |
| `outstanding` | `number` |  | Faqat kelgan tovar uchun. Sotuvchi rolida yo‘q |
| `date` | `string` | ✔ |  |
| `dueDate` | `string` \| `null` | ✔ |  |

[↑ Mundarija](#mundarija)

### SupplierPaymentDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `poId` | `string` | ✔ |  |
| `amount` | `number` | ✔ |  |
| `method` | `cash` \| `bank` | ✔ |  |
| `date` | `string` | ✔ |  |
| `shiftId` | `string` \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |

[↑ Mundarija](#mundarija)

### SupplierPaymentSummaryDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `poId` | `string` | ✔ |  |
| `amount` | `number` |  | Sotuvchi rolida yo‘q |
| `method` | `cash` \| `bank` | ✔ |  |
| `date` | `string` | ✔ |  |

[↑ Mundarija](#mundarija)

### SupplierRefDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Bekabad Sement` |

[↑ Mundarija](#mundarija)

### SupplierSummaryDto

Ishlatiladi: [`GET /suppliers/summary`](endpoints.md#get-suppliers-summary) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `debt` | `number` |  | Barcha ta’minotchilarga jami qarz. Sotuvchi rolida yo‘q — misol `7800000` |
| `suppliersWithDebt` | `number` | ✔ | Qarzimiz bor ta’minotchilar soni — misol `3` |

[↑ Mundarija](#mundarija)

### TemporaryPasswordDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `email` | `string` | ✔ |  |
| `password` | `string` | ✔ | Bir martalik — birinchi kirishda almashtirilsin |

[↑ Mundarija](#mundarija)

### TenantAccountDto

Ishlatiladi: [`GET /tenants/current`](endpoints.md#get-tenants-current) (javob 200), [`POST /tenants/current/delete`](endpoints.md#post-tenants-current-delete) (javob 200), [`POST /tenants/current/restore`](endpoints.md#post-tenants-current-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ |  |
| `plan` | `free` \| `basic` \| `pro` | ✔ |  |
| `status` | `active` \| `suspended` \| `deleting` | ✔ | `suspended`/`deleting` — faqat o‘qish |
| `planExpiresAt` | `string` (date-time) \| `null` | ✔ |  |
| `deletionScheduledAt` | `string` (date-time) \| `null` | ✔ | Shu vaqtdan keyin ma’lumot to‘liq o‘chadi |
| `limits` | [`PlanLimitsDto`](#planlimitsdto) | ✔ |  |
| `usage` | [`PlanUsageDto`](#planusagedto) | ✔ |  |

[↑ Mundarija](#mundarija)

### TenantSummaryDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Qurilish Mollari` |
| `status` | `active` \| `suspended` \| `deleting` | ✔ | `suspended` (to‘lov kutilmoqda) va `deleting` (o‘chirish muhlatida) — kirish mumkin, yozish yo‘q (423 `TENANT_READ_ONLY`) |

[↑ Mundarija](#mundarija)

### TransferDto

Ishlatiladi: [`POST /stock/transfer`](endpoints.md#post-stock-transfer) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `productId` | `string` (uuid) | ✔ |  |
| `fromWarehouseId` | `string` (uuid) | ✔ |  |
| `toWarehouseId` | `string` (uuid) | ✔ |  |
| `qty` | `number` | ✔ | misol `30` |
| `note` | `string` |  | maks. uzunlik `500`, misol `Skladdan zalga` |

[↑ Mundarija](#mundarija)

### TransferResultDto

Ishlatiladi: [`POST /stock/transfer`](endpoints.md#post-stock-transfer) (javob 201)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `outMovementId` | `string` | ✔ |  |
| `inMovementId` | `string` | ✔ |  |
| `product` | [`ProductStockDto`](#productstockdto) | ✔ |  |

[↑ Mundarija](#mundarija)

### TrendPointDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `bucket` | `string` | ✔ | Kun yoki oy (`YYYY-MM`) — misol `2026-09-23` |
| `revenue` | `number` | ✔ |  |
| `profit` | `number` |  | Sotuvchi rolida yo‘q |

[↑ Mundarija](#mundarija)

### UpdateCategoryDto

Ishlatiladi: [`PATCH /categories/:id`](endpoints.md#patch-categories-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `60`, misol `Tom yopish materiallari` |
| `sortOrder` | `number` |  | Berilmasa — ro‘yxat oxiriga qo‘shiladi — min `0` |

[↑ Mundarija](#mundarija)

### UpdateClientDto

Ishlatiladi: [`PATCH /clients/:id`](endpoints.md#patch-clients-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `200`, misol `Alisher Qodirov` |
| `phone` | `string` |  | Saqlashda raqamlar va boshidagi `+` qoladi — misol `+998 90 123-45-67` |
| `type` | `individual` \| `company` |  | sukut `"individual"` |
| `email` | `string` |  | misol `ali@mail.uz` |
| `status` | `lead` \| `active` \| `inactive` |  | sukut `"lead"` |
| `group` | `retail` \| `wholesale` \| `vip` |  | sukut `"retail"` |
| `creditLimit` | `number` \| `null` |  | Nasiya limiti, butun so‘m; null yoki 0 — cheklanmagan |
| `paymentTermDays` | `number` \| `null` |  | min `0`, max `365` |
| `source` | `string` |  | maks. uzunlik `100`, misol `Instagram` |
| `company` | `string` \| `null` |  | maks. uzunlik `200` |
| `notes` | `string` \| `null` |  | maks. uzunlik `1000` |

[↑ Mundarija](#mundarija)

### UpdateDeliveryDto

Ishlatiladi: [`PATCH /deliveries/:id`](endpoints.md#patch-deliveries-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `address` | `string` |  |  |
| `phone` | `string` |  |  |
| `scheduledDate` | `string` |  |  |
| `driverId` | `string` (uuid) \| `null` |  | `null` — haydovchi olib tashlanadi |
| `fee` | `number` |  | Faqat chekSIZ yetkazishda |
| `note` | `string` \| `null` |  | maks. uzunlik `500` |
| `lat` | `number` \| `null` |  | `null` — joylashuv tozalanadi |
| `lng` | `number` \| `null` |  |  |

[↑ Mundarija](#mundarija)

### UpdateEmployeeDto

Ishlatiladi: [`PATCH /employees/:id`](endpoints.md#patch-employees-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `200`, misol `Bobur Toshmatov` |
| `position` | `string` |  | maks. uzunlik `100`, misol `Kassir` |
| `phone` | `string` |  | misol `+998 90 123 45 67` |
| `status` | `active` \| `on_leave` \| `fired` |  | sukut `"active"` |
| `salary` | `number` |  | Butun so‘m — misol `4500000` |
| `hiredAt` | `string` |  | misol `2026-01-15` |

[↑ Mundarija](#mundarija)

### UpdateExpenseDto

Ishlatiladi: [`PATCH /expenses/:id`](endpoints.md#patch-expenses-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` |  |  |
| `amount` | `number` |  | misol `500000` |
| `method` | `cash` \| `bank` |  | `cash` — kassadan chiqadi (ochiq smena shart, I8) |
| `date` | `string` |  | Berilmasa — bugun — misol `2026-09-23` |
| `note` | `string` |  | maks. uzunlik `500` |

[↑ Mundarija](#mundarija)

### UpdateExpenseTemplateDto

Ishlatiladi: [`PATCH /expense-templates/:id`](endpoints.md#patch-expense-templates-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | misol `Do‘kon ijarasi` |
| `category` | `rent` \| `utilities` \| `salary` \| `transport` \| `tax` \| `other` |  |  |
| `amount` | `number` |  | misol `5000000` |
| `method` | `cash` \| `bank` |  |  |
| `period` | `monthly` \| `weekly` |  |  |
| `dayOfPeriod` | `number` |  | Oylik: 1–28, haftalik: 1–7 (dushanba = 1) — misol `1` |
| `active` | `boolean` |  | sukut `true` |
| `note` | `string` |  | maks. uzunlik `500` |

[↑ Mundarija](#mundarija)

### UpdateProductDto

Ishlatiladi: [`PATCH /products/:id`](endpoints.md#patch-products-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `200`, misol `Portland sement M400` |
| `sku` | `string` |  | Do‘kon ichida noyob — maks. uzunlik `64`, misol `SEM-400` |
| `barcode` | `string` \| `null` |  | maks. uzunlik `64`, misol `4780000000011` |
| `categoryId` | `string` (uuid) \| `null` |  |  |
| `supplierId` | `string` (uuid) \| `null` |  |  |
| `unit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` |  |  |
| `price` | `number` |  | Butun so‘m — misol `60000` |
| `wholesalePrice` | `number` |  | Butun so‘m — misol `55000` |
| `cost` | `number` |  | Butun so‘m — misol `40000` |
| `minStock` | `number` |  | 3 kasr xonagacha — misol `20` |
| `archived` | `boolean` |  |  |
| `altUnit` | `dona` \| `kg` \| `metr` \| `m2` \| `m3` \| `litr` \| `qop` \| `rulon` \| `null` |  | `altFactor` bilan birga beriladi |
| `altFactor` | `number` \| `null` |  | `altUnit` bilan birga beriladi — misol `50` |
| `imageFileId` | `string` (uuid) \| `null` |  | Tasdiqlangan (`ready`) `product_image` fayli; `null` — rasmni olib tashlash |

[↑ Mundarija](#mundarija)

### UpdatePurchaseOrderDto

Ishlatiladi: [`PATCH /purchase-orders/:id`](endpoints.md#patch-purchase-orders-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `warehouseId` | `string` (uuid) |  |  |
| `items` | [`PoItemInputDto`](#poiteminputdto)[] |  | Berilsa — qatorlar TO‘LIQ almashtiriladi |
| `dueDate` | `string` |  |  |
| `note` | `string` |  | maks. uzunlik `1000` |

[↑ Mundarija](#mundarija)

### UpdateQuoteDto

Ishlatiladi: [`PATCH /quotes/:id`](endpoints.md#patch-quotes-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `customerId` | `string` (uuid) \| `null` |  |  |
| `sellerId` | `string` (uuid) |  |  |
| `priceTier` | `retail` \| `wholesale` |  | Yaratishdagi qoida bilan |
| `items` | [`SaleItemInputDto`](#saleiteminputdto)[] |  | Berilsa — qatorlar TO‘LIQ almashtiriladi |
| `discount` | `number` |  |  |
| `validUntil` | `string` |  | misol `2026-10-01` |
| `note` | `string` |  | maks. uzunlik `1000` |
| `status` | `draft` \| `sent` \| `accepted` \| `rejected` |  | `converted` — faqat aylantirish orqali |

[↑ Mundarija](#mundarija)

### UpdateSettingsDto

Ishlatiladi: [`PATCH /settings`](endpoints.md#patch-settings) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `storeName` | `string` |  | maks. uzunlik `120`, misol `Qurilish Mollari` |
| `currency` | `string` |  | maks. uzunlik `10`, misol `so‘m` |
| `taxEnabled` | `boolean` |  |  |
| `taxRate` | `number` |  | min `0`, max `100` |
| `wholesaleEnabled` | `boolean` |  |  |
| `sellerWholesaleEnabled` | `boolean` |  | Sotuvchiga ulgurji narxda sotishni ochish |
| `loyaltyEnabled` | `boolean` |  |  |
| `loyaltyRate` | `number` |  | min `0`, max `100` |
| `maxDiscountPct` | `number` |  | min `0`, max `100` |
| `receiptPhone` | `string` |  | maks. uzunlik `40` |
| `receiptAddress` | `string` |  | maks. uzunlik `200` |
| `receiptFooter` | `string` |  | maks. uzunlik `500` |
| `onboarded` | `boolean` |  |  |

[↑ Mundarija](#mundarija)

### UpdateSupplierDto

Ishlatiladi: [`PATCH /suppliers/:id`](endpoints.md#patch-suppliers-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `200`, misol `Bekabad Sement` |
| `phone` | `string` |  | misol `+998 71 200 10 10` |
| `contactPerson` | `string` \| `null` |  | maks. uzunlik `200` |
| `address` | `string` \| `null` |  | maks. uzunlik `300` |
| `notes` | `string` \| `null` |  | maks. uzunlik `1000` |
| `email` | `string` \| `null` |  | misol `savdo@bekabad.uz` |
| `tin` | `string` \| `null` |  | STIR — aniq 9 raqam — misol `201234567` |
| `paymentTermDays` | `number` \| `null` |  | min `0`, max `365` |

[↑ Mundarija](#mundarija)

### UpdateUserDto

Ishlatiladi: [`PATCH /users/:id`](endpoints.md#patch-users-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `email` | `string` |  | misol `kassir@crm.uz` |
| `role` | `admin` \| `manager` \| `sotuvchi` \| `omborchi` |  | O‘z rolingizni o‘zgartirib bo‘lmaydi |
| `isActive` | `boolean` |  | `false` — kira olmaydi, sessiyalari yopiladi |
| `password` | `string` |  | Parolni tiklash (administrator). Barcha sessiyalar yopiladi |

[↑ Mundarija](#mundarija)

### UpdateWarehouseDto

Ishlatiladi: [`PATCH /warehouses/:id`](endpoints.md#patch-warehouses-id) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `name` | `string` |  | maks. uzunlik `100`, misol `Sklad №2` |
| `address` | `string` \| `null` |  | maks. uzunlik `200`, misol `Toshkent, Sergeli 12` |

[↑ Mundarija](#mundarija)

### UploadTargetDto

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `url` | `string` | ✔ | Imzolangan PUT havolasi (≤ 10 daqiqa) |
| `method` | `string` | ✔ | misol `PUT` |
| `headers` | `Record<string, string>` | ✔ | Aynan shu sarlavhalar bilan yuborilsin |
| `expiresAt` | `string` (date-time) | ✔ |  |

[↑ Mundarija](#mundarija)

### UsageDto

Ishlatiladi: [`GET /files/usage`](endpoints.md#get-files-usage) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `usedBytes` | `number` | ✔ |  |
| `limitBytes` | `number` | ✔ |  |
| `byKind` | `Record<string, number>` | ✔ | tur → bayt |

[↑ Mundarija](#mundarija)

### UserDto

Ishlatiladi: [`POST /users`](endpoints.md#post-users) (javob 201), [`GET /users/:id`](endpoints.md#get-users-id) (javob 200), [`PATCH /users/:id`](endpoints.md#patch-users-id) (javob 200), [`POST /users/:id/restore`](endpoints.md#post-users-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `email` | `string` | ✔ | misol `kassir@crm.uz` |
| `role` | `admin` \| `manager` \| `sotuvchi` \| `omborchi` | ✔ |  |
| `isActive` | `boolean` | ✔ |  |
| `lastLoginAt` | `string` (date-time) \| `null` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |
| `employeeId` | `string` | ✔ |  |
| `name` | `string` | ✔ | Xodimdan — misol `Bobur Toshmatov` |
| `position` | `string` | ✔ | Xodimdan — misol `Kassir` |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |
| `deletedAt` | `string` (date-time) \| `null` | ✔ | O‘chirilgan payt — faqat `?deleted=true` ro‘yxatida to‘la; tiklash — `POST /users/{id}/restore` |

[↑ Mundarija](#mundarija)

### WarehouseDto

Ishlatiladi: [`POST /warehouses`](endpoints.md#post-warehouses) (javob 201), [`GET /warehouses/:id`](endpoints.md#get-warehouses-id) (javob 200), [`PATCH /warehouses/:id`](endpoints.md#patch-warehouses-id) (javob 200), [`POST /warehouses/:id/restore`](endpoints.md#post-warehouses-id-restore) (javob 200)

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `id` | `string` | ✔ |  |
| `name` | `string` | ✔ | misol `Asosiy ombor` |
| `address` | `string` \| `null` | ✔ | misol `Toshkent, Chilonzor 5` |
| `isDefault` | `boolean` | ✔ | Sukut ombor — arxivlab bo‘lmaydi |
| `archived` | `boolean` | ✔ |  |
| `createdAt` | `string` (date-time) | ✔ |  |
| `updatedAt` | `string` (date-time) | ✔ | Versiya — tahrirda `If-Match` ga qo‘yiladi |

[↑ Mundarija](#mundarija)

### WarehouseStockDto

Ishlatiladi: [`GET /warehouses/stock`](endpoints.md#get-warehouses-stock) (javob 200 (massiv))

| Maydon | Tip | Doim bor | Izoh |
|---|---|:-:|---|
| `warehouseId` | `string` (uuid) | ✔ |  |
| `productCount` | `number` | ✔ | Qoldig‘i bor mahsulot turlari — misol `84` |
| `stockValue` | `number` |  | Tovar qiymati tannarxda. Sotuvchi rolida yo‘q — misol `45200000` |

[↑ Mundarija](#mundarija)

### WriteoffDto

Ishlatiladi: [`POST /stock/writeoff`](endpoints.md#post-stock-writeoff) (so‘rov)

| Maydon | Tip | Majburiy | Izoh |
|---|---|:-:|---|
| `productId` | `string` (uuid) | ✔ |  |
| `warehouseId` | `string` (uuid) |  | Berilmasa — joriy ombor |
| `qty` | `number` | ✔ | ASOSIY birlikda, 3 kasrgacha — misol `2` |
| `reason` | `string` | ✔ | Sabab MAJBURIY — maks. uzunlik `500`, misol `Namlikdan yaroqsiz` |

[↑ Mundarija](#mundarija)
