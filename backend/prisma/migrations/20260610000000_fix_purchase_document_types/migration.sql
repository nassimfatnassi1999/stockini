-- ============================================================
-- Migration: fix_purchase_document_types
--
-- Problème : des achats créés via le formulaire BON_RECEPTION /
-- FACTURE ont leur documentType = BON_COMMANDE parce que
-- createPurchase() créait toujours un BON_COMMANDE et
-- receivePurchase() ne modifiait pas le documentType.
--
-- Règle de backfill :
--   status RECEIVED / PARTIALLY_RECEIVED → BON_RECEPTION
--   (la dette fournisseur est déjà activée implicitement)
--
-- Ce script est idempotent : il ne touche qu'aux lignes
-- documentType = BON_COMMANDE pour ne pas écraser les BON_RECEPTION
-- ou FACTURE_FOURNISSEUR déjà corrects.
-- ============================================================

-- 1. Corriger les BON_COMMANDE reçus (totalement ou partiellement)
UPDATE "Purchase"
SET
  "document_type"  = 'BON_RECEPTION',
  "paymentStatus"  = CASE
                       WHEN "paidAmount" >= "total" THEN 'PAID'::"PaymentStatus"
                       WHEN "paidAmount" > 0        THEN 'PARTIAL'::"PaymentStatus"
                       ELSE                              'UNPAID'::"PaymentStatus"
                     END,
  "remainingAmount" = GREATEST("total" - "paidAmount", 0)
WHERE
  "document_type" = 'BON_COMMANDE'
  AND "status"    IN ('RECEIVED', 'PARTIALLY_RECEIVED')
  AND "deletedAt" IS NULL;

-- 2. Rapport de ce qui a été corrigé (visible dans les logs de migration)
DO $$
DECLARE
  fixed_count INTEGER;
BEGIN
  GET DIAGNOSTICS fixed_count = ROW_COUNT;
  RAISE NOTICE 'fix_purchase_document_types: % achat(s) mis à jour en BON_RECEPTION.', fixed_count;
END $$;
