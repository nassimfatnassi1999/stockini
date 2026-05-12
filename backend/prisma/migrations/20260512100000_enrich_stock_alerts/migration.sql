ALTER TABLE "Alert"
ADD COLUMN "designation" TEXT,
ADD COLUMN "reference" TEXT,
ADD COLUMN "current_stock" INTEGER,
ADD COLUMN "minimum_stock" INTEGER;

CREATE INDEX "Alert_productId_idx" ON "Alert"("productId");
