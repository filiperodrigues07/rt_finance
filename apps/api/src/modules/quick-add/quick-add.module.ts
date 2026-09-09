import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { HintsModule } from "../hints/hints.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { QuickAddController } from "./quick-add.controller";
import { QuickAddService } from "./quick-add.service";

/**
 * `POST /transactions/quick` — lançamento rápido do painel com fallback de IA.
 * Fica num módulo próprio para reaproveitar `AIService` (do bot) sem criar
 * dependência circular entre transações e IA.
 */
@Module({
  imports: [AiModule, HintsModule, TransactionsModule],
  controllers: [QuickAddController],
  providers: [QuickAddService],
})
export class QuickAddModule {}
