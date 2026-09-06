import { Module } from "@nestjs/common";
import { CategoriesModule } from "../categories/categories.module";
import { CreditCardsModule } from "../credit-cards/credit-cards.module";
import { HintResolver } from "./hint-resolver.service";

/**
 * Resolve "hints" de texto (nomes de categoria/cartão/membro/pagamento) contra os
 * dados reais do household. Usado pela IA (WhatsApp) e pelo lançamento rápido.
 */
@Module({
  imports: [CategoriesModule, CreditCardsModule],
  providers: [HintResolver],
  exports: [HintResolver],
})
export class HintsModule {}
