import { Module } from '@nestjs/common'
import { ReportViewJobs } from './report-views.jobs'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportViewJobs],
})
export class ReportsModule {}
