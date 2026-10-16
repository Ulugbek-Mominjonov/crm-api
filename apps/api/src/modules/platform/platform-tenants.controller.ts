import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { ApiPagedResponse } from '@/common/crud/api-paged-response.decorator'
import type { Paged } from '@/common/crud/paging'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentAdmin, type PlatformContext } from '@/modules/auth/decorators/platform.decorator'
import { GrantPlanDto, PlatformInvoiceDto, PlatformInvoicesQueryDto } from './dto/platform-billing.dto'
import {
  BlockTenantDto, CreateTenantDto, PlatformTenantDto, PlatformTenantsQueryDto, PlatformTenantUserDto,
  ResetUserPasswordDto, UpdateTenantDto,
} from './dto/platform-tenant.dto'
import { PlatformBillingService } from './platform-billing.service'
import { PlatformRoute } from './platform-route.decorator'
import { PlatformTenantsService } from './platform-tenants.service'

const TRANSITION_422 = { status: 422, description: 'INVALID_STATUS_TRANSITION — holat bunga yo‘l qo‘ymaydi', type: ApiErrorDto }

/** Egasi paneli — do'konlar (T-135) */
@PlatformRoute()
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(
    private readonly tenants: PlatformTenantsService,
    private readonly billing: PlatformBillingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Do‘konlar ro‘yxati', description: 'Nom bo‘yicha qidiruv, holat/tarif filtri, muddati tugayotganlar; har qatorda ishlatilgan resurslar, administrator aloqasi, so‘nggi faollik.' })
  @ApiPagedResponse(PlatformTenantDto)
  list(@Query() query: PlatformTenantsQueryDto): Promise<Paged<PlatformTenantDto>> {
    return this.tenants.list(query)
  }

  @Post()
  @AuditedInService()
  @ApiOperation({
    summary: 'Do‘kon ochish',
    description: 'Ro‘yxatdan o‘tish bilan bir xil: do‘kon, sozlama, sukut ombor, tizim rollari va egasi (administrator) hisobi. Pullik boshlang‘ich tarif — `bonus` hisob-faktura (summa 0).',
  })
  @ApiCreatedResponse({ type: PlatformTenantDto })
  create(@Body() dto: CreateTenantDto, @CurrentAdmin() admin: PlatformContext): Promise<PlatformTenantDto> {
    return this.tenants.create(dto, admin.adminId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Do‘kon kartasi' })
  @ApiOkResponse({ type: PlatformTenantDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', type: ApiErrorDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformTenantDto> {
    return this.tenants.get(id)
  }

  @Patch(':id')
  @AuditedInService()
  @ApiOperation({ summary: 'Nom va egasi izohi' })
  @ApiOkResponse({ type: PlatformTenantDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto): Promise<PlatformTenantDto> {
    return this.tenants.update(id, dto)
  }

  @Post(':id/block')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({
    summary: 'Do‘konni bloklash',
    description: 'Do‘kon faqat o‘qiydi (423 `TENANT_READ_ONLY`, `meta.status: blocked`), kirish ishlaydi. To‘lov blokni OCHMAYDI, do‘kon o‘zi olib tashlay olmaydi. Sabab — do‘kon administratoriga ko‘rinadi.',
  })
  @ApiOkResponse({ type: PlatformTenantDto })
  block(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BlockTenantDto): Promise<PlatformTenantDto> {
    return this.tenants.block(id, dto)
  }

  @Post(':id/unblock')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({ summary: 'Blokdan chiqarish', description: 'Tarif muddati o‘tgan bo‘lsa — `suspended`, aks holda `active`.' })
  @ApiOkResponse({ type: PlatformTenantDto })
  @ApiResponse(TRANSITION_422)
  unblock(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformTenantDto> {
    return this.tenants.unblock(id)
  }

  @Post(':id/plan')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({
    summary: 'Tarif berish / qo‘lda to‘lov',
    description:
      'Pullik tarif — `paid` hisob-faktura (`provider`: `cash`, `transfer`, `bonus`) va tarif Payme/Click to‘lovi bilan bir xil qoidada uzayadi ' +
      '(o‘sha tarif — joriy muddat oxiridan, boshqa tarif — hozirdan; `suspended` ochiladi, `blocked` ochilmaydi). `free` — tarif darhol bepul, muddat o‘chadi.',
  })
  @ApiOkResponse({ type: PlatformTenantDto })
  grantPlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GrantPlanDto, @CurrentAdmin() admin: PlatformContext): Promise<PlatformTenantDto> {
    return this.tenants.grantPlan(id, dto, admin.adminId)
  }

  @Post(':id/delete')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({ summary: 'Do‘konni o‘chirish (30 kun muhlat)', description: 'Muhlatda faqat o‘qish; keyin ma’lumot va fayllar to‘liq o‘chadi. Muhlat ichida `restore` qaytaradi.' })
  @ApiOkResponse({ type: PlatformTenantDto })
  @ApiResponse(TRANSITION_422)
  requestDeletion(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformTenantDto> {
    return this.tenants.requestDeletion(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @AuditedInService()
  @ApiOperation({ summary: 'O‘chirishni bekor qilish', description: 'Qaytadigan holat: blok bo‘lsa `blocked`, tarif muddati o‘tgan bo‘lsa `suspended`, aks holda `active`.' })
  @ApiOkResponse({ type: PlatformTenantDto })
  @ApiResponse(TRANSITION_422)
  cancelDeletion(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformTenantDto> {
    return this.tenants.cancelDeletion(id)
  }

  @Get(':id/users')
  @ApiOperation({ summary: 'Do‘kon kirish hisoblari', description: 'Qo‘llab-quvvatlash: kim kira oladi, oxirgi kirish; parolni tiklash uchun `userId`.' })
  @ApiOkResponse({ type: [PlatformTenantUserDto] })
  users(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformTenantUserDto[]> {
    return this.tenants.users(id)
  }

  @Post(':id/users/:userId/reset-password')
  @HttpCode(204)
  @AuditedInService()
  @ApiOperation({ summary: 'Do‘kon hisobiga yangi parol', description: 'Foydalanuvchining barcha sessiyalari yopiladi; do‘kon jurnalida «Platforma» yozuvi qoladi.' })
  @ApiResponse({ status: 204, description: 'Parol o‘zgartirildi' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND — do‘kon yoki hisob', type: ApiErrorDto })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ResetUserPasswordDto,
  ): Promise<void> {
    await this.tenants.resetPassword(id, userId, dto.password)
  }

  @Get(':id/invoices')
  @ApiOperation({ summary: 'Do‘kon hisob-fakturalari', description: 'Onlayn (Payme/Click) va qo‘lda yozilgan to‘lovlar — bitta ro‘yxat.' })
  @ApiPagedResponse(PlatformInvoiceDto)
  invoices(@Param('id', ParseUUIDPipe) id: string, @Query() query: PlatformInvoicesQueryDto): Promise<Paged<PlatformInvoiceDto>> {
    return this.billing.invoices({ ...query, tenantId: id })
  }
}
