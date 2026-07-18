CREATE TYPE "ConsolidationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

ALTER TABLE "Sale"
  ADD COLUMN "is_consolidated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "consolidation_status" "ConsolidationStatus",
  ADD COLUMN "consolidation_note" TEXT,
  ADD COLUMN "consolidated_at" TIMESTAMP(3),
  ADD COLUMN "consolidation_cancelled_at" TIMESTAMP(3);

ALTER TABLE "SaleItem"
  ADD COLUMN "source_sale_id" TEXT,
  ADD COLUMN "source_sale_item_id" TEXT,
  ADD COLUMN "source_reference" TEXT;

CREATE TABLE "sale_consolidation_sources" (
  "id" TEXT NOT NULL,
  "consolidated_sale_id" TEXT NOT NULL,
  "source_sale_id" TEXT NOT NULL,
  "source_reference" TEXT NOT NULL,
  "source_type" "DocumentType" NOT NULL,
  "source_total" DECIMAL(12,3) NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at" TIMESTAMP(3),
  CONSTRAINT "sale_consolidation_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_consolidation_sources_consolidated_sale_id_source_sale_id_key" UNIQUE ("consolidated_sale_id", "source_sale_id"),
  CONSTRAINT "sale_consolidation_sources_consolidated_sale_id_fkey" FOREIGN KEY ("consolidated_sale_id") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_consolidation_sources_source_sale_id_fkey" FOREIGN KEY ("source_sale_id") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Sale_is_consolidated_consolidation_status_idx" ON "Sale"("is_consolidated", "consolidation_status");
CREATE INDEX "SaleItem_source_sale_id_idx" ON "SaleItem"("source_sale_id");
CREATE INDEX "sale_consolidation_sources_source_sale_id_active_idx" ON "sale_consolidation_sources"("source_sale_id", "active");
CREATE INDEX "sale_consolidation_sources_consolidated_sale_id_active_display_order_idx" ON "sale_consolidation_sources"("consolidated_sale_id", "active", "display_order");

-- A source can belong to only one active consolidation, including under concurrency.
CREATE UNIQUE INDEX "sale_consolidation_sources_one_active_source"
  ON "sale_consolidation_sources"("source_sale_id") WHERE "active" = true;

-- Existing seller roles receive the new capabilities without requiring a reseed.
UPDATE "Role"
SET "permissions" = "permissions" || '["sales.consolidate", "sales.consolidation.cancel"]'::jsonb
WHERE "name" = 'SELLER';
