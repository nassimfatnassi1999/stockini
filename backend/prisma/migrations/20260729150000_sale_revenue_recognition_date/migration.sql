-- Commercial KPIs follow the instant at which a sale is validated and affects
-- stock. `createdAt` remains the document/business date and must not be reused
-- as a payment or revenue-recognition timestamp.
ALTER TABLE "Sale"
  ADD COLUMN "recognized_at" TIMESTAMP(3);

-- Historical stock-impacting documents were previously reported by createdAt.
-- Preserve their reporting period while making the rule explicit going forward.
UPDATE "Sale"
SET "recognized_at" = "createdAt"
WHERE "recognized_at" IS NULL
  AND "stockImpactDone" = true
  AND "status" IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'RETURNED')
  AND "documentType" IN ('BON_LIVRAISON', 'FACTURE');

CREATE INDEX "Sale_recognized_at_idx" ON "Sale"("recognized_at");

COMMENT ON COLUMN "Sale"."recognized_at" IS
  'Instant de validation/comptabilisation commerciale et de sortie de stock';
