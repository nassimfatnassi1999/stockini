-- CreateEnum
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('SALE', 'PURCHASE', 'PAYMENT', 'EXPENSE', 'CREDIT_NOTE', 'MANUAL');

-- DropIndex
DROP INDEX "CreditNote_statut_createdAt_idx";

-- DropIndex
DROP INDEX "GeneratedDocument_documentType_status_generatedAt_idx";

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" TEXT NOT NULL,
    "type" "CashTransactionType" NOT NULL,
    "amount" DECIMAL(12,3) NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "paymentMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_transactions_type_idx" ON "cash_transactions"("type");

-- CreateIndex
CREATE INDEX "cash_transactions_direction_idx" ON "cash_transactions"("direction");

-- CreateIndex
CREATE INDEX "cash_transactions_createdAt_idx" ON "cash_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "cash_transactions_sourceType_sourceId_idx" ON "cash_transactions"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "cash_transactions_createdById_idx" ON "cash_transactions"("createdById");

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
