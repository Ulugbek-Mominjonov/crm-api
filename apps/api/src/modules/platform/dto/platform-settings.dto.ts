import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'

export const REGISTRATION_MODES = ['open', 'closed'] as const
export type RegistrationMode = (typeof REGISTRATION_MODES)[number]

/** Platforma sozlamasi (T-138) — bitta qator */
export class PlatformSettingsDto {
  @ApiProperty({
    enum: REGISTRATION_MODES,
    description: '`open` — har kim do‘kon ochadi (`POST /tenants/register`); `closed` — faqat egasi paneli ochadi, ochiq yo‘l 403 `REGISTRATION_CLOSED`',
  })
  registrationMode!: RegistrationMode

  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date
  @ApiProperty({ nullable: true, type: String, description: 'Oxirgi o‘zgartirgan egasi hisobi (nomi)' }) updatedBy!: string | null
}

export class UpdatePlatformSettingsDto {
  @ApiProperty({ enum: REGISTRATION_MODES })
  @IsIn(REGISTRATION_MODES)
  registrationMode!: RegistrationMode
}
