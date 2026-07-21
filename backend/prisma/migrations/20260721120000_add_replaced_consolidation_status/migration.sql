ALTER TYPE "ConsolidationStatus" ADD VALUE IF NOT EXISTS 'REPLACED';

ALTER TABLE "Sale"
  ADD COLUMN "replaced_by_consolidation_id" TEXT,
  ADD COLUMN "replaced_at" TIMESTAMP(3);

CREATE INDEX "Sale_replaced_by_consolidation_id_idx"
  ON "Sale"("replaced_by_consolidation_id");
