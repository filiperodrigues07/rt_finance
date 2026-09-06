import { Module } from "@nestjs/common";
import { CreditCardsController } from "./credit-cards.controller";
import { CreditCardsService } from "./credit-cards.service";
import { InvoicesModule } from "../invoices/invoices.module";

@Module({
  imports: [InvoicesModule],
  controllers: [CreditCardsController],
  providers: [CreditCardsService],
  exports: [CreditCardsService],
})
export class CreditCardsModule {}
