-- A quote/order is not a receivable.  Correct legacy rows that were created
-- before the centralized payable-document policy.
UPDATE "Sale"
SET
  "paidAmount" = 0,
  "remainingAmount" = 0,
  "paymentStatus" = NULL
WHERE "documentType" IN ('DEVIS', 'BON_COMMANDE', 'AVOIR')
  AND (
    "paidAmount" <> 0
    OR "remainingAmount" <> 0
    OR "paymentStatus" IS NOT NULL
  );
