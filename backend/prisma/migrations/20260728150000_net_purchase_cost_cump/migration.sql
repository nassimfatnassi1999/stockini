-- Preserve gross supplier price and discount, while making the real net cost explicit.
ALTER TABLE "PurchaseItem"
  ALTER COLUMN "discountPercent" TYPE DECIMAL(7,3),
  ADD COLUMN "discount_amount" DECIMAL(15,3) NOT NULL DEFAULT 0,
  ADD COLUMN "unit_cost_ht_net" DECIMAL(15,3),
  ADD COLUMN "line_total_ht_net" DECIMAL(15,3);

UPDATE "PurchaseItem"
SET "discount_amount" = ROUND("unitCost" * "discountPercent" / 100, 3),
    "unit_cost_ht_net" = ROUND("unitCost" - ROUND("unitCost" * "discountPercent" / 100, 3), 3),
    "line_total_ht_net" = ROUND(ROUND("unitCost" - ROUND("unitCost" * "discountPercent" / 100, 3), 3) * quantity, 3)
WHERE "unit_cost_ht_net" IS NULL;

ALTER TABLE "StockMovement"
  ADD COLUMN "unit_cost_ht_gross" DECIMAL(15,3),
  ADD COLUMN "purchase_discount_percent" DECIMAL(7,3),
  ADD COLUMN "unit_cost_ht_net" DECIMAL(15,3),
  ADD COLUMN "total_cost_ht_net" DECIMAL(15,3);

ALTER TABLE "SaleItem"
  ALTER COLUMN "discountPercent" TYPE DECIMAL(7,3);

COMMENT ON COLUMN "Product"."purchasePrice" IS
  'CUMP HT net courant, calculé sur les entrées valorisées après remise fournisseur';
COMMENT ON COLUMN "SaleItem"."unit_purchase_cost_ht" IS
  'Snapshot historique du CUMP HT net au moment de la sortie de stock';
