-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "autoLockEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "debtDueDate" TIMESTAMP(3),
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedByUserId" TEXT,
ADD COLUMN     "lockedReason" TEXT;

-- CreateIndex
CREATE INDEX "Customer_isLocked_idx" ON "Customer"("isLocked");
