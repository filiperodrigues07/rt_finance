import { Module } from "@nestjs/common";
import { TransactionsController } from "./transactions.controller";
import { TransactionsService } from "./transactions.service";
import { TransactionAttachmentsService } from "./transaction-attachments.service";
import { TransactionCommentsService } from "./transaction-comments.service";
import { InvoicesModule } from "../invoices/invoices.module";

@Module({
  imports: [InvoicesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionAttachmentsService, TransactionCommentsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
