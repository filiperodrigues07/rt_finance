import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { BudgetsController } from "./budgets.controller";
import { BudgetsService } from "./budgets.service";

@Module({
  imports: [NotificationsModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
