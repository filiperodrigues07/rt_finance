-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('OFX_BANK', 'OFX_CARD', 'PDF_BANK', 'PDF_CARD');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PARSING', 'REVIEW', 'COMMITTED', 'FAILED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ImportRowState" AS ENUM ('AUTO_COMMITTED', 'NEEDS_REVIEW', 'COMMITTED', 'SKIPPED', 'DUPLICATE');

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "fileName" TEXT NOT NULL,
    "accountId" TEXT,
    "creditCardId" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PARSING',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "autoCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "committedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "aiModel" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "postedDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "rawText" TEXT,
    "amountCents" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "fitid" TEXT,
    "suggestedCategoryId" TEXT,
    "categoryId" TEXT,
    "memberId" TEXT,
    "state" "ImportRowState" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duplicateTxnId" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_householdId_status_idx" ON "ImportBatch"("householdId", "status");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_idx" ON "ImportRow"("batchId");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
