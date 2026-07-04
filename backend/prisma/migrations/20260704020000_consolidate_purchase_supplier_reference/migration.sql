-- Preserve existing values according to the requested priority. NULLIF avoids
-- selecting empty strings over a meaningful lower-priority value.
UPDATE "Purchase"
SET "supplierReference" = COALESCE(
  NULLIF(BTRIM("supplierInvoiceNumber"), ''),
  NULLIF(BTRIM("supplierDeliveryNoteNumber"), ''),
  NULLIF(BTRIM("supplierOrderNumber"), ''),
  NULLIF(BTRIM("supplierReference"), '')
);

DROP INDEX IF EXISTS "Purchase_supplierInvoiceNumber_idx";
DROP INDEX IF EXISTS "Purchase_supplierDeliveryNoteNumber_idx";
DROP INDEX IF EXISTS "Purchase_supplierOrderNumber_idx";

ALTER TABLE "Purchase"
  DROP COLUMN "supplierInvoiceNumber",
  DROP COLUMN "supplierDeliveryNoteNumber",
  DROP COLUMN "supplierOrderNumber";

CREATE INDEX "Purchase_supplierReference_idx" ON "Purchase"("supplierReference");
