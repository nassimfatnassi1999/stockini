-- Additive indexes for filtered financial analytics. No business data is altered.
CREATE INDEX IF NOT EXISTS "Sale_paymentStatus_createdAt_idx"
  ON "Sale"("paymentStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditNote_dateAvoir_statut_idx"
  ON "CreditNote"("dateAvoir", "statut");
CREATE INDEX IF NOT EXISTS "Payment_type_createdAt_deletedAt_idx"
  ON "Payment"("type", "createdAt", "deletedAt");
CREATE INDEX IF NOT EXISTS "SaleItem_productId_saleId_idx"
  ON "SaleItem"("productId", "saleId");
