-- AlterTable: add soft-delete columns
ALTER TABLE "Customer" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Sale" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Payment" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Product" ADD COLUMN "deletedBy" TEXT;

-- CreateIndex
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");
CREATE INDEX "Supplier_deletedAt_idx" ON "Supplier"("deletedAt");
CREATE INDEX "Sale_deletedAt_idx" ON "Sale"("deletedAt");
CREATE INDEX "Purchase_deletedAt_idx" ON "Purchase"("deletedAt");
CREATE INDEX "Payment_deletedAt_idx" ON "Payment"("deletedAt");
