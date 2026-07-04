ALTER TABLE "Purchase"
  ADD COLUMN "supplierInvoiceNumber" TEXT,
  ADD COLUMN "supplierDeliveryNoteNumber" TEXT,
  ADD COLUMN "supplierOrderNumber" TEXT,
  ADD COLUMN "supplierReference" TEXT;

CREATE INDEX "Purchase_supplierInvoiceNumber_idx" ON "Purchase"("supplierInvoiceNumber");
CREATE INDEX "Purchase_supplierDeliveryNoteNumber_idx" ON "Purchase"("supplierDeliveryNoteNumber");
CREATE INDEX "Purchase_supplierOrderNumber_idx" ON "Purchase"("supplierOrderNumber");
