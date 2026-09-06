import { Module } from "@nestjs/common";
import { InvoicesModule } from "../invoices/invoices.module";
import { RecurringExpensesModule } from "../recurring-expenses/recurring-expenses.module";
import { BudgetsModule } from "../budgets/budgets.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReportsModule } from "../reports/reports.module";
import { SchedulerService } from "./scheduler.service";

@Module({
  imports: [
    InvoicesModule,
    RecurringExpensesModule,
    BudgetsModule,
    NotificationsModule,
    ReportsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
