ALTER TABLE "SaleItem"
ADD COLUMN "marginPercent" DECIMAL(7,3);

ALTER TABLE "SaleItem"
ADD COLUMN "tvaPercent" DECIMAL(5,2);

COMMENT ON COLUMN "SaleItem"."marginPercent" IS
'Gross margin percentage. NULL identifies legacy rows whose discount used the former multiplicative formula.';

COMMENT ON COLUMN "SaleItem"."tvaPercent" IS
'Tax rate snapshot at sale creation time. NULL uses the product rate for legacy rows.';
