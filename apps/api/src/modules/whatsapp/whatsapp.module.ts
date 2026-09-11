import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { AiModule } from "../ai/ai.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { ENV, type Env } from "../../config/env.schema";
import { WhatsappController } from "./whatsapp.controller";
import { MessageRouter } from "./message-router.service";
import { WhatsAppService } from "./whatsapp.types";
import { EvolutionProvider } from "./providers/evolution.provider";
import { ConsoleProvider } from "./providers/console.provider";
import { EvolutionAdminService } from "./evolution-admin.service";
import { WhatsappHealthService } from "./whatsapp-health.service";

@Module({
  imports: [ReportsModule, AiModule, TransactionsModule],
  controllers: [WhatsappController],
  providers: [
    EvolutionProvider,
    ConsoleProvider,
    {
      provide: WhatsAppService,
      inject: [ENV, EvolutionProvider, ConsoleProvider],
      useFactory: (env: Env, evolution: EvolutionProvider, console: ConsoleProvider) =>
        env.WHATSAPP_PROVIDER === "console" ? console : evolution,
    },
    MessageRouter,
    EvolutionAdminService,
    WhatsappHealthService,
  ],
  exports: [WhatsAppService, MessageRouter, EvolutionAdminService],
})
export class WhatsappModule {}
