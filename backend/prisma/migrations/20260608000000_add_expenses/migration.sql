-- Add general expenses with treasury/cash traceability.
ALTER TYPE "CaisseMovementType" ADD VALUE IF NOT EXISTS 'DEPENSE_GENERALE';
ALTER TYPE "CaisseMovementType" ADD VALUE IF NOT EXISTS 'ANNULATION_DEPENSE';

CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(12,3) NOT NULL,
    "paymentSource" "TreasuryAccount" NOT NULL,
    "category" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "supplierId" TEXT,
    "purchaseId" TEXT,
    "attachmentUrl" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Expense_reference_key" ON "Expense"("reference");
CREATE INDEX "Expense_paymentSource_idx" ON "Expense"("paymentSource");
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");
CREATE INDEX "Expense_supplierId_idx" ON "Expense"("supplierId");
CREATE INDEX "Expense_purchaseId_idx" ON "Expense"("purchaseId");
CREATE INDEX "Expense_status_idx" ON "Expense"("status");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CaisseMovement" ADD COLUMN "expenseId" TEXT;
CREATE INDEX "CaisseMovement_expenseId_idx" ON "CaisseMovement"("expenseId");
ALTER TABLE "CaisseMovement" ADD CONSTRAINT "CaisseMovement_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
