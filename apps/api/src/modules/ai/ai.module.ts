import { Module } from "@nestjs/common";
import { ENV, type Env } from "../../config/env.schema";
import { CategoriesModule } from "../categories/categories.module";
import { CreditCardsModule } from "../credit-cards/credit-cards.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { InstallmentsModule } from "../installments/installments.module";
import { ReportsModule } from "../reports/reports.module";
import { RecurringExpensesModule } from "../recurring-expenses/recurring-expenses.module";
import { ChartsModule } from "../charts/charts.module";
import { HintsModule } from "../hints/hints.module";

import { AIService } from "./ai.types";
import { NvidiaProvider } from "./providers/nvidia.provider";
import { MockAiProvider } from "./providers/mock.provider";
import { AiConversationService } from "./ai-conversation.service";
import { QueryExecutor } from "./query-executor.service";
import { FinanceAssistant } from "./finance-assistant.service";
import { TranscriptionService } from "./transcription.service";

@Module({
  imports: [
    CategoriesModule,
    CreditCardsModule,
    TransactionsModule,
    InstallmentsModule,
    ReportsModule,
    RecurringExpensesModule,
    ChartsModule,
    HintsModule,
  ],
  providers: [
    NvidiaProvider,
    MockAiProvider,
    {
      provide: AIService,
      inject: [ENV, NvidiaProvider, MockAiProvider],
      useFactory: (env: Env, nvidia: NvidiaProvider, mock: MockAiProvider) => {
        if (env.AI_PROVIDER === "nvidia" && env.NVIDIA_API_KEY) return nvidia;
        return mock;
      },
    },
    AiConversationService,
    QueryExecutor,
    FinanceAssistant,
    TranscriptionService,
  ],
  exports: [FinanceAssistant, AIService, TranscriptionService],
})
export class AiModule {}
