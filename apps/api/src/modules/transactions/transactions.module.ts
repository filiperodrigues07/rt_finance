import { Module } from "@nestjs/common";
import { TransactionsController } from "./transactions.controller";
import { TransactionsService } from "./transactions.service";
import { TransactionAttachmentsService } from "./transaction-attachments.service";
import { TransactionCommentsService } from "./transaction-comments.service";
import { InvoicesModule } from "../invoices/invoices.module";
import { HintsModule } from "../hints/hints.module";

@Module({
  imports: [InvoicesModule, HintsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionAttachmentsService, TransactionCommentsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
