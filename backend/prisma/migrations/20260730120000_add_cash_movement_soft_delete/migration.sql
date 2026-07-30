ALTER TABLE "CaisseMovement"
  ADD COLUMN "isManualAdjustment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletionReason" TEXT;

-- These are the only historical movement types that were created directly
-- from the manual cash-operation endpoints.
UPDATE "CaisseMovement"
SET "isManualAdjustment" = true
WHERE "type" IN ('DEPOT_MANUEL', 'RETRAIT_MANUEL');

ALTER TABLE "CaisseMovement"
  ADD CONSTRAINT "CaisseMovement_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CaisseMovement_deletedAt_idx" ON "CaisseMovement"("deletedAt");
CREATE INDEX "CaisseMovement_deletedById_idx" ON "CaisseMovement"("deletedById");
CREATE INDEX "CaisseMovement_treasuryAccount_deletedAt_createdAt_id_idx"
  ON "CaisseMovement"("treasuryAccount", "deletedAt", "createdAt", "id");
