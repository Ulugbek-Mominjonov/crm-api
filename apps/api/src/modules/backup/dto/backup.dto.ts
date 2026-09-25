import { ApiProperty } from '@nestjs/swagger'

export class BackupDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string
  @ApiProperty({ example: 'crm-zaxira-2026-09-24.json.gz' }) filename!: string
  @ApiProperty({ example: 48_213, description: 'Siqilgan (gzip) hajm, bayt' }) sizeBytes!: number
  @ApiProperty({ description: 'Imzolangan havola (`attachment`) — `expiresAt` gacha amal qiladi' }) url!: string
  @ApiProperty({ type: String, format: 'date-time', description: 'Yaratilgandan 1 soat' }) expiresAt!: Date
}
