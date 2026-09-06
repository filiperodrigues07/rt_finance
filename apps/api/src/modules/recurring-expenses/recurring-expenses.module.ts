import { Module } from "@nestjs/common";
import { InvoicesModule } from "../invoices/invoices.module";
import { RecurringExpensesController } from "./recurring-expenses.controller";
import { RecurringExpensesService } from "./recurring-expenses.service";

@Module({
  imports: [InvoicesModule],
  controllers: [RecurringExpensesController],
  providers: [RecurringExpensesService],
  exports: [RecurringExpensesService],
})
export class RecurringExpensesModule {}
