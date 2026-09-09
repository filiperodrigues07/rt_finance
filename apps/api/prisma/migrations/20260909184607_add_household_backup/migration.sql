-- DropIndex
DROP INDEX "Account_memberId_idx";

-- DropIndex
DROP INDEX "CreditCard_memberId_idx";

-- CreateTable
CREATE TABLE "HouseholdBackup" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "HouseholdBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HouseholdBackup_householdId_createdAt_idx" ON "HouseholdBackup"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "HouseholdBackup" ADD CONSTRAINT "HouseholdBackup_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
