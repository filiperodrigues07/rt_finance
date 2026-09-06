import { Module } from "@nestjs/common";
import { InvoicesModule } from "../invoices/invoices.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";
import { ImportAiService } from "./import-ai.service";

@Module({
  imports: [InvoicesModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportAiService],
})
export class ImportsModule {}
