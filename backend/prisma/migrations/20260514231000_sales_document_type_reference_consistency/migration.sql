-- Keep the commercial document enum aligned across frontend/backend/database.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'DocumentType'
      AND e.enumlabel = 'AVOIR'
  ) THEN
    ALTER TYPE "DocumentType" ADD VALUE 'AVOIR';
  END IF;
END $$;

ALTER TABLE "Sale"
  ALTER COLUMN "documentType" SET DEFAULT 'DEVIS',
  ALTER COLUMN "documentType" SET NOT NULL,
  ALTER COLUMN "invoiceNumber" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "Sale_documentType_status_createdAt_idx" ON "Sale"("documentType", "status", "createdAt");
