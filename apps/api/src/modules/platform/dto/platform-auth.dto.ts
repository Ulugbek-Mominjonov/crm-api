import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { NormalizeEmail, Trim } from '@/common/validation/decorators'
import { PLATFORM_ROLES, type PlatformRole } from '@/modules/auth/decorators/platform.decorator'
import { MAX_PASSWORD_LENGTH } from '@/modules/auth/password.service'

const TOTP_CODE_PATTERN = /^\d{6}$/

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

  @ApiPropertyOptional({
    example: '123456',
    description: 'Ikki bosqichli kirish yoqilgan hisobda majburiy: autentifikator ilovasidagi 6 raqam. Yo‘q bo‘lsa — 401 `AUTH_TOTP_REQUIRED`',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(TOTP_CODE_PATTERN, { message: 'Tasdiqlash kodi — 6 raqam' })
  totpCode?: string
}

export class PlatformAdminDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'owner@workspaces.uz' }) email!: string
  @ApiProperty({ example: 'Ulug‘bek' }) name!: string
  @ApiProperty({ enum: PLATFORM_ROLES, description: '`owner` — hammasi; `operator` — do‘konni o‘chira olmaydi, hisob va sozlamani boshqarmaydi' })
  role!: PlatformRole
  @ApiProperty({ description: 'Faolsiz hisob kira olmaydi, ochiq sessiyalari yopilgan' }) isActive!: boolean
  @ApiProperty({ description: 'Ikki bosqichli kirish (TOTP) yoqilgan' }) totpEnabled!: boolean
  @ApiProperty({ description: 'Telegram botga ulangan — egasi xabarlari keladi' }) telegramLinked!: boolean
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastLoginAt!: Date | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

/** Do'kon kirishi bilan bir xil shakl: access token tanada, refresh — `platform_refresh` cookie */
export class PlatformLoginResponseDto {
  @ApiProperty() accessToken!: string
  @ApiProperty({ example: 900, description: 'Soniyada' }) expiresIn!: number
  @ApiProperty({ type: PlatformAdminDto }) admin!: PlatformAdminDto
}

/** TOTP sozlash boshlandi: ilovaga QR (`otpauthUrl`) yoki qo'lda `secret` */
export class TotpSetupDto {
  @ApiProperty({ example: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', description: 'Base32 — ilovaga qo‘lda kiritish uchun' }) secret!: string
  @ApiProperty({
    example: 'otpauth://totp/CRM%20egasi:owner%40workspaces.uz?secret=JBSW…&issuer=CRM+egasi&algorithm=SHA1&digits=6&period=30',
    description: 'Frontend shundan QR kod chizadi (Google Authenticator, Aegis, 1Password …)',
  })
  otpauthUrl!: string
}

export class TotpCodeDto {
  @ApiProperty({ example: '123456', description: 'Autentifikator ilovasidagi joriy 6 raqam' })
  @Trim()
  @IsString()
  @Matches(TOTP_CODE_PATTERN, { message: 'Tasdiqlash kodi — 6 raqam' })
  code!: string
}
