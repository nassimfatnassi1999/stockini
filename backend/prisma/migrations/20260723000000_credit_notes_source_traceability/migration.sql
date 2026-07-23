CREATE TYPE "SaleCreditStatus" AS ENUM ('NONE', 'PARTIAL', 'FULL');

ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'RETURN_IN';
ALTER TYPE "CaisseMovementType" ADD VALUE IF NOT EXISTS 'REFUND_OUT';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CREDIT_BALANCE';

ALTER TABLE "Sale"
  ADD COLUMN "creditedAmount" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "creditedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "creditStatus" "SaleCreditStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "effectiveTotal" DECIMAL(12,3);

ALTER TABLE "CreditNote"
  ADD COLUMN "debtReductionAmount" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "customerCreditAmount" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "refundMethod" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "originalDocumentId" TEXT,
  ADD COLUMN "consolidatedDocumentId" TEXT;

UPDATE "CreditNote" SET "originalDocumentId" = "saleId";

ALTER TABLE "CreditNoteItem"
  ADD COLUMN "originalSaleId" TEXT,
  ADD COLUMN "originalSaleItemId" TEXT,
  ADD COLUMN "sourceReference" TEXT;

UPDATE "CreditNoteItem" cni
SET "originalSaleId" = si."saleId",
    "originalSaleItemId" = si.id,
    "sourceReference" = s."invoiceNumber"
FROM "SaleItem" si
JOIN "Sale" s ON s.id = si."saleId"
WHERE cni."saleItemId" = si.id;

WITH credit_totals AS (
  SELECT cn."saleId",
         COALESCE(SUM(cn.total + cn."stampDuty"), 0) AS credited_amount
  FROM "CreditNote" cn
  WHERE cn.statut <> 'CANCELLED'
  GROUP BY cn."saleId"
),
credit_quantities AS (
  SELECT cn."saleId",
         COALESCE(SUM(cni."quantiteRetournee"), 0) AS credited_quantity
  FROM "CreditNote" cn
  JOIN "CreditNoteItem" cni ON cni."creditNoteId" = cn.id
  WHERE cn.statut <> 'CANCELLED'
  GROUP BY cn."saleId"
)
UPDATE "Sale" s
SET "creditedAmount" = ct.credited_amount,
    "creditedQuantity" = COALESCE(cq.credited_quantity, 0),
    "effectiveTotal" = GREATEST((s.total + s."stampDuty") - ct.credited_amount, 0),
    "totalCurrentTtc" = GREATEST((s.total + s."stampDuty") - ct.credited_amount, 0),
    "totalInitialTtc" = COALESCE(s."totalInitialTtc", s.total + s."stampDuty"),
    "totalRefunded" = ct.credited_amount,
    "creditStatus" = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM "SaleItem" si
        WHERE si."saleId" = s.id
          AND COALESCE((
            SELECT SUM(cni2."quantiteRetournee")
            FROM "CreditNoteItem" cni2
            JOIN "CreditNote" cn2 ON cn2.id = cni2."creditNoteId"
            WHERE cni2."saleItemId" = si.id
              AND cn2.statut <> 'CANCELLED'
          ), 0) < si.quantity
      ) THEN 'FULL'::"SaleCreditStatus"
      ELSE 'PARTIAL'::"SaleCreditStatus"
    END
FROM credit_totals ct
LEFT JOIN credit_quantities cq ON cq."saleId" = ct."saleId"
WHERE ct."saleId" = s.id;

ALTER TABLE "StockMovement"
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "creditNoteId" TEXT,
  ADD COLUMN "originalSaleId" TEXT,
  ADD COLUMN "originalSaleItemId" TEXT;

ALTER TABLE "CaisseMovement"
  ADD COLUMN "creditNoteId" TEXT,
  ADD COLUMN "paymentMethod" TEXT;

CREATE INDEX "CreditNoteItem_originalSaleId_idx" ON "CreditNoteItem"("originalSaleId");
CREATE INDEX "CreditNoteItem_originalSaleItemId_idx" ON "CreditNoteItem"("originalSaleItemId");
CREATE INDEX "CreditNote_originalDocumentId_idx" ON "CreditNote"("originalDocumentId");
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");
CREATE INDEX "StockMovement_creditNoteId_idx" ON "StockMovement"("creditNoteId");
CREATE INDEX "StockMovement_originalSaleItemId_idx" ON "StockMovement"("originalSaleItemId");
CREATE INDEX "CaisseMovement_creditNoteId_idx" ON "CaisseMovement"("creditNoteId");
