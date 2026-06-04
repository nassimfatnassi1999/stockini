-- ============================================================
-- Migration: add PurchaseDocumentType
--
-- Règle métier:
--   BON_COMMANDE     = intention, sans dette ni stock
--   BON_RECEPTION    = réception physique, crée la dette
--   FACTURE_FOURNISSEUR = facture formelle, crée la dette
--
-- Backfill:
--   RECEIVED / PARTIALLY_RECEIVED → BON_RECEPTION (marchandise déjà reçue)
--   ORDERED / DRAFT avec paidAmount > 0 → BON_RECEPTION (déjà payé = dette réelle)
--   Reste (ORDERED/DRAFT non payé, CANCELLED) → BON_COMMANDE (défaut)
-- ============================================================

-- Abort si des paiements existent déjà sur des BC ORDERED/DRAFT non backfillés
-- (sécurité : on lève une exception si la situation est ambiguë)
DO $$
DECLARE
  bc_with_payments INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO bc_with_payments
  FROM "Purchase" p
  WHERE p."status" IN ('ORDERED', 'DRAFT')
    AND p."deletedAt" IS NULL
    AND p."paidAmount" > 0
    AND EXISTS (
      SELECT 1 FROM "Payment" pay
      WHERE pay."purchaseId" = p.id
        AND pay."deletedAt" IS NULL
    );

  IF bc_with_payments > 0 THEN
    RAISE NOTICE
      'AUDIT: % purchase(s) avec statut ORDERED/DRAFT ont des paiements liés. Ils seront backfillés en BON_RECEPTION.',
      bc_with_payments;
  END IF;
END $$;

-- 1. Créer le type enum
CREATE TYPE "PurchaseDocumentType" AS ENUM ('BON_COMMANDE', 'BON_RECEPTION', 'FACTURE_FOURNISSEUR');

-- 2. Ajouter la colonne avec défaut BON_COMMANDE
ALTER TABLE "Purchase"
  ADD COLUMN "document_type" "PurchaseDocumentType" NOT NULL DEFAULT 'BON_COMMANDE';

-- 3. Backfill: achats reçus (totalement ou partiellement) → BON_RECEPTION
UPDATE "Purchase"
SET "document_type" = 'BON_RECEPTION'
WHERE "status" IN ('RECEIVED', 'PARTIALLY_RECEIVED');

-- 4. Backfill: achats commandés déjà payés (dette réelle) → BON_RECEPTION
UPDATE "Purchase"
SET "document_type" = 'BON_RECEPTION'
WHERE "status" IN ('ORDERED', 'DRAFT')
  AND "paidAmount" > 0;

-- 5. Index pour les requêtes de filtrage (factures à payer)
CREATE INDEX "Purchase_document_type_paymentStatus_idx"
  ON "Purchase"("document_type", "paymentStatus");
