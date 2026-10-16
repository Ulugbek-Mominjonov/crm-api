import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MaxLength } from 'class-validator'
import { NormalizeEmail } from '@/common/validation/decorators'
import { MAX_PASSWORD_LENGTH } from '@/modules/auth/password.service'

export class PlatformLoginDto {
  @ApiProperty({ example: 'owner@workspaces.uz' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email formati noto‘g‘ri' })
  @MaxLength(254)
  email!: string

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string
}

export class PlatformAdminDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'owner@workspaces.uz' }) email!: string
  @ApiProperty({ example: 'Ulug‘bek' }) name!: string
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastLoginAt!: Date | null
}

/** Do'kon kirishi bilan bir xil shakl: access token tanada, refresh — `platform_refresh` cookie */
export class PlatformLoginResponseDto {
  @ApiProperty() accessToken!: string
  @ApiProperty({ example: 900, description: 'Soniyada' }) expiresIn!: number
  @ApiProperty({ type: PlatformAdminDto }) admin!: PlatformAdminDto
}
