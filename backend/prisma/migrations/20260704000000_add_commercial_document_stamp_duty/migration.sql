ALTER TABLE "Sale" ADD COLUMN "stampDuty" DECIMAL(12,3) NOT NULL DEFAULT 1.000;
ALTER TABLE "Purchase" ADD COLUMN "stampDuty" DECIMAL(12,3) NOT NULL DEFAULT 1.000;
ALTER TABLE "CreditNote" ADD COLUMN "stampDuty" DECIMAL(12,3) NOT NULL DEFAULT 1.000;
ALTER TABLE "GeneratedDocument" ADD COLUMN "stampDuty" DECIMAL(12,3) NOT NULL DEFAULT 1.000;
ALTER TABLE "GeneratedDocument" ADD COLUMN "totalFinal" DECIMAL(12,3);

-- Existing documents receive the statutory stamp once. Their stored TTC remains
-- unchanged; only the payable balance is aligned with the new final total.
UPDATE "Sale"
SET "remainingAmount" = GREATEST("total" + "stampDuty" - "paidAmount", 0),
    "paymentStatus" = CASE
      WHEN "paymentStatus" IS NULL THEN NULL
      WHEN "paidAmount" <= 0 THEN 'UNPAID'::"PaymentStatus"
      WHEN "paidAmount" >= "total" + "stampDuty" THEN 'PAID'::"PaymentStatus"
      ELSE 'PARTIAL'::"PaymentStatus"
    END;

UPDATE "Purchase"
SET "remainingAmount" = GREATEST("total" + "stampDuty" - "paidAmount", 0),
    "paymentStatus" = CASE
      WHEN "paidAmount" <= 0 THEN 'UNPAID'::"PaymentStatus"
      WHEN "paidAmount" >= "total" + "stampDuty" THEN 'PAID'::"PaymentStatus"
      ELSE 'PARTIAL'::"PaymentStatus"
    END;

-- A refund snapshot includes the stamp whenever money or credit is issued.
UPDATE "CreditNote"
SET "montantRembourse" = CASE
  WHEN "montantRembourse" > 0 THEN "total" + "stampDuty"
  ELSE 0
END;

UPDATE "Sale" s
SET "totalRefunded" = refunds.amount,
    "totalInitialTtc" = CASE
      WHEN s."totalInitialTtc" IS NOT NULL THEN s."totalInitialTtc" + s."stampDuty"
      ELSE s."totalInitialTtc"
    END,
    "totalCurrentTtc" = CASE
      WHEN s."totalCurrentTtc" IS NOT NULL
        THEN GREATEST(s."total" + s."stampDuty" - refunds.amount, 0)
      ELSE s."totalCurrentTtc"
    END
FROM (
  SELECT "saleId", SUM("total" + "stampDuty") AS amount
  FROM "CreditNote"
  WHERE "statut" <> 'CANCELLED'::"CreditNoteStatus"
  GROUP BY "saleId"
) refunds
WHERE s.id = refunds."saleId";

UPDATE "GeneratedDocument"
SET "totalFinal" = "totalTtc" + "stampDuty"
WHERE "totalTtc" IS NOT NULL;
