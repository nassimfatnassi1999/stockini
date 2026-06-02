-- Fix CREDIT payment movements
-- CREDIT is not a cash/bank event. Any CaisseMovement linked to a CREDIT Payment
-- must be removed and the treasury balances corrected.
--
-- This migration is SAFE:
--   - It only soft-deletes CaisseMovements (sets clearedAt), never hard-deletes.
--   - It fixes cashImpactDone on CREDIT Payments.
--   - It adjusts CaisseConfig balances to remove the incorrect amounts.
--   - Sales, payments, avoirs and other business documents are NEVER touched.

-- Step 1: Adjust soldeBanque for BANK_TREASURY movements linked to CREDIT payments.
-- Net = IN_amounts - OUT_amounts that were incorrectly added/subtracted.
DO $$
DECLARE
  net_bank NUMERIC := 0;
BEGIN
  SELECT COALESCE(
    SUM(
      CASE
        WHEN cm.type IN ('ENCAISSEMENT_VENTE', 'DEPOT_MANUEL', 'ANNULATION_ACHAT') THEN cm.montant
        WHEN cm.type IN ('DECAISSEMENT_ACHAT', 'RETRAIT_MANUEL', 'ANNULATION_VENTE') THEN -cm.montant
        ELSE 0
      END
    ),
    0
  )
  INTO net_bank
  FROM "CaisseMovement" cm
  JOIN "Payment" p ON cm."referenceDoc" = p."reference"
  WHERE p."method" = 'CREDIT'
    AND p."deletedAt" IS NULL
    AND cm."clearedAt" IS NULL
    AND cm."treasuryAccount" = 'BANK_TREASURY';

  IF net_bank != 0 THEN
    UPDATE "CaisseConfig"
    SET "soldeBanque" = GREATEST("soldeBanque" - net_bank, 0);
  END IF;
END $$;

-- Step 2: Adjust solde (PHYSICAL_CASH) for any residual CASH movements linked to CREDIT payments.
DO $$
DECLARE
  net_cash NUMERIC := 0;
BEGIN
  SELECT COALESCE(
    SUM(
      CASE
        WHEN cm.type IN ('ENCAISSEMENT_VENTE', 'DEPOT_MANUEL', 'ANNULATION_ACHAT') THEN cm.montant
        WHEN cm.type IN ('DECAISSEMENT_ACHAT', 'RETRAIT_MANUEL', 'ANNULATION_VENTE') THEN -cm.montant
        ELSE 0
      END
    ),
    0
  )
  INTO net_cash
  FROM "CaisseMovement" cm
  JOIN "Payment" p ON cm."referenceDoc" = p."reference"
  WHERE p."method" = 'CREDIT'
    AND p."deletedAt" IS NULL
    AND cm."clearedAt" IS NULL
    AND cm."treasuryAccount" = 'PHYSICAL_CASH';

  IF net_cash != 0 THEN
    UPDATE "CaisseConfig"
    SET "solde" = GREATEST("solde" - net_cash, 0);
  END IF;
END $$;

-- Step 3: Soft-delete all CaisseMovements linked to CREDIT payments.
UPDATE "CaisseMovement" cm
SET "clearedAt" = NOW()
FROM "Payment" p
WHERE cm."referenceDoc" = p."reference"
  AND p."method" = 'CREDIT'
  AND p."deletedAt" IS NULL
  AND cm."clearedAt" IS NULL;

-- Step 4: Fix Payment.cashImpactDone = false for all CREDIT payments.
-- CREDIT payments never represent actual cash received/sent.
UPDATE "Payment"
SET "cashImpactDone" = false
WHERE "method" = 'CREDIT'
  AND "deletedAt" IS NULL;
