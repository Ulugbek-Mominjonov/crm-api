import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { IsPhone } from '@/common/validation/phone'
import { Trim } from '@/common/validation/decorators'
import { MAX_PASSWORD_LENGTH } from '../password.service'

/** Yangi do'kon (07 §7.9, T-124): do'kon + egasi (administrator) */
export class RegisterDto {
  @ApiProperty({ example: 'Ali Qurilish Mollari', maxLength: 120 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  storeName!: string

  @ApiProperty({ example: 'Ali Valiyev', maxLength: 120 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  ownerName!: string

  @ApiProperty({ example: '+998901234567' })
  @IsPhone()
  phone!: string

  @ApiProperty({ example: 'ali@dokon.uz' })
  @Trim()
  @IsEmail({}, { message: 'Email formati noto‘g‘ri' })
  @MaxLength(254)
  email!: string

  @ApiProperty({ example: 'Qurilish2026!', description: 'Kamida 8 belgi; ommabop parollar rad etiladi' })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string
}
