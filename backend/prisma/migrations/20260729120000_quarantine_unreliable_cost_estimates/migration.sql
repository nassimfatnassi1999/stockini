-- Historical estimated snapshots were produced either from the then-current
-- Product.purchasePrice or from a legacy inverse margin formula. Neither is
-- auditable evidence of the CUMP at the stock issue date.
--
-- Preserve reliable snapshots and legal sale amounts. Quarantine only rows
-- explicitly marked estimated so the dry-run repair can reconstruct them from
-- historical receipts when deterministic; ambiguous rows remain NULL.
UPDATE "SaleItem"
SET "unit_purchase_cost_ht" = NULL
WHERE "purchase_cost_estimated" = true;

COMMENT ON COLUMN "SaleItem"."purchase_cost_estimated" IS
  'true means historical cost is unresolved; unit_purchase_cost_ht must remain NULL until evidence-based repair';
