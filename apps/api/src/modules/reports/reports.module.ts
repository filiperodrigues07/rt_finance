import { Module } from "@nestjs/common";
import { ChartsModule } from "../charts/charts.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { ReportExportService } from "./report-export.service";

@Module({
  imports: [ChartsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportExportService],
  exports: [ReportsService],
})
export class ReportsModule {}
