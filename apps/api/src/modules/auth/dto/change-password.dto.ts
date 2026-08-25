import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'
import { MAX_PASSWORD_LENGTH } from '../password.service'

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword!: string

  @ApiProperty({ description: 'Kamida 8 belgi; ommabop parollar rad etiladi' })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword!: string
}
