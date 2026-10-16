import { ApiProperty } from '@nestjs/swagger'
import { SystemRole } from '@prisma/client'
import { PERMISSIONS, type Permission } from '@crm/shared'

export class TenantSummaryDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Qurilish Mollari' }) name!: string
  @ApiProperty({
    enum: ['active', 'suspended', 'deleting'],
    description: '`suspended` (to‘lov kutilmoqda) va `deleting` (o‘chirish muhlatida) — kirish mumkin, yozish yo‘q (423 `TENANT_READ_ONLY`)',
  })
  status!: string
}

/**
 * Foydalanuvchi ma'lumoti.
 * `name` va `position` — `employees` jadvalidan (D1): ular User da
 * takrorlanmaydi.
 */
export class AuthUserDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Bobur Toshmatov' }) name!: string
  @ApiProperty({ example: 'admin@crm.uz' }) email!: string
  @ApiProperty({ enum: SystemRole, nullable: true, description: 'Tizim roli kaliti; do‘kon yaratgan rolda — `null`' })
  role!: SystemRole | null
  @ApiProperty() roleId!: string
  @ApiProperty({ example: 'Sotuvchi', description: 'Rol nomi (tizim rolida — `role` kaliti bo‘yicha tarjima qiling)' })
  roleName!: string
  @ApiProperty({
    enum: PERMISSIONS,
    isArray: true,
    description: 'Rol ruxsatlari (administrator — katalogdagi hammasi). Menyu, sahifa va tugmalar SHU ro‘yxatdan',
  })
  permissions!: Permission[]
  @ApiProperty({ example: 'Direktor' }) position!: string
  @ApiProperty() employeeId!: string
  @ApiProperty({ type: TenantSummaryDto }) tenant!: TenantSummaryDto
}

export class LoginResponseDto {
  @ApiProperty() accessToken!: string
  @ApiProperty({ example: 900, description: 'Soniyada' }) expiresIn!: number
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto
}
