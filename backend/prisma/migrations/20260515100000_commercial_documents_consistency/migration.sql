-- Commercial documents consistency hardening.
-- The DocumentType enum already contains:
-- DEVIS, BON_COMMANDE, BON_LIVRAISON, FACTURE, AVOIR.
-- PostgreSQL enum columns cannot contain lowercase labels such as "facture" or "devis";
-- if an older database used TEXT before this enum, clean those values before applying
-- the enum migration.

CREATE UNIQUE INDEX IF NOT EXISTS "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "GeneratedDocument_documentType_status_generatedAt_idx"
  ON "GeneratedDocument"("documentType", "status", "generatedAt");
CREATE INDEX IF NOT EXISTS "CreditNote_statut_createdAt_idx"
  ON "CreditNote"("statut", "createdAt");

-- Identify legacy mistakes created before AVOIR was routed to CreditNote.
-- These rows are intentionally left untouched: migration to CreditNote needs a source
-- FACTURE/BON_LIVRAISON, return lines and refund decision.
-- SELECT "id", "invoiceNumber", "createdAt" FROM "Sale" WHERE "documentType" = 'AVOIR';
