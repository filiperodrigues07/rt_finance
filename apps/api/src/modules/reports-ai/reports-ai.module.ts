import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ReportsModule } from "../reports/reports.module";
import { ReportsAiController } from "./reports-ai.controller";
import { ReportsAiService } from "./reports-ai.service";

/**
 * Análise dos relatórios em linguagem natural. Módulo próprio para reusar
 * `AIService` (do bot) sem dependência circular com `ReportsModule`.
 */
@Module({
  imports: [AiModule, ReportsModule],
  controllers: [ReportsAiController],
  providers: [ReportsAiService],
})
export class ReportsAiModule {}
