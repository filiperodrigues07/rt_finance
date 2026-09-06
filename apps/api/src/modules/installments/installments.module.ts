import { Module } from "@nestjs/common";
import { InstallmentsController } from "./installments.controller";
import { InstallmentsService } from "./installments.service";
import { InvoicesModule } from "../invoices/invoices.module";

@Module({
  imports: [InvoicesModule],
  controllers: [InstallmentsController],
  providers: [InstallmentsService],
  exports: [InstallmentsService],
})
export class InstallmentsModule {}
