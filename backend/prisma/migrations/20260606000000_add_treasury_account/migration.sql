-- CreateEnum
CREATE TYPE "TreasuryAccount" AS ENUM ('PHYSICAL_CASH', 'BANK_TREASURY');

-- AlterTable CaisseMovement: add treasuryAccount column (default PHYSICAL_CASH for all historical rows)
ALTER TABLE "CaisseMovement" ADD COLUMN "treasuryAccount" "TreasuryAccount" NOT NULL DEFAULT 'PHYSICAL_CASH';

-- AlterTable CaisseConfig: add soldeBanque + allowNegativeBanque
ALTER TABLE "CaisseConfig" ADD COLUMN "soldeBanque" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "CaisseConfig" ADD COLUMN "allowNegativeBanque" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "CaisseMovement_treasuryAccount_idx" ON "CaisseMovement"("treasuryAccount");
CREATE INDEX "CaisseMovement_treasuryAccount_createdAt_idx" ON "CaisseMovement"("treasuryAccount", "createdAt");

-- Backfill: classify existing CaisseMovements by paymentMethod of their linked Payment (if available)
-- Movements linked to a Payment via referenceDoc that has a non-CASH method → BANK_TREASURY
UPDATE "CaisseMovement" cm
SET "treasuryAccount" = 'BANK_TREASURY'
FROM "Payment" p
WHERE cm."referenceDoc" = p."reference"
  AND p."method" != 'CASH'
  AND p."deletedAt" IS NULL;
-- All others keep the default PHYSICAL_CASH
