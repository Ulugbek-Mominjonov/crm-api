import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { SystemRole } from '@prisma/client'
import { PERMISSION_GROUPS, PERMISSIONS, type Permission, type PermissionGroup, type Resource } from '@crm/shared'
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import { Trim } from '@/common/validation/decorators'

export const ROLE_NAME_MAX = 50

export class RoleDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Katta kassir' }) name!: string
  @ApiProperty({
    enum: SystemRole,
    nullable: true,
    description:
      'Tizim roli kaliti; do‘kon yaratgan rolda — `null`. `admin` — o‘zgarmaydi; boshqa tizim rollarida faqat ruxsatlar ' +
      'o‘zgaradi (nom — doimiy), ular o‘chirilmaydi',
  })
  key!: SystemRole | null
  @ApiProperty({
    enum: PERMISSIONS,
    isArray: true,
    description: 'Katalog tartibida. Administrator — doim katalogdagi hammasi',
  })
  permissions!: Permission[]
  @ApiProperty({ example: 3, description: 'Faol va faolsiz foydalanuvchilar (o‘chirilganlarsiz)' }) usersCount!: number
  @ApiProperty({ type: String, format: 'date-time', description: 'Versiya — tahrirda `If-Match` ga qo‘yiladi' })
  updatedAt!: Date
}

export class CreateRoleDto {
  @ApiProperty({ example: 'Katta kassir', maxLength: ROLE_NAME_MAX, description: 'Do‘konda noyob (katta-kichik harf farqsiz)' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_NAME_MAX)
  name!: string

  @ApiProperty({
    enum: PERMISSIONS,
    isArray: true,
    example: ['sales.create', 'sales.return', 'customers.view'],
    description:
      'Server normallashtiradi: takror olib tashlanadi, bo‘limning istalgan amali uning `view` ini qo‘shadi; bog‘liqliklar: ' +
      '`sales.create`, `quotes.create/edit`, `stock.view` → `products.view`; `purchases.view` → `suppliers.view` + ' +
      '`products.view`; `messages.view` → `customers.view`; `profit.view` → `cost.view`. Javobda — saqlangan (to‘liq) ro‘yxat',
  })
  @IsArray()
  @ArrayMaxSize(PERMISSIONS.length)
  @IsIn(PERMISSIONS, { each: true })
  permissions!: Permission[]
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class DeleteRoleQueryDto {
  @ApiPropertyOptional({
    description: 'Rolda foydalanuvchi bo‘lsa — SHART: ular shu rolga o‘tkaziladi (o‘chirilgan hisoblar ham)',
  })
  @IsOptional()
  @IsUUID()
  replaceWith?: string
}

class CatalogActionDto {
  @ApiProperty({ example: 'return' }) key!: string
  @ApiProperty({ enum: PERMISSIONS, example: 'sales.return' }) permission!: Permission
  @ApiProperty({ example: 'Qaytarish', description: 'O‘zbekcha nom (mijozda tarjima bo‘lmasa)' }) label!: string
}

class CatalogResourceDto {
  @ApiProperty({ example: 'sales' }) key!: Resource
  @ApiProperty({ enum: Object.keys(PERMISSION_GROUPS), example: 'sales' }) group!: PermissionGroup
  @ApiProperty({ example: 'Sotuvlar' }) label!: string
  @ApiProperty({ type: [CatalogActionDto], description: 'Birinchisi doim `view`' }) actions!: CatalogActionDto[]
}

class CatalogGroupDto {
  @ApiProperty({ enum: Object.keys(PERMISSION_GROUPS), example: 'sales' }) key!: PermissionGroup
  @ApiProperty({ example: 'Savdo' }) label!: string
}

export class PermissionCatalogDto {
  @ApiProperty({ type: [CatalogGroupDto], description: 'Rol oynasidagi bo‘limlar tartibi' }) groups!: CatalogGroupDto[]
  @ApiProperty({ type: [CatalogResourceDto], description: 'Bo‘limlar (modullar) va amallari, oynadagi tartibda' })
  resources!: CatalogResourceDto[]
}
