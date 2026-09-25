import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'
import { AuditedInService } from '@/modules/audit/audit.decorator'
import { CurrentUser, type AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { AllowReadOnlyTenant } from '@/modules/tenants/read-only.interceptor'
import { AccountService } from './account.service'
import { DeleteTenantDto, TenantAccountDto } from './dto/account.dto'

/** Do'kon hisobi: tarif, chegaralar, o'chirish (E16). Faqat administrator — servis tekshiradi */
@ApiTags('account')
@ApiBearerAuth()
@Controller('tenants/current')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  @ApiOperation({ summary: 'Tarif, holat, chegaralar va ishlatilgan hajm' })
  @ApiOkResponse({ type: TenantAccountDto })
  current(@CurrentUser() user: AuthContext): Promise<TenantAccountDto> {
    return this.account.current(user)
  }

  @Post('delete')
  @HttpCode(200)
  @AuditedInService()
  @AllowReadOnlyTenant()
  @ApiOperation({
    summary: 'Do‘konni o‘chirish (30 kun muhlat)',
    description: 'Parol bilan tasdiq. Muhlat davomida faqat o‘qish va zaxira olish; keyin ma’lumot va fayllar to‘liq o‘chadi.',
  })
  @ApiOkResponse({ type: TenantAccountDto })
  @ApiUnauthorizedResponse({ description: 'AUTH_INVALID_CREDENTIALS — parol noto‘g‘ri', type: ApiErrorDto })
  requestDeletion(@Body() dto: DeleteTenantDto, @CurrentUser() user: AuthContext): Promise<TenantAccountDto> {
    return this.account.requestDeletion(dto.password, user)
  }

  @Post('restore')
  @HttpCode(200)
  @AuditedInService()
  @AllowReadOnlyTenant()
  @ApiOperation({ summary: 'O‘chirish so‘rovini bekor qilish' })
  @ApiOkResponse({ type: TenantAccountDto })
  cancelDeletion(@CurrentUser() user: AuthContext): Promise<TenantAccountDto> {
    return this.account.cancelDeletion(user)
  }
}
