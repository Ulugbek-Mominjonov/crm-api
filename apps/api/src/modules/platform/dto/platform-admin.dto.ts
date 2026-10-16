import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { NormalizeEmail, Trim } from '@/common/validation/decorators'
import { PLATFORM_ROLES, type PlatformRole } from '@/modules/auth/decorators/platform.decorator'
import { MAX_PASSWORD_LENGTH } from '@/modules/auth/password.service'

const MAX_NAME_LENGTH = 120

/** Yangi egasi hisobi yoki operator (T-139) — faqat egasi yaratadi */
export class CreatePlatformAdminDto {
  @ApiProperty({ example: 'operator@workspaces.uz' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email formati noto‘g‘ri' })
  @MaxLength(254)
  email!: string

  @ApiProperty({ example: 'Dilnoza', maxLength: MAX_NAME_LENGTH })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string

  @ApiProperty({ description: 'Kamida 8 belgi; ommabop parollar rad etiladi. Operatorga birinchi kirishda aytiladi' })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string

  @ApiProperty({ enum: PLATFORM_ROLES, description: '`operator` — do‘konni o‘chira olmaydi, hisob va sozlamani boshqarmaydi' })
  @IsIn(PLATFORM_ROLES)
  role!: PlatformRole
}

export class UpdatePlatformAdminDto {
  @ApiPropertyOptional({ maxLength: MAX_NAME_LENGTH })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name?: string

  @ApiPropertyOptional({ enum: PLATFORM_ROLES, description: 'O‘z rolini o‘zgartirib bo‘lmaydi (422 `SELF_ROLE_CHANGE`)' })
  @IsOptional()
  @IsIn(PLATFORM_ROLES)
  role?: PlatformRole

  @ApiPropertyOptional({ description: '`false` — kira olmaydi, sessiyalari yopiladi. O‘zini faolsizlantirib bo‘lmaydi (422 `SELF_DELETE`)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
