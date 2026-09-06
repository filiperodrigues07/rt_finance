-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "paidAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "Transaction_householdId_status_dueDate_idx" ON "Transaction"("householdId", "status", "dueDate");
