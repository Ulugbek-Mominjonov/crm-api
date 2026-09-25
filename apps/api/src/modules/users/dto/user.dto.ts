import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Role, type Prisma } from '@prisma/client'
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { byField, sortValues, type SortDir, type SortMap } from '@/common/crud/sort'
import { NormalizeEmail, ToBoolean } from '@/common/validation/decorators'
import { MAX_PASSWORD_LENGTH } from '@/modules/auth/password.service'

export const USER_SORT = {
  id: byField('id'),
  // Ism xodim yozuvida (D1) — saralash ham o'sha yerdan
  name: (dir: SortDir) => ({ employee: { name: dir } }),
  email: byField('email'),
  createdAt: byField('createdAt'),
  lastLoginAt: byField('lastLoginAt'),
} satisfies SortMap<Prisma.UserOrderByWithRelationInput>

const ROLES = Object.values(Role)

/**
 * Kirish hisobi. `name` va `position` — XODIM yozuvidan (D1): ular bu
 * yerda saqlanmaydi, faqat ko'rsatiladi.
 */
export class UserDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'kassir@crm.uz' }) email!: string
  @ApiProperty({ enum: Role }) role!: Role
  @ApiProperty() isActive!: boolean
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastLoginAt!: Date | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty() employeeId!: string
  @ApiProperty({ example: 'Bobur Toshmatov', description: 'Xodimdan' }) name!: string
  @ApiProperty({ example: 'Kassir', description: 'Xodimdan' }) position!: string
  @ApiProperty({ type: String, format: 'date-time', description: 'Versiya — tahrirda `If-Match` ga qo‘yiladi' })
  updatedAt!: Date
}

export class CreateUserDto {
  @ApiProperty({ description: 'Mavjud xodim — kirish hisobi DOIM xodimga tegishli (D1)' })
  @IsUUID()
  employeeId!: string

  @ApiProperty({ example: 'kassir@crm.uz' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email formati noto‘g‘ri' })
  @MaxLength(254)
  email!: string

  @ApiProperty({ description: 'Kamida 8 belgi; ommabop parollar rad etiladi' })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string

  @ApiProperty({ enum: Role })
  @IsIn(ROLES)
  role!: Role
}

/** Xodim bog'lanishi o'zgarmaydi — boshqa odamga hisob yangi yaratiladi */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'kassir@crm.uz' })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email formati noto‘g‘ri' })
  @MaxLength(254)
  email?: string

  @ApiPropertyOptional({ enum: Role, description: 'O‘z rolingizni o‘zgartirib bo‘lmaydi' })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role

  @ApiPropertyOptional({ description: '`false` — kira olmaydi, sessiyalari yopiladi' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({ description: 'Parolni tiklash (administrator). Barcha sessiyalar yopiladi' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password?: string
}

export class UserListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: sortValues(USER_SORT), default: 'name' })
  @IsOptional()
  @IsIn(sortValues(USER_SORT))
  sort?: string

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean
}
