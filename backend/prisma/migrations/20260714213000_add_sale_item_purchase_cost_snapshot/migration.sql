ALTER TABLE "SaleItem"
  ADD COLUMN "unit_purchase_cost_ht_snapshot" DECIMAL(12,3),
  ADD COLUMN "purchase_cost_estimated" BOOLEAN NOT NULL DEFAULT false;

-- Legacy fallback: the current product cost is the only universally available source.
-- It is explicitly flagged as estimated so analytics never presents it as certain.
UPDATE "SaleItem" si
SET "unit_purchase_cost_ht_snapshot" = p."purchasePrice",
    "purchase_cost_estimated" = true
FROM "Product" p
WHERE p.id = si."productId"
  AND si."unit_purchase_cost_ht_snapshot" IS NULL;

ALTER TABLE "CreditNoteItem"
  ADD COLUMN "stock_restocked" BOOLEAN NOT NULL DEFAULT true;
