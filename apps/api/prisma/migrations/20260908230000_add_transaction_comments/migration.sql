-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TRANSACTION_COMMENT';

-- CreateTable
CREATE TABLE "TransactionComment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "authorMemberId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TransactionComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionComment_transactionId_createdAt_idx" ON "TransactionComment"("transactionId", "createdAt");

-- CreateIndex
CREATE INDEX "TransactionComment_authorMemberId_idx" ON "TransactionComment"("authorMemberId");

-- AddForeignKey
ALTER TABLE "TransactionComment" ADD CONSTRAINT "TransactionComment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionComment" ADD CONSTRAINT "TransactionComment_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
