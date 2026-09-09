-- Remove a feature de recorrência; adiciona série de contas a pagar mensais.

-- DropForeignKey / DropTable
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_recurringExpenseId_fkey";
DROP TABLE IF EXISTS "RecurringRun";
DROP TABLE IF EXISTS "RecurringExpense";
DROP TYPE IF EXISTS "RecurrenceFrequency";

-- DropColumn
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "recurringExpenseId";

-- AddColumn: grupo de uma série de contas a pagar geradas de uma vez
ALTER TABLE "Transaction" ADD COLUMN "scheduleGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_scheduleGroupId_idx" ON "Transaction"("scheduleGroupId");
