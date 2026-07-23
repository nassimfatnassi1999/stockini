CREATE TYPE "SurplusDisposition" AS ENUM (
  'NONE',
  'RETURNED',
  'CUSTOMER_CREDIT',
  'CASH_SURPLUS',
  'UNRESOLVED_OVERPAYMENT'
);

ALTER TYPE "CaisseMovementType" ADD VALUE IF NOT EXISTS 'CUSTOMER_CHANGE_OUT';
ALTER TYPE "CaisseMovementType" ADD VALUE IF NOT EXISTS 'CASH_SURPLUS_IN';

ALTER TABLE "Payment"
  ADD COLUMN "amountReceived" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "amountApplied" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "changeDue" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "changeReturned" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "retainedSurplus" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "customerCreditCreated" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "remainingBefore" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "remainingAfter" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "surplusDisposition" "SurplusDisposition" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "idempotencyKey" TEXT;

-- Existing rows used `amount` as the amount applied to the document.
UPDATE "Payment"
SET "amountReceived" = "amount",
    "amountApplied" = "amount";

CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_surplusDisposition_idx" ON "Payment"("surplusDisposition");

-- Idempotent historical repair, including overpayment reached through several
-- successive payments. The surplus is preserved for administrator review.
WITH ordered AS (
  SELECT
    p."id",
    p."amount" AS received,
    ROUND(GREATEST(s."total" + s."stampDuty" - s."totalRefunded", 0), 3) AS total_payable,
    COALESCE(
      SUM(p."amount") OVER (
        PARTITION BY p."saleId"
        ORDER BY p."createdAt", p."id"
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS received_before
  FROM "Payment" p
  JOIN "Sale" s ON s."id" = p."saleId"
  WHERE p."deletedAt" IS NULL
    AND p."type" = 'CUSTOMER_PAYMENT'
), allocation AS (
  SELECT
    "id",
    received,
    ROUND(GREATEST(total_payable - received_before, 0), 3) AS remaining_before,
    ROUND(LEAST(received, GREATEST(total_payable - received_before, 0)), 3) AS applied,
    ROUND(GREATEST(received - GREATEST(total_payable - received_before, 0), 0), 3) AS surplus
  FROM ordered
)
UPDATE "Payment" p
SET "amount" = a.applied,
    "amountReceived" = a.received,
    "amountApplied" = a.applied,
    "changeDue" = a.surplus,
    "retainedSurplus" = a.surplus,
    "remainingBefore" = a.remaining_before,
    "remainingAfter" = ROUND(GREATEST(a.remaining_before - a.applied, 0), 3),
    "surplusDisposition" = CASE
      WHEN a.surplus > 0 THEN 'UNRESOLVED_OVERPAYMENT'::"SurplusDisposition"
      ELSE 'NONE'::"SurplusDisposition"
    END
FROM allocation a
WHERE p."id" = a."id";

WITH payment_totals AS (
  SELECT "saleId", ROUND(SUM("amountApplied"), 3) AS applied
  FROM "Payment"
  WHERE "deletedAt" IS NULL
    AND "type" = 'CUSTOMER_PAYMENT'
    AND "saleId" IS NOT NULL
  GROUP BY "saleId"
)
UPDATE "Sale" s
SET "paidAmount" = LEAST(
      pt.applied,
      ROUND(GREATEST(s."total" + s."stampDuty" - s."totalRefunded", 0), 3)
    ),
    "remainingAmount" = ROUND(
      GREATEST(s."total" + s."stampDuty" - s."totalRefunded" - pt.applied, 0),
      3
    ),
    "paymentStatus" = CASE
      WHEN pt.applied >= GREATEST(s."total" + s."stampDuty" - s."totalRefunded", 0)
        THEN 'PAID'::"PaymentStatus"
      WHEN pt.applied > 0 THEN 'PARTIAL'::"PaymentStatus"
      ELSE 'UNPAID'::"PaymentStatus"
    END
FROM payment_totals pt
WHERE s."id" = pt."saleId";
