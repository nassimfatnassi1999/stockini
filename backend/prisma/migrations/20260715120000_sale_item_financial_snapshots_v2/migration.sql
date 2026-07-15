-- Version 1 preserves every existing legal amount and its historical unitPrice semantics.
-- Version 2 is written only by the corrected application and means:
-- unitPrice=gross HT, finalUnitPrice=net HT, total=line net HT.
--
-- The preceding 20260714213000 migration already owns:
--   SaleItem.unit_purchase_cost_ht_snapshot
--   SaleItem.purchase_cost_estimated
--   CreditNoteItem.stock_restocked
-- Never recreate or alter those columns here.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SaleItem'
      AND column_name = 'unit_purchase_cost_ht'
  ) THEN
    ALTER TABLE "SaleItem"
      ADD COLUMN "unit_purchase_cost_ht" DECIMAL(12,3);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SaleItem'
      AND column_name = 'calculation_version'
  ) THEN
    ALTER TABLE "SaleItem"
      ADD COLUMN "calculation_version" INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Prefer the snapshot already created by the preceding migration. Dynamic SQL
-- keeps this repair safe even for an environment where that legacy column is absent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SaleItem'
      AND column_name = 'unit_purchase_cost_ht_snapshot'
  ) THEN
    EXECUTE $sql$
      UPDATE "SaleItem"
      SET "unit_purchase_cost_ht" = "unit_purchase_cost_ht_snapshot"
      WHERE "unit_purchase_cost_ht" IS NULL
        AND "unit_purchase_cost_ht_snapshot" IS NOT NULL
    $sql$;
  END IF;
END $$;

-- Fallback only for rows still lacking a snapshot. No legal amount is changed.
UPDATE "SaleItem"
SET "unit_purchase_cost_ht" = ROUND(
      "unitPrice" / (1 + (("marginPercent" - "discountPercent") / 100)),
      3
    ),
    "purchase_cost_estimated" = true
WHERE "unit_purchase_cost_ht" IS NULL
  AND "marginPercent" IS NOT NULL
  AND (1 + (("marginPercent" - "discountPercent") / 100)) > 0;

COMMENT ON COLUMN "SaleItem"."calculation_version" IS
  '1=historical semantics preserved; 2=unitPrice gross HT, finalUnitPrice net HT, multiplicative discount';
