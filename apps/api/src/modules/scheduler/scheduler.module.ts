import { Module } from "@nestjs/common";
import { InvoicesModule } from "../invoices/invoices.module";
import { BudgetsModule } from "../budgets/budgets.module";
import { GoalsModule } from "../goals/goals.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReportsModule } from "../reports/reports.module";
import { MailModule } from "../mail/mail.module";
import { BackupModule } from "../backup/backup.module";
import { SchedulerService } from "./scheduler.service";

@Module({
  imports: [
    InvoicesModule,
    BudgetsModule,
    GoalsModule,
    NotificationsModule,
    ReportsModule,
    MailModule,
    BackupModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
