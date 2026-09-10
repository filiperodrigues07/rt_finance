-- AlterEnum
ALTER TYPE "TransactionSource" ADD VALUE 'ADJUSTMENT';

-- AlterTable
ALTER TABLE "CreditCardInvoice" ADD COLUMN     "openingBalanceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reconciledAt" TIMESTAMPTZ(6),
ADD COLUMN     "statementTotalCents" INTEGER;
