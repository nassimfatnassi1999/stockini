-- AlterTable: add purchasePriceTtc column to Product
ALTER TABLE "Product" ADD COLUMN "purchasePriceTtc" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- Backfill: derive TTC and recalculate sale prices from existing purchasePrice (HT)
UPDATE "Product"
SET
  "purchasePriceTtc" = ROUND("purchasePrice" * 1.19, 3),
  "salePrice"        = ROUND("purchasePrice" * 1.19 * 1.4, 3);
