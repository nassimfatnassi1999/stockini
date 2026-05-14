-- AlterTable: add cashImpactDone to Payment
ALTER TABLE "Payment" ADD COLUMN "cashImpactDone" BOOLEAN NOT NULL DEFAULT false;

-- Existing active payments are assumed to have already impacted caisse correctly.
-- Mark them as done so future annulations correctly reverse caisse.
UPDATE "Payment" SET "cashImpactDone" = true WHERE "deletedAt" IS NULL;

-- Performance: composite indexes on hot query paths
CREATE INDEX IF NOT EXISTS "Sale_documentType_status_createdAt_idx" ON "Sale"("documentType", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Purchase_status_createdAt_idx" ON "Purchase"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "CaisseMovement_type_createdAt_idx" ON "CaisseMovement"("type", "createdAt");
