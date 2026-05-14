-- AlterTable: add document type, stock impact guard, and reserve stock flag to Sale
ALTER TABLE "Sale" ADD COLUMN "documentType" "DocumentType" NOT NULL DEFAULT 'DEVIS';
ALTER TABLE "Sale" ADD COLUMN "stockImpactDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN "reserveStock" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: all existing non-DRAFT sales were real invoices whose stock was already decremented
UPDATE "Sale" SET "documentType" = 'FACTURE', "stockImpactDone" = true
WHERE "status" <> 'DRAFT';
