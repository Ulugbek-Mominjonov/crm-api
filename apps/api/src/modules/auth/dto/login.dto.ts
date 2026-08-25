import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import { MAX_PASSWORD_LENGTH } from '../password.service'

export class LoginDto {
  @ApiProperty({ example: 'admin@crm.uz' })
  @IsEmail({}, { message: 'Email formati noto‘g‘ri' })
  @MaxLength(254)
  email!: string

  @ApiProperty({ example: 'Qurilish2026!' })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string

  @ApiPropertyOptional({
    description:
      'Bitta email bir nechta do‘konda bo‘lsa, qaysi biriga kirish. ' +
      'Kerak bo‘lsa server AUTH_TENANT_REQUIRED xatosida ro‘yxatni beradi.',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string
}
