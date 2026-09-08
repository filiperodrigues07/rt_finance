import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";

import { ConfigModule } from "./config/config.module";
import { ENV, type Env } from "./config/env.schema";
import { PrismaModule } from "./lib/prisma.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";

import { AuthModule } from "./modules/auth/auth.module";
import { HouseholdsModule } from "./modules/households/households.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { AccountsModule } from "./modules/accounts/accounts.module";
import { CreditCardsModule } from "./modules/credit-cards/credit-cards.module";
import { InvoicesModule } from "./modules/invoices/invoices.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";
import { InstallmentsModule } from "./modules/installments/installments.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { RecurringExpensesModule } from "./modules/recurring-expenses/recurring-expenses.module";
import { BudgetsModule } from "./modules/budgets/budgets.module";
import { GoalsModule } from "./modules/goals/goals.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ActivityModule } from "./modules/activity/activity.module";
import { ChartsModule } from "./modules/charts/charts.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { AiModule } from "./modules/ai/ai.module";
import { WhatsappModule } from "./modules/whatsapp/whatsapp.module";
import { ImportsModule } from "./modules/imports/imports.module";
import { AdminModule } from "./modules/admin/admin.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req) =>
            (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
          transport:
            env.NODE_ENV === "development"
              ? { target: "pino-pretty", options: { singleLine: true, translateTime: "SYS:HH:MM:ss" } }
              : undefined,
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
            ],
            remove: true,
          },
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),

    AuthModule,
    HouseholdsModule,
    CategoriesModule,
    AccountsModule,
    CreditCardsModule,
    InvoicesModule,
    TransactionsModule,
    InstallmentsModule,
    ReportsModule,
    RecurringExpensesModule,
    BudgetsModule,
    GoalsModule,
    NotificationsModule,
    ActivityModule,
    ChartsModule,
    AiModule,
    WhatsappModule,
    ImportsModule,
    SchedulerModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
