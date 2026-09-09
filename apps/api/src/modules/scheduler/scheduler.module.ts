import { Module } from "@nestjs/common";
import { InvoicesModule } from "../invoices/invoices.module";
import { RecurringExpensesModule } from "../recurring-expenses/recurring-expenses.module";
import { BudgetsModule } from "../budgets/budgets.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReportsModule } from "../reports/reports.module";
import { MailModule } from "../mail/mail.module";
import { BackupModule } from "../backup/backup.module";
import { SchedulerService } from "./scheduler.service";

@Module({
  imports: [
    InvoicesModule,
    RecurringExpensesModule,
    BudgetsModule,
    NotificationsModule,
    ReportsModule,
    MailModule,
    BackupModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
