-- Version 1 preserves every existing legal amount and its historical unitPrice semantics.
-- Version 2 is written only by the corrected application and means:
-- unitPrice=gross HT, finalUnitPrice=net HT, total=line net HT.
ALTER TABLE "SaleItem"
  ADD COLUMN "unit_purchase_cost_ht" DECIMAL(12,3),
  ADD COLUMN "purchase_cost_estimated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "calculation_version" INTEGER NOT NULL DEFAULT 1;

-- For the pre-fix engine, the recorded net unit price and net margin-on-cost allow
-- a cautious reconstruction of cost. It is marked estimated because legal amounts
-- were rounded to millimes. Rows without margin metadata remain NULL deliberately.
UPDATE "SaleItem"
SET "unit_purchase_cost_ht" = ROUND(
      "unitPrice" / (1 + (("marginPercent" - "discountPercent") / 100)),
      3
    ),
    "purchase_cost_estimated" = true
WHERE "marginPercent" IS NOT NULL
  AND (1 + (("marginPercent" - "discountPercent") / 100)) > 0;

ALTER TABLE "CreditNoteItem"
  ADD COLUMN "stock_restocked" BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN "SaleItem"."calculation_version" IS
  '1=historical semantics preserved; 2=unitPrice gross HT, finalUnitPrice net HT, multiplicative discount';
